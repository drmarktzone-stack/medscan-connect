/**
 * MedScan — PubMed Retrieval Client (NCBI E-utilities)
 *
 * שליפת ספרות **אמיתית**. לא ידע מהמודל, לא זיכרון — קריאה ל-NCBI
 * וקבלת מאמרים שקיימים, עם PMID ו-DOI שניתן לפתוח ולבדוק.
 *
 * ## למה זה קיים
 * זהו החלק שסוגר את הפער בין "כלי שנשמע מבוסס" לבין "כלי שניתן לבדוק".
 * הרופא/ה יכול/ה ללחוץ על הקישור ולראות את המאמר. זה מה שהופך את
 * הפלט לבר-הפרכה בפועל, ולא רק בהצהרה.
 *
 * ## ההיררכיה של חוזק ראיה
 * לא כל מאמר שווה. הדירוג כאן דטרמיניסטי ומבוסס על סוג הפרסום —
 * לא על שיקול דעת של מודל.
 *
 * ## הערת טרנספורט
 * ה-transport מוזרק (`fetchImpl`) כדי שהמודול יהיה בר-בדיקה בלי רשת.
 * NCBI E-utilities תומך ב-CORS לקריאות דפדפן. אם מדיניות רשת חוסמת —
 * יש להעביר `fetchImpl` שעובר דרך פונקציית Backend.
 */

const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

/**
 * דירוג חוזק ראיה לפי סוג פרסום. דטרמיניסטי לחלוטין.
 * הסולם מקובל בהיררכיית הראיות: סקירות שיטתיות ומטא-אנליזות מעל
 * ניסויים מבוקרים, מעל תצפיתי, מעל דיווח מקרה.
 */
export const EVIDENCE_TIERS = [
  { match: /systematic review|meta-analysis/i, tier: 1, label_he: 'סקירה שיטתית / מטא-אנליזה' },
  { match: /practice guideline|guideline/i,    tier: 1, label_he: 'הנחיה קלינית' },
  { match: /randomized controlled trial/i,     tier: 2, label_he: 'ניסוי מבוקר אקראי' },
  { match: /clinical trial/i,                  tier: 3, label_he: 'ניסוי קליני' },
  { match: /review/i,                          tier: 4, label_he: 'סקירה' },
  { match: /observational|cohort|case-control/i, tier: 5, label_he: 'מחקר תצפיתי' },
  { match: /case reports?/i,                   tier: 7, label_he: 'דיווח מקרה' },
];

const DEFAULT_TIER = { tier: 6, label_he: 'מאמר מחקרי' };

export function classifyEvidence(articleTypes = []) {
  const joined = articleTypes.join(' ');
  for (const t of EVIDENCE_TIERS) {
    if (t.match.test(joined)) return { tier: t.tier, label_he: t.label_he };
  }
  return { ...DEFAULT_TIER };
}

/** בונה שאילתת PubMed מממצאים קליניים. */
export function buildQuery({ findings = [], ageScope = 'child', extraTerms = [] }) {
  const terms = [...findings, ...extraTerms]
    .map((f) => String(f ?? '').trim())
    .filter((f) => f.length >= 3)
    .slice(0, 4);

  if (!terms.length) return null;

  const ageFilter = {
    neonate: 'infant, newborn[MeSH]',
    infant: 'infant[MeSH]',
    child: 'child[MeSH]',
    adolescent: 'adolescent[MeSH]',
    all: 'pediatrics[MeSH]',
  }[ageScope] ?? 'pediatrics[MeSH]';

  const core = terms.map((t) => `"${t.replace(/"/g, '')}"`).join(' AND ');
  return `(${core}) AND (${ageFilter})`;
}

