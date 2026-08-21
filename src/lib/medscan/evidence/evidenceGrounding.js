/**
 * MedScan — Evidence Grounding Orchestrator
 *
 * מחבר בין הממצאים הקליניים לבין ספרות אמיתית מ-PubMed.
 *
 * ## המכשול: הממצאים בעברית, PubMed מחפש באנגלית
 *
 * הפתרון הוא קריאת-LLM ייעודית שממירה ממצאים למונחי חיפוש באנגלית.
 *
 * ## למה זה בטוח — ולמה זו אינה חריגה מהעיקרון
 *
 * זו הקריאה היחידה בכל המערכת שאינה עוברת דרך `groundedInvoke`, וזה
 * מכוון. ההבחנה: **המודל כאן אינו מייצר טענה קלינית — הוא מייצר
 * מחרוזת חיפוש.**
 *
 * גם אם ימציא מונח לגמרי, התוצאה תהיה שאילתה גרועה שמחזירה מאמרים
 * לא-רלוונטיים או כלום. היא **לא יכולה** להחזיר מאמר שגוי, כי המאמרים
 * מגיעים מ-PubMed ולא מהמודל. השאילתה משפיעה על *רלוונטיות*, לעולם לא
 * על *אמיתות*.
 *
 * זה בדיוק ההבדל בין "המודל בוחר מה לחפש" (בטוח) לבין "המודל אומר מה
 * נמצא" (מסוכן). רק השני הוא הזיה.
 */

import { searchLiterature, buildQuery } from './pubmedClient.js';

/** סכמה לחילוץ מונחי חיפוש. פלט מובנה גם כאן — אין יוצא מן הכלל. */
export const SEARCH_TERMS_SCHEMA = {
  type: 'object',
  properties: {
    primary_terms_en: {
      type: 'array',
      description: 'מונחים רפואיים באנגלית שמתארים את הממצא המרכזי. עדיפות למונחי MeSH.',
      items: { type: 'string' },
      minItems: 1,
      maxItems: 4,
    },
    condition_terms_en: {
      type: 'array',
      description: 'שמות מצבים/מחלות באנגלית שהממצא עשוי להתאים להם',
      items: { type: 'string' },
      maxItems: 3,
    },
    untranslatable_he: {
      type: 'array',
      description: 'ממצאים שלא הצלחת להמיר למונח רפואי מוכר. עדיף להצהיר מאשר להמציא.',
      items: { type: 'string' },
    },
  },
  required: ['primary_terms_en'],
};

const TERMS_SYSTEM_PROMPT = `אתה ממיר ממצאים קליניים בעברית למונחי חיפוש רפואיים באנגלית עבור PubMed.

אינך מאבחן, אינך מפרש, ואינך מוסיף מידע קליני. אתה מתרגם בלבד.

כללים:
1. השתמש במונחי MeSH מקובלים כשאתה מכיר אותם ("pulmonary infiltrate", "pleural effusion").
2. אל תרחיב מעבר לממצא. "תסנין" → "infiltrate" / "consolidation", ולא "pneumonia" —
   אלא אם המצב נאמר במפורש בממצא.
3. ממצא שאינך מצליח להמיר למונח רפואי מוכר — הכנס ל-untranslatable_he.
   אל תנחש תרגום. שאילתה חסרה עדיפה על שאילתה שגויה.
4. החזר JSON בלבד.`;

/**
 * ממיר ממצאים למונחי חיפוש.
 * @returns {Promise<{terms: string[], conditions: string[], untranslatable: string[], error: string|null}>}
 */
