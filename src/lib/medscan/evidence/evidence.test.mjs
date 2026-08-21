/**
 * MedScan — בדיקות שכבת הספרות
 *
 * הרצה:  node src/lib/medscan/evidence/evidence.test.mjs
 */

import { buildFactBlock } from '../antihallucination/factBlock.js';
import { citationGuard, expandCitations, unusedLiterature } from './citationGuard.js';
import {
  buildQuery, classifyEvidence, searchLiterature, verifyPmid, titleSimilarity,
} from './pubmedClient.js';
import { groundedInvoke } from '../gate/groundedInvoke.js';
import { OUTPUT_STATUS } from '../antihallucination/envelope.js';
import { DISCLAIMER_HE } from '../schemas/output.schemas.js';

let pass = 0, fail = 0;
const fails = [];
const t = async (n, f) => {
  try { await f(); pass += 1; console.log(`  ✓ ${n}`); }
  catch (e) { fail += 1; fails.push(`${n}: ${e.message}`); console.log(`  ✗ ${n}\n      ${e.message}`); }
};
const ok = (c, m) => { if (!c) throw new Error(m || 'failed'); };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || 'eq'}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };

const LIT = [
  {
    pmid: '29043422', doi: '10.1007/s00247-017-3944-4',
    title: 'Guidelines for the use of chest radiographs in community-acquired pneumonia in children and adolescents',
    journal: 'Pediatric radiology', year: 2017,
    authors: ['Andronikou S', 'Lambert E'],
    article_types: ['Journal Article', 'Review'],
  },
  {
    pmid: '37352841', doi: '10.1093/cid/ciad385',
    title: 'Management of Pediatric Pneumonia',
    journal: 'Clin Infect Dis', year: 2023,
    authors: ['Ambroggio L'],
    article_types: ['Journal Article'],
  },
];

const fbWithLit = () => buildFactBlock({
  kbItems: [], patientData: [{ key: 'obs', label_he: 'ממצא', value: 'תסנין' }],
  literature: LIT, mode: 'clinical',
});

console.log('\nשכבת ספרות — שליפה, ציטוט ואימות\n');

/* ── FACT BLOCK עם L# ─────────────────────────────────────────── */

await t('ספרות נכנסת כ-L# ובונה קבוצת ציטוטים סגורה', async () => {
  const fb = fbWithLit();
  ok(fb.index.has('L1') && fb.index.has('L2'), 'פריטי L# לא נוצרו');
  eq(fb.hasLiterature, true);
  ok(fb.citations.has('29043422'), 'PMID לא נכנס לקבוצה המותרת');
  ok(fb.citations.has('10.1007/s00247-017-3944-4'), 'DOI לא נכנס לקבוצה המותרת');
});

await t('ה-FACT BLOCK אומר למודל במפורש לא לכתוב מזהים', async () => {
  const fb = fbWithLit();
  ok(fb.text.includes('אל תכתוב PMID/DOI בעצמך'), 'ההוראה חסרה מהבלוק');
  ok(fb.text.includes('[L1]'), 'המזהה לא מוצג');
});

await t('ספרות אינה נחשבת לידע KB מאומת', async () => {
  const fb = fbWithLit();
  // מאמר שנשלף הוא מקור אמיתי — אבל הוא לא עבר אימות רפואי כפריט KB.
  // בלבול בין השניים יאפשר חשד אדום על סמך תקציר PubMed בלבד.
  eq(fb.hasVerifiedClinicalContent, false, 'ספרות נספרה בטעות כידע מאומת');
  eq(fb.hasKbContent, false);
});

/* ── citationGuard ─────────────────────────────────────────────── */

await t('PMID שנשלף — מותר', async () => {
  const out = { uncertainty_note_he: 'לפי המאמר PMID: 29043422 הנושא נדון' };
  eq(citationGuard(out, fbWithLit()).blocked.length, 0, 'מזהה שנשלף נחסם בטעות');
});

await t('PMID שלא נשלף — נחסם', async () => {
  const out = { uncertainty_note_he: 'ראה PMID: 12345678 לפרטים' };
  const r = citationGuard(out, fbWithLit());
  eq(r.blocked.length, 1, 'מזהה מומצא עבר');
  eq(r.blocked[0].kind, 'pmid');
  eq(r.blocked[0].identifier, '12345678');
});

await t('DOI מומצא נחסם', async () => {
  const out = { uncertainty_note_he: 'מבוסס על 10.1001/jama.2020.99999' };
  const r = citationGuard(out, fbWithLit());
  eq(r.blocked.length, 1, 'DOI מומצא עבר');
  eq(r.blocked[0].kind, 'doi');
});

await t('DOI שנשלף — מותר, גם באותיות שונות', async () => {
  const out = { uncertainty_note_he: 'לפי 10.1007/S00247-017-3944-4' };
  eq(citationGuard(out, fbWithLit()).blocked.length, 0, 'DOI תקין נחסם בשל רישיות');
});

