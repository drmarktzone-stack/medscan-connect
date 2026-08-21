/**
 * בדיקות קיבוץ לאשכולות אימות.
 *
 * הבדיקה החשובה כאן היא ש"אשר הכל" **אינו** נוגע בפריט שכבר סומן
 * כשגוי. מי שסימן פריט כשגוי קיבל החלטה קלינית; ביטולה בטעות, כתופעת
 * לוואי של אישור-בכמות, הוא בדיוק המצב שבו ידע פסול חוזר לפלט בלי
 * שאיש התכוון לכך.
 */

import assert from 'node:assert';
import {
  buildClusters, clusterStats, pendingItems, extractQuote, labelFromAnchor,
} from './clusters.js';

let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); pass += 1; console.log(`  ✓ ${name}`); }
  catch (e) { fail += 1; console.log(`  ✗ ${name}\n      ${e.message}`); }
};
const eq = assert.strictEqual;
const ok = assert.ok;

const ANCHOR = 'nelson.מחלות_זיהומיות.זיהומי_ינקות';

const BY_ENTITY = {
  KnowledgeTopic: [
    { id: 't1', topic_key: ANCHOR, topic_title_he: 'זיהומי ינקות', summary_he: 'סיכום',
      review_note_he: 'ציטוט מקור: "לעד 10% מהתינוקות יש זיהום"', verification_status: 'draft_needs_verification' },
  ],
  RedFlag: [
    { id: 'f1', flag_key: 'k.lp', source_anchor: ANCHOR, label_he: 'ניקור מותני חובה',
      action_he: 'להשלים ניקור מותני', severity: 'critical',
      review_note_he: 'ציטוט מקור: "יש להשלים ניקור מתני בכל יילוד עם ספסיס"',
      verification_status: 'draft_needs_verification' },
    { id: 'f2', flag_key: 'k.prom', source_anchor: ANCHOR, label_he: 'PROM מעל 18 שעות',
      action_he: 'השגחה', severity: 'red', verification_status: 'flagged',
      review_note_he: 'ניסוח רחב מדי' },
  ],
  ClinicalRule: [
    { id: 'r1', rule_key: 'k.sirs', source_anchor: ANCHOR, title_he: 'SIRS',
      conclusion_he: 'שניים או יותר', suspicion: 'red',
      review_note_he: 'ציטוט מקור: "שניים או יותר מהבאים"',
      verification_status: 'verified', verified_by: 'ד"ר סמר' },
  ],
  LabPattern: [],
  Association: [
    { id: 'a1', assoc_key: 'k.prem', source_anchor: 'nelson.אחר.נושא',
      anchor_finding_he: 'פגות', implies_he: 'סיכון מוגבר', suspicion: 'yellow',
      review_note_he: 'ציטוט מקור: "פגות ו-LBW הם גורם הסיכון החשוב ביותר"',
      verification_status: 'draft_needs_verification' },
  ],
};

console.log('\nאשכולות אימות\n');

test('פריטים מקובצים לפי העוגן', () => {
  const c = buildClusters(BY_ENTITY);
  eq(c.length, 2, 'ציפינו לשני אשכולות');
  const main = c.find((x) => x.anchor === ANCHOR);
  eq(main.items.length, 4);
});

test('כותרת האשכול נלקחת מרשומת הנושא', () => {
  const main = buildClusters(BY_ENTITY).find((x) => x.anchor === ANCHOR);
  eq(main.title_he, 'זיהומי ינקות');
});

test('אשכול ללא רשומת נושא מקבל תווית קריאה מהעוגן', () => {
  const other = buildClusters(BY_ENTITY).find((x) => x.anchor === 'nelson.אחר.נושא');
  eq(other.title_he, 'אחר נושא');
});

test('דגלים אדומים מוצגים ראשונים באשכול', () => {
  const main = buildClusters(BY_ENTITY).find((x) => x.anchor === ANCHOR);
  eq(main.items[0].entity, 'RedFlag');
  eq(main.items[main.items.length - 1].entity, 'KnowledgeTopic');
});

test('הספירה מפרידה טיוטה, מאומת ושגוי', () => {
  const main = buildClusters(BY_ENTITY).find((x) => x.anchor === ANCHOR);
  eq(main.counts.total, 4);
  eq(main.counts.draft, 2);
  eq(main.counts.verified, 1);
  eq(main.counts.flagged, 1);
});

/* ── ההגנה המרכזית ─────────────────────────────────────────────────── */

test('"אשר הכל" אינו נוגע בפריט שסומן כשגוי', () => {
  const main = buildClusters(BY_ENTITY).find((x) => x.anchor === ANCHOR);
  const pending = pendingItems(main);
  ok(!pending.some((i) => i.id === 'f2'), 'פריט flagged חזר לתור האישור');
  ok(!pending.some((i) => i.id === 'r1'), 'פריט מאומת חזר לתור האישור');
  eq(pending.length, 2);
});

test('אשכול שכולו מאומת אינו מציג פריטים ממתינים', () => {
  const allVerified = buildClusters({
    RedFlag: [{ id: 'x', flag_key: 'k', source_anchor: 'nelson.a.b',
      label_he: 'ד', action_he: 'פ', verification_status: 'verified' }],
  });
  eq(pendingItems(allVerified[0]).length, 0);
});

/* ── ציטוט ─────────────────────────────────────────────────────────── */

test('הציטוט מחולץ מהערת הבקרה', () => {
  eq(extractQuote('ציטוט מקור: "יש להשלים ניקור מתני"'), 'יש להשלים ניקור מתני');
});

test('הערה שאינה ציטוט מוחזרת כמות שהיא', () => {
  eq(extractQuote('ניסוח רחב מדי'), 'ניסוח רחב מדי');
});

test('היעדר הערה מחזיר null ולא זורק', () => {
  eq(extractQuote(null), null);
  eq(extractQuote(''), null);
});

test('פריט ללא ציטוט מסומן ככזה, ולא מוסתר', () => {
  const c = buildClusters({
    RedFlag: [{ id: 'n', flag_key: 'k', source_anchor: 'nelson.a.b',
      label_he: 'ד', action_he: 'פ', verification_status: 'draft_needs_verification' }],
  });
  eq(c[0].items[0].quote_he, null);
  eq(pendingItems(c[0]).length, 1, 'פריט ללא ציטוט עדיין דורש הכרעה');
});

/* ── מיון וסטטיסטיקה ───────────────────────────────────────────────── */

test('אשכולות עם הכי הרבה טיוטות מופיעים ראשונים', () => {
  const c = buildClusters(BY_ENTITY);
  eq(c[0].anchor, ANCHOR);
});

test('clusterStats סוכם על פני כל האשכולות', () => {
  const s = clusterStats(buildClusters(BY_ENTITY));
  eq(s.clusters, 2);
  eq(s.draft, 3);
  eq(s.verified, 1);
  eq(s.flagged, 1);
});

test('רשומה ללא עוגן אינה נכנסת לאשכול', () => {
  const c = buildClusters({
    RedFlag: [{ id: 'x', flag_key: 'k', label_he: 'ללא עוגן', action_he: 'פ' }],
  });
  eq(c.length, 0);
});

test('קלט ריק אינו מפיל', () => {
  eq(buildClusters(null).length, 0);
  eq(buildClusters({}).length, 0);
  eq(clusterStats(null).clusters, 0);
  eq(pendingItems(null).length, 0);
  eq(labelFromAnchor(null), '');
});

console.log(`\n  ${pass} עברו, ${fail} נכשלו\n`);
process.exit(fail > 0 ? 1 : 0);