async function callEutils(fetchImpl, path, params) {
  const url = new URL(`${EUTILS}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  const res = await fetchImpl(url.toString());
  if (!res.ok) throw new Error(`NCBI ${path} returned ${res.status}`);
  return res;
}

/**
 * מחפש ומחזיר מאמרים אמיתיים.
 *
 * @param {object} params
 * @param {string} params.query
 * @param {number} [params.maxResults]
 * @param {function} [params.fetchImpl]
 * @param {number} [params.minYear] סינון מאמרים ישנים מדי
 * @returns {Promise<{articles: object[], total: number, query: string, error: string|null}>}
 */
export async function searchLiterature({
  query,
  maxResults = 6,
  fetchImpl = globalThis.fetch,
  minYear = null,
}) {
  if (!query) return { articles: [], total: 0, query: null, error: 'empty_query' };
  if (typeof fetchImpl !== 'function') {
    return { articles: [], total: 0, query, error: 'no_fetch_transport' };
  }

  try {
    // שלב 1 — esearch: מקבלים PMIDs
    const searchRes = await callEutils(fetchImpl, 'esearch.fcgi', {
      db: 'pubmed',
      term: query,
      retmax: maxResults,
      retmode: 'json',
      sort: 'relevance',
    });
    const searchJson = await searchRes.json();
    const pmids = searchJson?.esearchresult?.idlist ?? [];
    const total = Number(searchJson?.esearchresult?.count ?? 0);

    if (!pmids.length) return { articles: [], total, query, error: null };

    // שלב 2 — esummary: מטא-דאטה אמיתית לכל PMID
    const sumRes = await callEutils(fetchImpl, 'esummary.fcgi', {
      db: 'pubmed',
      id: pmids.join(','),
      retmode: 'json',
    });
    const sumJson = await sumRes.json();
    const result = sumJson?.result ?? {};

    const articles = pmids
      .map((pmid) => normalizeArticle(result[pmid], pmid))
      .filter(Boolean)
      .filter((a) => (minYear ? (a.year ?? 0) >= minYear : true));

    // מיון לפי חוזק ראיה, ובתוך אותה דרגה — לפי עדכניות
    articles.sort((a, b) => (a.evidence.tier - b.evidence.tier) || ((b.year ?? 0) - (a.year ?? 0)));

    return { articles, total, query, error: null };
  } catch (e) {
    // כשל שליפה אינו מפיל ניתוח — הוא מדווח, והפלט ממשיך בלי ספרות.
    return { articles: [], total: 0, query, error: String(e?.message ?? e) };
  }
}

/** ממיר רשומת esummary למבנה פנימי. מחזיר null אם חסר מזהה. */
function normalizeArticle(raw, pmid) {
  if (!raw || raw.error) return null;

  const doi =
    (raw.articleids ?? []).find((a) => a.idtype === 'doi')?.value ??
    raw.elocationid?.replace(/^doi:\s*/i, '') ??
    null;

  const year = Number(String(raw.pubdate ?? '').match(/\d{4}/)?.[0]) || null;
  const articleTypes = raw.pubtype ?? [];

  return {
    pmid: String(pmid),
    doi: doi ? String(doi).trim() : null,
    title: raw.title?.replace(/\.$/, '') ?? '(ללא כותרת)',
    journal: raw.fulljournalname ?? raw.source ?? null,
    year,
    authors: (raw.authors ?? []).map((a) => a.name).filter(Boolean),
    article_types: articleTypes,
    evidence: classifyEvidence(articleTypes),
    url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
    doi_url: doi ? `https://doi.org/${doi}` : null,
  };
}

/**
 * מאמת מזהה מול PubMed: האם ה-PMID מפנה למאמר עם הכותרת הנטענת.
 *
 * זהו קו ההגנה השני. הראשון הוא שהמודל בכלל לא מייצר ציטוטים —
 * אבל אם ציטוט הגיע ממקור אחר (הזנה ידנית, ייבוא), זו הבדיקה
 * שתופסת את הדפוס "מזהה אמיתי + כותרת מומצאת".
 */
export async function verifyPmid({ pmid, claimedTitle, fetchImpl = globalThis.fetch }) {
  if (!pmid) return { verdict: 'not_found', reason_he: 'לא סופק PMID.' };
  if (typeof fetchImpl !== 'function') {
    return { verdict: 'unchecked', reason_he: 'אין טרנספורט לאימות מול PubMed.' };
  }

  try {
    const res = await callEutils(fetchImpl, 'esummary.fcgi', {
      db: 'pubmed', id: pmid, retmode: 'json',
    });
    const json = await res.json();
    const raw = json?.result?.[String(pmid)];
    if (!raw || raw.error) {
      return { verdict: 'not_found', reason_he: `PMID ${pmid} אינו קיים ב-PubMed.` };
    }

    const actual = normalizeArticle(raw, pmid);
    if (!claimedTitle) return { verdict: 'resolved', article: actual };

    const sim = titleSimilarity(claimedTitle, actual.title);
    if (sim >= 0.7) return { verdict: 'matched', article: actual, similarity: sim };

    return {
      verdict: 'mismatch',
      article: actual,
      similarity: sim,
      reason_he:
        `PMID ${pmid} קיים, אך הוא מפנה למאמר "${actual.title}" ולא לכותרת שנטענה ` +
        `("${claimedTitle}"). זהו דפוס הזיית-הציטוט הנפוץ ביותר: מזהה אמיתי עם כותרת מומצאת.`,
    };
  } catch (e) {
    return { verdict: 'unchecked', reason_he: `אימות נכשל: ${e?.message ?? e}` };
  }
}

/** דמיון כותרות — Jaccard על מילים משמעותיות. פשוט ומספיק לזיהוי החלפה. */
export function titleSimilarity(a, b) {
  const norm = (s) =>
    new Set(
      String(s ?? '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/).filter((w) => w.length > 3)
    );
  const A = norm(a);
  const B = norm(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter += 1;
  return inter / (A.size + B.size - inter);
}