await t('ללא ספרות כלל — כל מזהה נחסם', async () => {
  const fb = buildFactBlock({ kbItems: [], mode: 'clinical' });
  const out = { uncertainty_note_he: 'ראה PMID: 29043422' };
  eq(citationGuard(out, fb).blocked.length, 1, 'מזהה עבר כשלא נשלפה ספרות בכלל');
});

/* ── הרחבת ציטוטים ─────────────────────────────────────────────── */

await t('הפניית L# מורחבת בקוד לציטוט מלא עם קישור', async () => {
  const fb = fbWithLit();
  const out = {
    claims: [{ claim_id: 'C1', claim_type: 'FACT', text_he: 'טענה', fact_refs: ['L1'] }],
  };
  const refs = expandCitations({ output: out, factBlock: fb });
  eq(refs.length, 1);
  eq(refs[0].pmid, '29043422');
  eq(refs[0].url, 'https://pubmed.ncbi.nlm.nih.gov/29043422/');
  eq(refs[0].doi_url, 'https://doi.org/10.1007/s00247-017-3944-4');
  ok(refs[0].title.includes('chest radiographs'), 'הכותרת לא חולצה נכון');
});

await t('ספרות שנשלפה ולא נוצלה מדווחת', async () => {
  const fb = fbWithLit();
  const out = { claims: [{ claim_id: 'C1', claim_type: 'FACT', text_he: 'x', fact_refs: ['L1'] }] };
  const unused = unusedLiterature({ output: out, factBlock: fb });
  eq(unused.length, 1, 'מאמר שלא נוצל לא דווח');
  eq(unused[0].ref, 'L2');
});

/* ── דירוג חוזק ראיה ───────────────────────────────────────────── */

await t('דירוג ראיה דטרמיניסטי לפי סוג פרסום', async () => {
  eq(classifyEvidence(['Systematic Review']).tier, 1);
  eq(classifyEvidence(['Practice Guideline']).tier, 1);
  eq(classifyEvidence(['Randomized Controlled Trial']).tier, 2);
  eq(classifyEvidence(['Case Reports']).tier, 7);
  eq(classifyEvidence(['Journal Article']).tier, 6, 'ברירת מחדל שגויה');
});

await t('בניית שאילתה מוסיפה מסנן גיל', async () => {
  const q = buildQuery({ findings: ['תסנין', 'חום'], ageScope: 'infant' });
  ok(q.includes('infant[MeSH]'), 'מסנן הגיל חסר');
  eq(buildQuery({ findings: [] }), null, 'שאילתה ריקה לא הוחזרה כ-null');
});

/* ── אימות מזהה מול PubMed (עם טרנספורט מדומה) ─────────────────── */

await t('PMID אמיתי עם כותרת מומצאת → mismatch', async () => {
  const fakeFetch = async () => ({
    ok: true,
    json: async () => ({
      result: {
        '29043422': {
          uid: '29043422',
          title: 'Guidelines for the use of chest radiographs in community-acquired pneumonia in children and adolescents.',
          pubdate: '2017 Sep',
          articleids: [{ idtype: 'doi', value: '10.1007/s00247-017-3944-4' }],
          authors: [{ name: 'Andronikou S' }],
        },
      },
    }),
  });

  const r = await verifyPmid({
    pmid: '29043422',
    claimedTitle: 'Machine learning for automated detection of pediatric sepsis',
    fetchImpl: fakeFetch,
  });
  eq(r.verdict, 'mismatch', 'דפוס "מזהה אמיתי + כותרת מומצאת" לא נתפס');
  ok(r.reason_he.includes('דפוס הזיית-הציטוט'));
});

await t('PMID אמיתי עם כותרת נכונה → matched', async () => {
  const fakeFetch = async () => ({
    ok: true,
    json: async () => ({
      result: {
        '29043422': {
          uid: '29043422',
          title: 'Guidelines for the use of chest radiographs in community-acquired pneumonia in children and adolescents.',
          pubdate: '2017',
          articleids: [],
          authors: [],
        },
      },
    }),
  });
  const r = await verifyPmid({
    pmid: '29043422',
    claimedTitle: 'Guidelines for the use of chest radiographs in community-acquired pneumonia in children and adolescents',
    fetchImpl: fakeFetch,
  });
  eq(r.verdict, 'matched');
});

await t('כשל רשת אינו מפיל — מדווח כ-unchecked', async () => {
  const r = await verifyPmid({
    pmid: '1', claimedTitle: 'x',
    fetchImpl: async () => { throw new Error('network down'); },
  });
  eq(r.verdict, 'unchecked');
});

await t('שליפה ללא טרנספורט מחזירה שגיאה ולא זורקת', async () => {
  const r = await searchLiterature({ query: 'test', fetchImpl: null });
  eq(r.error, 'no_fetch_transport');
  eq(r.articles.length, 0);
});

