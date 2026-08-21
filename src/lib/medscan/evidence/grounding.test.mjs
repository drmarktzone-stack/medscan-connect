/**
 * MedScan — בדיקות תזמור שליפת הספרות
 *
 * הרצה:  node src/lib/medscan/evidence/grounding.test.mjs
 */

import { retrieveEvidence, buildSearchTerms, ageScopeFromDays } from './evidenceGrounding.js';

let pass = 0, fail = 0;
const fails = [];
const t = async (n, f) => {
  try { await f(); pass += 1; console.log(`  ✓ ${n}`); }
  catch (e) { fail += 1; fails.push(`${n}: ${e.message}`); console.log(`  ✗ ${n}\n      ${e.message}`); }
};
const ok = (c, m) => { if (!c) throw new Error(m || 'failed'); };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || 'eq'}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };

/** LLM מדומה שמחזיר מונחי חיפוש. */
const termsLLM = (out) => async ({ purpose }) => {
  if (purpose !== 'search_terms') throw new Error(`unexpected purpose ${purpose}`);
  return out;
};

/** fetch מדומה של NCBI. */
function ncbiFetch({ ids = [], summaries = {} }) {
  return async (url) => {
    if (url.includes('esearch')) {
      return {
        ok: true,
        json: async () => ({ esearchresult: { idlist: ids, count: String(ids.length) } }),
      };
    }
    return { ok: true, json: async () => ({ result: summaries }) };
  };
}

console.log('\nתזמור שליפת ספרות\n');

await t('מיפוי גיל ל-scope', async () => {
  eq(ageScopeFromDays(14), 'neonate');
  eq(ageScopeFromDays(200), 'infant');
  eq(ageScopeFromDays(1460), 'child');
  eq(ageScopeFromDays(5000), 'adolescent');
  eq(ageScopeFromDays(undefined), 'all');
});

await t('המרת ממצאים עבריים למונחי חיפוש', async () => {
  const r = await buildSearchTerms({
    findings: ['תסנין באונה תחתונה ימנית'],
    invokeLLM: termsLLM({
      primary_terms_en: ['pulmonary infiltrate', 'consolidation'],
      condition_terms_en: ['pneumonia'],
      untranslatable_he: [],
    }),
  });
  eq(r.terms.length, 2);
  eq(r.error, null);
});

await t('ממצא שלא ניתן להמרה מוצהר ולא מנוחש', async () => {
  const r = await buildSearchTerms({
    findings: ['ממצא לא ברור'],
    invokeLLM: termsLLM({
      primary_terms_en: ['chest radiograph'],
      untranslatable_he: ['ממצא לא ברור'],
    }),
  });
  eq(r.untranslatable.length, 1, 'הממצא הלא-ניתן-להמרה לא דווח');
});

await t('שליפה מלאה מחזירה ספרות ו-meta', async () => {
  const r = await retrieveEvidence({
    findings: ['תסנין'],
    patient: { age_days: 1460 },
    invokeLLM: termsLLM({ primary_terms_en: ['pulmonary infiltrate'] }),
    fetchImpl: ncbiFetch({
      ids: ['29043422'],
      summaries: {
        '29043422': {
          uid: '29043422',
          title: 'Guidelines for the use of chest radiographs in pneumonia in children.',
          fulljournalname: 'Pediatric radiology',
          pubdate: '2017 Sep',
          pubtype: ['Journal Article', 'Review'],
          articleids: [{ idtype: 'doi', value: '10.1007/s00247-017-3944-4' }],
          authors: [{ name: 'Andronikou S' }],
        },
      },
    }),
  });

  eq(r.literature.length, 1);
  eq(r.literature[0].pmid, '29043422');
  eq(r.literature[0].evidence.tier, 4, 'Review אמור לקבל דרגה 4');
  ok(r.meta.query.includes('child[MeSH]'), 'מסנן הגיל לא נכנס לשאילתה');
  ok(r.meta.note_he.includes('נשלפו 1'), 'ה-meta לא מדווח כמה נשלפו');
});

await t('אפס תוצאות מדווח במפורש ולא נבלע', async () => {
  const r = await retrieveEvidence({
    findings: ['תסנין'],
    invokeLLM: termsLLM({ primary_terms_en: ['very rare term'] }),
    fetchImpl: ncbiFetch({ ids: [] }),
  });
  eq(r.literature.length, 0);
  ok(r.meta.note_he.includes('לא נמצאו מאמרים'), 'היעדר תוצאות לא דווח');
  ok(r.meta.note_he.includes('אינו ראיה להיעדר ספרות'), 'חסרה ההסתייגות החשובה');
});

await t('כשל רשת מדווח ולא מפיל', async () => {
  const r = await retrieveEvidence({
    findings: ['תסנין'],
    invokeLLM: termsLLM({ primary_terms_en: ['infiltrate'] }),
    fetchImpl: async () => { throw new Error('network down'); },
  });
  eq(r.literature.length, 0);
  ok(r.meta.error, 'השגיאה לא נרשמה');
  ok(r.meta.note_he.includes('נכשלה'), 'הכשל לא הוצהר לרופא/ה');
});

await t('כשל בהמרת מונחים → אין שליפה, ומוצהר', async () => {
  const r = await retrieveEvidence({
    findings: ['תסנין'],
    invokeLLM: async () => { throw new Error('llm down'); },
    fetchImpl: ncbiFetch({ ids: ['1'] }),
  });
  eq(r.literature.length, 0);
  ok(r.meta.note_he.includes('אינו נתמך בספרות'), 'לא הוצהר שאין תמיכה בספרות');
});

await t('ללא ממצאים — לא מנסים לשלוף', async () => {
  let called = false;
  const r = await retrieveEvidence({
    findings: [],
    invokeLLM: async () => { called = true; return {}; },
  });
  eq(r.meta.attempted, false);
  eq(called, false, 'בוצעה קריאת LLM מיותרת');
});

await t('סקירה שיטתית מדורגת מעל דיווח מקרה', async () => {
  const r = await retrieveEvidence({
    findings: ['תסנין'],
    invokeLLM: termsLLM({ primary_terms_en: ['infiltrate'] }),
    fetchImpl: ncbiFetch({
      ids: ['111', '222'],
      summaries: {
        '111': { uid: '111', title: 'A case', pubdate: '2020', pubtype: ['Case Reports'], articleids: [], authors: [] },
        '222': { uid: '222', title: 'A systematic review', pubdate: '2019', pubtype: ['Systematic Review'], articleids: [], authors: [] },
      },
    }),
  });
  eq(r.literature[0].pmid, '222', 'הסקירה השיטתית לא דורגה ראשונה');
  eq(r.literature[1].pmid, '111');
});

console.log(`\n${'─'.repeat(52)}`);
console.log(`עברו: ${pass}  ·  נכשלו: ${fail}`);
if (fail) { console.log('\nכשלים:'); fails.forEach((f) => console.log(`  · ${f}`)); process.exit(1); }
console.log('תזמור השליפה תקין.');
