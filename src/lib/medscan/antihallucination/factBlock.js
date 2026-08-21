/**
 * MedScan — FACT BLOCK Builder
 * מנגנון 1 (Grounding חובה) + מנגנון 5 (Source Attribution)
 *
 * העיקרון: ה-LLM לא מקבל "הקשר" בפרוזה. הוא מקבל **רשימה ממוספרת וסגורה**
 * של עובדות, ערכים מחושבים ומדידות מטופל. כל טענה שהוא יפיק חייבת להצביע
 * על מזהה מתוך הרשימה הזו. מה שאין לו מזהה — אין לו קיום.
 *
 * זה מה שמאפשר לוולידטורים (validators.js, numericGuard.js) לעבוד:
 * יש קבוצה סופית וידועה של מה שמותר לומר.
 *
 * מזהים:
 *   F#  — עובדה קלינית מה-KB (נלסון)
 *   D#  — ערך שחושב בקוד דטרמיניסטי
 *   P#  — מדידה/ממצא של המטופל בפועל
 *   L#  — מאמר שנשלף בפועל מ-PubMed (ספרות)
 *
 * ## למה L# קיים
 * ההזיה הנפוצה ביותר בציטוטים היא **מזהה אמיתי עם כותרת מומצאת** —
 * ה-DOI נפתח יפה, והמאמר שמאחוריו אחר לגמרי. בדיקת ציטוט בדיעבד
 * תופסת את זה **אחרי** שנוצר. לכן העיקרון כאן הפוך:
 *
 *   **המודל לעולם אינו מייצר ציטוט. הוא רק מפנה ל-L# שנשלף בפועל.**
 *
 * שליפה-אז-הפניה, ולא יצירה-אז-אימות. זה הופך ציטוט מומצא לבלתי-אפשרי
 * במקום לניתן-לגילוי.
 */

import { attachLiteratureCitation } from '../knowledge/approvedLiterature.js';

/** רק ידע מאומת נכנס לפלט קליני. טיוטה נכנסת רק במצב פיתוח, ומסומנת. */
export const VERIFICATION_POLICY = {
  clinical: ['verified'],
  development: ['verified', 'draft_needs_verification'],
};

/**
 * חוסם קשיח: פריט ידע שאינו מאומת לא יכול לייצר חשד "אדום".
 * כל עוד `nelson-knowledge.pdf` לא יובא ואומת, זו ההגנה המרכזית שלנו
 * מפני "ביטחון גבוה על בסיס ידע לא-מאומת".
 */
export const DRAFT_SUSPICION_CEILING = 'yellow';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * מסנן פריטי KB לפי מדיניות אימות.
 * @returns {{admitted: object[], rejected: object[]}}
 */
export function filterByVerification(items = [], mode = 'clinical') {
  const allowed = VERIFICATION_POLICY[mode] ?? VERIFICATION_POLICY.clinical;
  const admitted = [];
  const rejected = [];
  for (const item of items) {
    const status = item?.verification_status ?? 'draft_needs_verification';
    // `flagged` = סומן כשגוי ע"י רופא/ה. לעולם לא נכנס, בשום מצב.
    if (status === 'flagged') {
      rejected.push({ item, why: 'flagged_by_reviewer' });
      continue;
    }
    if (allowed.includes(status)) admitted.push(item);
    else rejected.push({ item, why: `verification_status=${status}` });
  }
  return { admitted, rejected };
}

/** ניסוח שורת-עובדה מפריט KB, לפי סוגו. גוף השורה הוא מה שה-LLM יראה. */
function renderKbFact(item) {
  const parts = [];
  if (item.title_he) parts.push(item.title_he);

  if (item.conclusion_he) parts.push(`מסקנה: ${item.conclusion_he}`);
  if (item.direction_he) parts.push(`כיוון: ${item.direction_he}`);
  if (item.implies_he) parts.push(`מרמז על: ${item.implies_he}`);
  if (item.anchor_finding_he) parts.push(`ממצא-עוגן: ${item.anchor_finding_he}`);
  if (Array.isArray(item.co_findings) && item.co_findings.length) {
    parts.push(`ממצאים נלווים: ${item.co_findings.join('; ')}`);
  }
  if (Array.isArray(item.components) && item.components.length) {
    const comps = item.components
      .map((c) => `${c.analyte}=${c.direction}${c.note_he ? ` (${c.note_he})` : ''}`)
      .join('; ');
    parts.push(`רכיבי הדפוס: ${comps}`);
  }
  if (item.clinical_reasoning_he) parts.push(`היגיון: ${item.clinical_reasoning_he}`);
  if (item.mechanism_he) parts.push(`מנגנון: ${item.mechanism_he}`);
  if (Array.isArray(item.confirm_with_he) && item.confirm_with_he.length) {
    parts.push(`לאישוש: ${item.confirm_with_he.join('; ')}`);
  }
  if (Array.isArray(item.recommended_workup_he) && item.recommended_workup_he.length) {
    parts.push(`בירור מומלץ: ${item.recommended_workup_he.join('; ')}`);
  }
  if (item.action_he) parts.push(`פעולה: ${item.action_he}`);
  if (item.active_step_id) {
    parts.push(`שלב פעיל: ${item.active_step_title_he ?? item.active_step_id}`);
  }
  if (item.category) parts.push(`קטגוריית מסלול: ${item.category}`);
  if (item.local_protocol_ref) parts.push(`פרוטוקול מקומי: ${item.local_protocol_ref}`);
  if (item.summary_he) parts.push(item.summary_he);
  if (item.literature_citation?.display_he) {
    parts.push(`ספרות: ${item.literature_citation.display_he}`);
  }

  return parts.filter(Boolean).join(' | ');
}