await t('דמיון כותרות מבחין בין זהה לשונה', async () => {
  ok(titleSimilarity('pediatric pneumonia chest radiograph', 'pediatric pneumonia chest radiograph') > 0.9);
  ok(titleSimilarity('pediatric pneumonia guidelines', 'machine learning sepsis detection') < 0.2);
});

/* ── אינטגרציה בצינור ──────────────────────────────────────────── */

await t('ציטוט מומצא בצינור המלא → סירוב', async () => {
  const KB = {
    rule_key: 'r1', title_he: 'תסנין', conclusion_he: 'כיוון',
    suspicion: 'yellow', source_anchor: 'nelson.resp.pneumonia',
    verification_status: 'verified',
  };
  const bad = {
    red_flags: [], claims: [], contradictions: [],
    differential: [{
      direction_id: 'D1', rank: 1, must_not_miss: false,
      diagnosis_direction_he: 'דלקת ריאות',
      confidence: { level: 'yellow', confidence_reason_he: 'תסנין תואם', evidence_strength: 'moderate' },
      reasoning_chain: [
        { step: 1, stage: 'findings', statement_he: 'תסנין', fact_refs: ['P1'] },
        { step: 2, stage: 'links', statement_he: 'מקושר', fact_refs: ['F1'] },
        { step: 3, stage: 'candidate_conclusion', statement_he: 'כיוון', fact_refs: ['F1'] },
      ],
      supports_he: ['תסנין'], refutes_he: ['איכות ירודה'],
      fact_refs: ['F1', 'P1'], source_anchors: ['nelson.resp.pneumonia'],
    }],
    unknowns_he: ['מבוסס גם על PMID: 99999999'],
    overall_suspicion: 'yellow', disclaimer_he: DISCLAIMER_HE,
  };

  const res = await groundedInvoke({
    engine: 'differential', enginePrompt: 'פרש',
    grounding: { kbItems: [KB], firedRules: [KB] },
    patientData: [{ key: 'obs', label_he: 'ממצא', value: 'תסנין' }],
    literature: LIT,
    invokeLLM: async ({ purpose }) =>
      purpose === 'self_check' ? { verdicts: [], overall: 'pass' } : structuredClone(bad),
  });

  eq(res.status, OUTPUT_STATUS.INSUFFICIENT);
  ok(res.audit.reason_codes.includes('fabricated_citation'));
});

await t('הפניה תקינה ל-L# → הציטוטים מורחבים בפלט', async () => {
  const KB = {
    rule_key: 'r1', title_he: 'תסנין', conclusion_he: 'כיוון',
    suspicion: 'yellow', source_anchor: 'nelson.resp.pneumonia',
    verification_status: 'verified',
  };
  const good = {
    red_flags: [], claims: [], contradictions: [],
    differential: [{
      direction_id: 'D1', rank: 1, must_not_miss: false,
      diagnosis_direction_he: 'דלקת ריאות',
      confidence: { level: 'yellow', confidence_reason_he: 'תסנין תואם', evidence_strength: 'moderate' },
      reasoning_chain: [
        { step: 1, stage: 'findings', statement_he: 'תסנין', fact_refs: ['P1'] },
        { step: 2, stage: 'links', statement_he: 'מקושר לספרות', fact_refs: ['F1', 'L1'] },
        { step: 3, stage: 'candidate_conclusion', statement_he: 'כיוון', fact_refs: ['F1'] },
      ],
      supports_he: ['תסנין'], refutes_he: ['איכות ירודה'],
      fact_refs: ['F1', 'P1', 'L1'], source_anchors: ['nelson.resp.pneumonia'],
    }],
    unknowns_he: ['מקור הזיהום לא ידוע'],
    overall_suspicion: 'yellow', disclaimer_he: DISCLAIMER_HE,
  };

  const res = await groundedInvoke({
    engine: 'differential', enginePrompt: 'פרש',
    grounding: { kbItems: [KB], firedRules: [KB] },
    patientData: [{ key: 'obs', label_he: 'ממצא', value: 'תסנין' }],
    literature: LIT,
    invokeLLM: async ({ purpose }) =>
      purpose === 'self_check' ? { verdicts: [], overall: 'pass' } : structuredClone(good),
  });

  ok(res.status !== OUTPUT_STATUS.INSUFFICIENT, `סירוב לא צפוי: ${JSON.stringify(res.reasons_he)}`);
  ok(res.references?.length >= 1, 'הציטוטים לא הורחבו');
  eq(res.references[0].pmid, '29043422');
  ok(res.unused_literature?.items?.length === 1, 'ספרות לא-מנוצלת לא דווחה');
});

console.log(`\n${'─'.repeat(52)}`);
console.log(`עברו: ${pass}  ·  נכשלו: ${fail}`);
if (fail) { console.log('\nכשלים:'); fails.forEach((f) => console.log(`  · ${f}`)); process.exit(1); }
console.log('שכבת הספרות תקינה.');
