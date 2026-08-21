/**
 * MedScan — בדיקות שחזור פריסה
 *
 * הבדיקה המרכזית: אימות שהמודל **סידר מחדש** ולא **המציא**.
 * זו ההגנה היחידה שהופכת את השלב הזה לבטוח.
 *
 * הרצה:  node src/lib/medscan/ingestion/layout.test.mjs
 */

import {
  verifyNoInvention, itemsToPrompt, columnsToChunks, reconstructPage,
} from './layoutReconstruction.js';
import { detectSeams, chunkText, validateExtraction } from './extractionCore.js';

let pass = 0, fail = 0;
const fails = [];
const t = async (n, f) => {
  try { await f(); pass += 1; console.log(`  ✓ ${n}`); }
  catch (e) { fail += 1; fails.push(`${n}: ${e.message}`); console.log(`  ✗ ${n}\n      ${e.message}`); }
};
const ok = (c, m) => { if (!c) throw new Error(m || 'failed'); };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || 'eq'}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };

/** פריטים מדומים משתי עמודות — מבנה זהה לעמוד אמיתי במסמך. */
const ITEMS = [
  { y: 553, x0: 651, x1: 720, s: 'חום בילד 2-24 חודשים' },
  { y: 553, x0: 264, x1: 321, s: 'חום במדוכאי חיסון' },
  { y: 542, x0: 603, x1: 802, s: 'בניגוד ליילודים ניתן להסתמך על קליניקה ובדיקה גופנית.' },
  { y: 545, x0: 452, x1: 547, s: 'זיהומים בחסרי חיסון ראשוניים:' },
  { y: 531, x0: 665, x1: 802, s: 'וירוסים הם סיבה שכיחה ביותר, מאד עונתיים:' },
  { y: 533, x0: 36, x1: 278, s: 'SCID: קבוצת מחלות מגוונת מאד, מתבטאת עד חצי שנה' },
];

console.log('\nשחזור פריסה מקואורדינטות\n');

await t('הפרומפט ממיין RTL: y יורד, ובתוך שורה x יורד', () => {
  const lines = itemsToPrompt(ITEMS).split('\n');
  ok(lines[0].includes('חום בילד'), 'הפריט הימני-עליון אינו ראשון');
  ok(lines[1].includes('חום במדוכאי'), 'סדר RTL בתוך שורה שגוי');
});

/* ═══ ההגנה: איתור המצאה ═══ */

await t('סידור מחדש נאמן — עובר', () => {
  const columns = [
    { text_he: 'חום בילד 2-24 חודשים\nבניגוד ליילודים ניתן להסתמך על קליניקה ובדיקה גופנית.\nוירוסים הם סיבה שכיחה ביותר, מאד עונתיים:' },
    { text_he: 'חום במדוכאי חיסון\nזיהומים בחסרי חיסון ראשוניים:\nSCID: קבוצת מחלות מגוונת מאד, מתבטאת עד חצי שנה' },
  ];
  const v = verifyNoInvention({ items: ITEMS, columns });
  eq(v.ok, true, `סידור נאמן נחסם: ${JSON.stringify(v.problems)}`);
});

await t('טקסט שהומצא — נחסם', () => {
  const columns = [
    {
      text_he:
        'חום בילד 2-24 חודשים\nיש להתחיל אנטיביוטיקה אמפירית מיידית בכל ילד עם חום ' +
        'מעל שלושים ותשע מעלות ולשקול אשפוז לצורך מעקב צמוד והשלמת בירור',
    },
  ];
  const v = verifyNoInvention({ items: ITEMS, columns });
  eq(v.ok, false, 'טקסט מומצא עבר — זו ההגנה היחידה בשלב הזה');
  ok(v.problems.some((p) => p.severity === 'block'));
});

await t('שינוי ניסוח קל נחסם גם הוא', () => {
  // "להסתמך הרבה יותר על" → "להסתמך בעיקר על" — שינוי קטן, משמעות שונה
  const columns = [{
    text_he: 'בניגוד ליילודים ניתן להסתמך בעיקר על ההערכה הקלינית ועל בדיקה גופנית מלאה ומדוקדקת',
  }];
  eq(verifyNoInvention({ items: ITEMS, columns }).ok, false, 'ניסוח ששונה עבר');
});