export async function buildSearchTerms({ findings = [], invokeLLM, extraContext = null }) {
  if (!findings.length) {
    return { terms: [], conditions: [], untranslatable: [], error: 'no_findings' };
  }

  try {
    const result = await invokeLLM({
      system: TERMS_SYSTEM_PROMPT,
      prompt: [
        'המר את הממצאים הבאים למונחי חיפוש רפואיים באנגלית:',
        ...findings.map((f, i) => `${i + 1}. ${f}`),
        extraContext ? `\nהקשר: ${JSON.stringify(extraContext)}` : '',
      ].join('\n'),
      schema: SEARCH_TERMS_SCHEMA,
      purpose: 'search_terms',
    });

    return {
      terms: result?.primary_terms_en ?? [],
      conditions: result?.condition_terms_en ?? [],
      untranslatable: result?.untranslatable_he ?? [],
      error: null,
    };
  } catch (e) {
    return { terms: [], conditions: [], untranslatable: [], error: String(e?.message ?? e) };
  }
}

/** ממפה גיל בימים ל-scope של PubMed. */
export function ageScopeFromDays(ageDays) {
  const d = Number(ageDays);
  if (!Number.isFinite(d)) return 'all';
  if (d <= 28) return 'neonate';
  if (d <= 365) return 'infant';
  if (d <= 4383) return 'child';
  return 'adolescent';
}

/**
 * הזרימה המלאה: ממצאים → מונחים → שליפה → פריטי L#.
 *
 * @returns {Promise<{literature: object[], meta: object}>}
 *          `meta` מוחזר תמיד ומוצג לרופא/ה — כולל כשלים.
 *          שליפה שנכשלה בשקט היא הגרוע מכל: הפלט ייראה
 *          מבוסס-ספרות בזמן שאין ספרות בכלל.
 */
export async function retrieveEvidence({
  findings = [],
  patient = {},
  invokeLLM,
  fetchImpl = globalThis.fetch,
  maxResults = 5,
  minYear = null,
  extraContext = null,
}) {
  const meta = {
    attempted: true,
    query: null,
    terms: [],
    untranslatable: [],
    total_found: 0,
    retrieved: 0,
    error: null,
    note_he: null,
  };

  if (!findings.length) {
    meta.attempted = false;
    meta.note_he = 'לא בוצעה שליפת ספרות: לא סופקו ממצאים.';
    return { literature: [], meta };
  }

  // שלב 1 — מונחים באנגלית
  const t = await buildSearchTerms({ findings, invokeLLM, extraContext });
  meta.terms = t.terms;
  meta.untranslatable = t.untranslatable;

  if (t.error || !t.terms.length) {
    meta.error = t.error ?? 'no_terms';
    meta.note_he =
      'לא ניתן היה לגזור מונחי חיפוש מהממצאים, ולכן לא נשלפה ספרות. ' +
      'הפלט אינו נתמך בספרות.';
    return { literature: [], meta };
  }

  // שלב 2 — שאילתה + שליפה
  const query = buildQuery({
    findings: t.terms,
    ageScope: ageScopeFromDays(patient.age_days),
    extraTerms: t.conditions.slice(0, 1),
  });
  meta.query = query;

  const res = await searchLiterature({ query, maxResults, fetchImpl, minYear });
  meta.total_found = res.total;
  meta.retrieved = res.articles.length;
  meta.error = res.error;

  if (res.error) {
    meta.note_he =
      `שליפת הספרות נכשלה (${res.error}). הפלט אינו נתמך בספרות — ` +
      'אין להסיק מכך שאין ספרות רלוונטית.';
  } else if (!res.articles.length) {
    meta.note_he =
      'לא נמצאו מאמרים תואמים ב-PubMed לשאילתה שנבנתה. ' +
      'ייתכן שהשאילתה צרה מדי — היעדר תוצאות אינו ראיה להיעדר ספרות.';
  } else {
    const tiers = res.articles.map((a) => a.evidence.label_he);
    meta.note_he = `נשלפו ${res.articles.length} מאמרים מ-PubMed. סוגי ראיה: ${[...new Set(tiers)].join(', ')}.`;
  }

  if (t.untranslatable.length) {
    meta.note_he += ` ממצאים שלא הומרו למונח חיפוש: ${t.untranslatable.join(', ')}.`;
  }

  return { literature: res.articles, meta };
}