/**
 * בונה את ה-FACT BLOCK.
 *
 * @param {object} input
 * @param {object[]} input.kbItems       פריטי KB שהותאמו דטרמיניסטית
 * @param {object[]} input.deterministic ערכים מחושבים בקוד
 * @param {object[]} input.patientData   מדידות/ממצאים
 * @param {string}  input.mode           'clinical' | 'development'
 */
export function buildFactBlock({
  kbItems = [],
  deterministic = [],
  patientData = [],
  literature = [],
  mode = 'clinical',
} = {}) {
  const { admitted, rejected } = filterByVerification(kbItems, mode);

  const facts = [];
  const index = new Map();
  const anchors = new Set();
  const allowedNumbers = new Set();
  // מזהי הציטוטים שנשלפו בפועל — קבוצה סגורה.
  // כל מזהה בפלט שאינו כאן הוא המצאה, ללא יוצא מן הכלל.
  const citations = new Set();

  const register = (fact) => {
    facts.push(fact);
    index.set(fact.id, fact);
    if (fact.source_anchor) anchors.add(fact.source_anchor);
    for (const a of fact.extra_anchors ?? []) if (a) anchors.add(a);
    for (const n of extractNumbers(fact.text)) allowedNumbers.add(n);
    return fact;
  };

  // ── F# : עובדות KB ──────────────────────────────────────────────────────
  admitted.forEach((item, i) => {
    const draft = (item.verification_status ?? 'draft_needs_verification') !== 'verified';
    const withLit = attachLiteratureCitation(item);
    register({
      id: `F${i + 1}`,
      kind: 'kb',
      text: renderKbFact(withLit),
      source_anchor: item.source_anchor ?? item.topic_key ?? null,
      extra_anchors: item.extra_anchors ?? [],
      literature_citation: withLit.literature_citation ?? null,
      literature_ok: Boolean(withLit.literature_ok),
      entity_key:
        item.rule_key ?? item.pattern_key ?? item.assoc_key ?? item.flag_key ??
        item.pathway_key ?? item.protocol_key ?? item.topic_key ?? null,
      kb_suspicion: item.suspicion ?? null,
      is_draft: draft,
      verification_status: item.verification_status ?? 'draft_needs_verification',
    });
  });

  // ── D# : ערכים דטרמיניסטיים ─────────────────────────────────────────────
  deterministic.forEach((d, i) => {
    const valueText = isNum(d.value) ? formatNumber(d.value) : String(d.value ?? '');
    register({
      id: `D${i + 1}`,
      kind: 'deterministic',
      text: `${d.label_he ?? d.key}: ${valueText}${d.unit ? ` ${d.unit}` : ''}` +
        (d.formula_source ? ` [נוסחה: ${d.formula_source}]` : ''),
      source_anchor: d.formula_source ?? null,
      entity_key: d.key ?? null,
      is_draft: false,
      verification_status: 'verified',
      raw_value: d.value,
      unit: d.unit ?? null,
    });
  });

  // ── P# : נתוני מטופל ────────────────────────────────────────────────────
  patientData.forEach((p, i) => {
    const valueText = isNum(p.value) ? formatNumber(p.value) : String(p.value ?? '');
    const flagText = p.flag && p.flag !== 'normal' ? ` [${p.flag}]` : '';
    const refText =
      isNum(p.ref_low) || isNum(p.ref_high)
        ? ` (טווח ייחוס: ${isNum(p.ref_low) ? formatNumber(p.ref_low) : '—'}–${isNum(p.ref_high) ? formatNumber(p.ref_high) : '—'})`
        : '';
    register({
      id: `P${i + 1}`,
      kind: 'patient',
      text: `${p.label_he ?? p.key}: ${valueText}${p.unit ? ` ${p.unit}` : ''}${flagText}${refText}`,
      source_anchor: null,
      entity_key: p.key ?? null,
      is_draft: false,
      verification_status: 'measured',
      raw_value: p.value,
      unit: p.unit ?? null,
      flag: p.flag ?? null,
    });
  });

  // ── L# : ספרות שנשלפה בפועל ──────────────────────────────
  literature.forEach((lit, i) => {
    const authors = Array.isArray(lit.authors) && lit.authors.length
      ? `${lit.authors[0]}${lit.authors.length > 1 ? ' et al.' : ''}`
      : '—';
    const ids = [
      lit.pmid ? `PMID ${lit.pmid}` : null,
      lit.doi ? `DOI ${lit.doi}` : null,
    ].filter(Boolean).join(' | ');

    if (lit.pmid) citations.add(String(lit.pmid));
    if (lit.doi) citations.add(String(lit.doi).toLowerCase());

    register({
      id: `L${i + 1}`,
      kind: 'literature',
      text: `"${lit.title}" — ${authors}, ${lit.journal ?? '—'} ${lit.year ?? ''} [${ids}]` +
        (lit.abstract ? `\n     תקציר: ${lit.abstract}` : ''),
      source_anchor: lit.doi ? `doi:${lit.doi}` : (lit.pmid ? `pmid:${lit.pmid}` : null),
      entity_key: lit.pmid ?? lit.doi ?? null,
      is_draft: false,
      verification_status: 'retrieved',
      pmid: lit.pmid ?? null,
      doi: lit.doi ?? null,
      article_types: lit.article_types ?? [],
      year: lit.year ?? null,
    });
  });

  const text = renderFactBlockText(facts, mode);
  const hasVerifiedClinicalContent = facts.some((f) => f.kind === 'kb' && !f.is_draft);

  // חשוב להבחנה בין שני סירובים שונים: "אין ידע בכלל" מול "יש ידע שטרם אומת".
  // השני ניתן לתיקון ע"י אימות רפואי; הראשון דורש ייבוא פרק מנלסון.
  // בלי הספירה הזו שני המצבים נראים זהים למעלה, וההכוונה לרופא/ה נעלמת.
  const draftRejectedCount = rejected.filter(
    (r) => r.why === 'verification_status=draft_needs_verification'
  ).length;

  return {
    text,
    facts,
    index,
    allowedNumbers,
    anchors,
    rejected,
    draftRejectedCount,
    citations,
    isEmpty: facts.length === 0,
    hasKbContent: facts.some((f) => f.kind === 'kb'),
    hasLiterature: facts.some((f) => f.kind === 'literature'),
    hasVerifiedClinicalContent,
    mode,
  };
}