await t('השמטה נרחבת מדווחת כאזהרה', () => {
  const columns = [{ text_he: 'חום בילד 2-24 חודשים' }];
  const v = verifyNoInvention({ items: ITEMS, columns });
  ok(v.coverage < 0.7, 'הכיסוי לא חושב');
  ok(v.problems.some((p) => p.severity === 'warn'), 'השמטה לא דווחה');
});

await t('עמודות ריקות אינן מייצרות חסימת שווא', () => {
  eq(verifyNoInvention({ items: ITEMS, columns: [{ text_he: '' }] }).ok, true);
});

/* ═══ המרה לקטעי חילוץ ═══ */

await t('כל עמודה הופכת לקטע נפרד — זה מה שמונע ערבוב נושאים', () => {
  const chunks = columnsToChunks([
    { heading_he: 'חום בילד', text_he: 'א'.repeat(60) },
    { heading_he: 'חום במדוכאי חיסון', text_he: 'ב'.repeat(60) },
  ], 5);
  eq(chunks.length, 2);
  ok(chunks[0].hint.includes('חום בילד'));
  ok(chunks[1].hint.includes('עמוד 5'));
});

await t('עמודה קצרה מדי מסוננת', () => {
  eq(columnsToChunks([{ text_he: 'קצר' }]).length, 0);
});

/* ═══ אינטגרציה עם שכבת החילוץ ═══ */

await t('טקסט משוחזר נקי אינו מסומן כתפר', () => {
  const clean = 'וירוסים הם סיבה שכיחה ביותר בגיל זה\nאנטרווירוס מופיע בקיץ ובסתיו מוקדם\nוירוסים נשימתיים מופיעים בעיקר בחורף';
  eq(detectSeams(clean).verdict, 'clean', 'טקסט נקי סומן כמשובש');
});

await t('טקסט תפור מזוהה ונחסם', () => {
  const seamed = [
    'מתקיים ב-7-13% מהתינוקות עד חודש עם חום:מרבית המקרים )• (5-13% בתינוקות',
    'הגורמים השכיחים ביותר ל-UTI:ייתכן גם פלאוציטוזיס במקביל ל- ללא מנינגיטיס',
    'עד 28 ימים 1-2% ומעל גיל חודש פחות מ-0.5% • • UTI',
  ].join('\n');
  ok(detectSeams(seamed).verdict !== 'clean', 'טקסט תפור לא זוהה');
});

await t('פיצול לקטעים שומר על גבולות טבעיים', () => {
  const text = ['פסקה ראשונה.'.repeat(40), 'פסקה שנייה.'.repeat(40)].join('\n\n');
  const chunks = chunkText(text, 300);
  ok(chunks.length >= 2);
  ok(chunks.every((c) => c.length <= 400), 'קטע חרג מהגודל');
});

await t('חילוץ ללא ציטוט-מקור נפסל', () => {
  const { kept, problems } = validateExtraction({
    topics: [{ topic_key: 'nelson.id.fever', topic_title_he: 'חום', summary_he: 'x', source_quote_he: 'ציטוט מספיק ארוך מהמקור' }],
    lab_patterns: [{
      pattern_key: 'p1', title_he: 'דפוס', components: [{ analyte: 'CRP', direction: 'high' }],
      direction_he: 'כיוון', suspicion: 'yellow', source_anchor: 'nelson.id.fever',
      // אין source_quote_he
    }],
    gaps_he: ['פער כלשהו'],
  });
  eq(kept.lab_patterns.length, 0, 'פריט ללא ציטוט נשמר');
  ok(problems.some((p) => p.why_he.includes('ציטוט')));
});