/** הטקסט שנשלח ל-LLM. סגור, ממוספר, ומצהיר במפורש שהוא הגבול. */
export function renderFactBlockText(facts, mode = 'clinical') {
  if (!facts.length) {
    return [
      '=== FACT BLOCK ===',
      '(ריק — לא נמצא ידע מאומת רלוונטי לקלט זה)',
      '=== END FACT BLOCK ===',
    ].join('\n');
  }

  const lines = ['=== FACT BLOCK ==='];
  lines.push(
    'זהו גבול הידע שלך לתשובה זו. כל טענה שתפיק חייבת להצביע על מזהה מכאן (F#/D#/P#).',
    'מה שאינו כאן — אינך יודע. אמור זאת במפורש במקום להשלים.',
    ''
  );

  const groups = [
    ['F', 'עובדות קליניות (נלסון / KB)'],
    ['D', 'ערכים שחושבו בקוד דטרמיניסטי — צטט כפי שהם, אל תחשב מחדש'],
    ['P', 'נתוני המטופל בפועל'],
    ['L', 'ספרות שנשלפה מ-PubMed — צטט אך ורק לפי L#. אל תכתוב PMID/DOI בעצמך'],
  ];

  for (const [prefix, heading] of groups) {
    const group = facts.filter((f) => f.id.startsWith(prefix));
    if (!group.length) continue;
    lines.push(`--- ${heading} ---`);
    for (const f of group) {
      const meta = [];
      if (f.source_anchor) meta.push(`מקור: ${f.source_anchor}`);
      if (f.extra_anchors?.length) meta.push(`מקורות נוספים: ${f.extra_anchors.join(', ')}`);
      if (f.literature_citation?.display_he) meta.push(f.literature_citation.display_he);
      if (f.is_draft) meta.push('⚠ טיוטה לא-מאומתת');
      const metaText = meta.length ? ` {${meta.join(' | ')}}` : '';
      lines.push(`[${f.id}]${metaText} ${f.text}`);
    }
    lines.push('');
  }

  if (mode === 'development') {
    lines.push('⚠ מצב פיתוח: כלולים פריטים לא-מאומתים. אסור לשימוש קליני.', '');
  }

  lines.push('=== END FACT BLOCK ===');
  return lines.join('\n');
}

/** נרמול מספר לצורה קנונית להשוואה (22.40 → 22.4). */
export function formatNumber(n) {
  if (!isNum(n)) return String(n);
  return String(Number(n.toFixed(6)));
}

/**
 * מחלץ כל אסימון מספרי מטקסט ומנרמל אותו.
 * משמש גם לבניית ה-allowlist וגם ל-numericGuard.
 * מטפל בפסיקי-אלפים ובנקודה עשרונית; מתעלם מסימן.
 */
export function extractNumbers(text) {
  if (!text) return [];
  const out = new Set();
  const matches = String(text).match(/\d[\d,]*(?:\.\d+)?/g) ?? [];
  for (const raw of matches) {
    const cleaned = raw.replace(/,/g, '');
    const n = Number(cleaned);
    if (!Number.isFinite(n)) continue;
    out.add(formatNumber(n));
  }
  return [...out];
}