await t('מינון שדלף לכלל נפסל', () => {
  const { kept, problems } = validateExtraction({
    topics: [{ topic_key: 'nelson.id.x', topic_title_he: 'נושא', summary_he: 's', source_quote_he: 'ציטוט ארוך מספיק כאן' }],
    clinical_rules: [{
      rule_key: 'r1', title_he: 'כלל', conditions: [{ type: 'finding', key: 'חום', op: 'present' }],
      conclusion_he: 'לתת אמוקסיצילין 50 מ"ג/ק"ג ליום', suspicion: 'yellow',
      source_anchor: 'nelson.id.x', source_quote_he: 'ציטוט ארוך מספיק כאן',
    }],
    gaps_he: ['x'],
  });
  eq(kept.clinical_rules.length, 0, 'כלל עם מינון נשמר');
  ok(problems.some((p) => p.why_he.includes('DoseRecord')));
});

await t('עוגן שאינו קיים ברשימת הנושאים — נפסל', () => {
  const { kept } = validateExtraction({
    topics: [{ topic_key: 'nelson.id.a', topic_title_he: 'א', summary_he: 's', source_quote_he: 'ציטוט ארוך מספיק כאן' }],
    red_flags: [{
      flag_key: 'f1', label_he: 'דגל', trigger: { findings: ['חום'] }, severity: 'red',
      action_he: 'פעולה', source_anchor: 'nelson.id.NOTEXIST', source_quote_he: 'ציטוט ארוך מספיק כאן',
    }],
    gaps_he: ['x'],
  });
  eq(kept.red_flags.length, 0, 'עוגן מומצא נשמר');
});

await t('חלון גיל הפוך נפסל', () => {
  const { kept } = validateExtraction({
    topics: [{ topic_key: 'nelson.id.a', topic_title_he: 'א', summary_he: 's', source_quote_he: 'ציטוט ארוך מספיק כאן' }],
    red_flags: [{
      flag_key: 'f1', label_he: 'דגל', trigger: { findings: ['חום'] }, severity: 'red',
      action_he: 'פעולה', age_min_days: 90, age_max_days: 28,
      source_anchor: 'nelson.id.a', source_quote_he: 'ציטוט ארוך מספיק כאן',
    }],
    gaps_he: ['x'],
  });
  eq(kept.red_flags.length, 0, 'חלון גיל הפוך נשמר — הדגל לעולם לא היה נורה');
});

await t('חילוץ עשיר בלי פערים מוצהרים — אזהרה', () => {
  const { problems } = validateExtraction({
    topics: [{ topic_key: 'nelson.id.a', topic_title_he: 'א', summary_he: 's', source_quote_he: 'ציטוט ארוך מספיק כאן' }],
    associations: [1, 2, 3].map((i) => ({
      assoc_key: `a${i}`, anchor_finding_he: 'חום', implies_he: 'משהו', suspicion: 'yellow',
      source_anchor: 'nelson.id.a', source_quote_he: 'ציטוט ארוך מספיק כאן',
    })),
    gaps_he: [],
  });
  ok(problems.some((p) => p.why_he.includes('הושלם')), 'היעדר פערים לא סומן כחשוד');
});

/* ═══ הצינור ═══ */

await t('שחזור שכשל באימות מסומן ולא מוחזר כתקין', async () => {
  const fakeLLM = async () => ({
    page_kind: 'table',
    columns: [{ text_he: 'טקסט שלא היה בקלט בכלל ואינו מופיע בשום פריט שסופק למודל הזה' }],
  });
  const r = await reconstructPage({ items: ITEMS, invokeLLM: fakeLLM });
  eq(r.ok, false);
  eq(r.error, 'invention_detected');
});

await t('כשל רשת אינו מפיל', async () => {
  const r = await reconstructPage({
    items: ITEMS,
    invokeLLM: async () => { throw new Error('network'); },
  });
  eq(r.ok, false);
  ok(r.error.includes('network'));
});

console.log(`\n${'─'.repeat(52)}`);
console.log(`עברו: ${pass}  ·  נכשלו: ${fail}`);
if (fail) { console.log('\nכשלים:'); fails.forEach((f) => console.log(`  · ${f}`)); process.exit(1); }
console.log('שחזור הפריסה ואימות אי-ההמצאה תקינים.');
