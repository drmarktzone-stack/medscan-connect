/**
 * MedScan i18n — תרגום פלט מנוע לפי locale.
 * ברירת מחדל עברית: מוסיפים locale/dir בלי לשנות מחרוזות.
 */

import { dirFor, resolveLocale } from './locale.js';
import { CLINICAL_DICTIONARY } from './clinicalDictionary.js';
import { DISCLAIMER_HE } from '../schemas/output.schemas.js';

export function t(locale, key) {
  const loc = resolveLocale(locale);
  const entry = CLINICAL_DICTIONARY[key];
  if (!entry) return key;
  return entry[loc] || entry.he || key;
}

function translateByKey(locale, key, fallback) {
  if (!key) return fallback;
  const loc = resolveLocale(locale);
  const entry = CLINICAL_DICTIONARY[key];
  if (!entry) return fallback;
  return entry[loc] || entry.he || fallback;
}

function mapItem(item, locale) {
  if (!item || typeof item !== 'object') return item;
  const key = item.i18n_key || item.pattern_key || item.flag_key || item.direction_id;
  const next = { ...item };
  if (typeof next.title_he === 'string') next.title_he = translateByKey(locale, key, next.title_he);
  if (typeof next.label_he === 'string') next.label_he = translateByKey(locale, next.i18n_key || next.flag_key, next.label_he);
  if (typeof next.action_he === 'string') next.action_he = translateByKey(locale, next.i18n_action_key || next.flag_key, next.action_he);
  if (typeof next.diagnosis_direction_he === 'string') {
    next.diagnosis_direction_he = translateByKey(locale, next.i18n_key, next.diagnosis_direction_he);
  }
  if (typeof next.test_he === 'string') next.test_he = translateByKey(locale, next.i18n_key, next.test_he);
  if (typeof next.message_he === 'string') next.message_he = translateByKey(locale, next.i18n_key, next.message_he);
  return next;
}

function mapList(list, locale) {
  if (!Array.isArray(list)) return list;
  return list.map((x) => (typeof x === 'string' ? translateByKey(locale, x, x) : mapItem(x, locale)));
}

/** כותרות Markdown קבועות במנועי עור/דימות/אק״ג — מתורגמות ב-en/ar בלבד. */
const MD_HEADINGS = Object.freeze([
  ['## תיאור מורפולוגי', 'ui.md.morphology'],
  ['## ניקוד דרמוסקופי (מחושב בקוד)', 'ui.md.dermoscopy'],
  ['## מאפיינים מורפולוגיים (מדידה דטרמיניסטית)', 'ui.md.morph_measure'],
  ['## 🚩 דגלים אדומים', 'ui.md.red_flags_banner'],
  ['## דגלים אדומים', 'ui.md.red_flags'],
  ['## אלרגנים אפשריים לפי פיזור', 'ui.md.allergens'],
  ['## המלצות המשך', 'ui.md.next_steps'],
  ['## סוג הבדיקה', 'ui.md.exam_type'],
  ['## סריקה שיטתית', 'ui.md.systematic'],
  ['## ממצאים עיקריים', 'ui.md.key_findings'],
  ['## מדידות (מול נורמות-גיל בקוד)', 'ui.md.measurements'],
  ['## מאפייני הדמיה (מדידה דטרמיניסטית, יחסית)', 'ui.md.imaging_features'],
  ['## השוואה למאגר הידע (אבחנות מבדלות)', 'ui.md.kb_compare'],
  ['## השוואה למאגר הידע', 'ui.md.kb_compare_short'],
  ['## דפוסים שקריטריוניהם התקיימו (מנוע דטרמיניסטי)', 'ui.md.ecg_patterns'],
]);

export function localizeMarkdown(md, locale) {
  const loc = resolveLocale(locale);
  if (loc === 'he' || typeof md !== 'string') return md;
  let out = md;
  for (const [he, key] of MD_HEADINGS) {
    if (out.includes(he)) out = out.split(he).join(`## ${t(loc, key)}`);
  }
  const footerHe = 'כלי תמיכה בהחלטות קליניות — אינו אבחנה סופית ואינו תחליף לשיקול דעת רפואי.';
  const footerRad = 'כלי תמיכה בהחלטות קליניות — אינו אבחנה סופית ואינו תחליף לשיקול דעת רדיולוגי.';
  const footer = t(loc, 'ui.decision_support');
  out = out.split(footerHe).join(footer);
  out = out.split(footerRad).join(footer);
  out = out.split('בגבולות הנורמה / ללא ממצא חד-משמעי').join(t(loc, 'ui.normal_limits'));
  return out;
}

/**
 * מצמיד locale/dir. ב-en/ar מתרגם שדות מעוגני מילון.
 */
export function finalizeLocale(result, locale = 'he') {
  if (!result || typeof result !== 'object') return result;
  const loc = resolveLocale(locale);
  const dir = dirFor(loc);
  if (loc === 'he') {
    return { ...result, locale: loc, dir };
  }

  const out = { ...result, locale: loc, dir };
  out.disclaimer_he = t(loc, 'disclaimer.clinical') || DISCLAIMER_HE;
  if (Array.isArray(out.kbItems)) out.kbItems = mapList(out.kbItems, loc);
  if (Array.isArray(out.red_flags)) out.red_flags = mapList(out.red_flags, loc);
  if (Array.isArray(out.safety_alerts)) out.safety_alerts = mapList(out.safety_alerts, loc);
  if (Array.isArray(out.differential)) out.differential = mapList(out.differential, loc);
  if (Array.isArray(out.recommended_tests)) out.recommended_tests = mapList(out.recommended_tests, loc);
  if (Array.isArray(out.notes_he)) out.notes_he = mapList(out.notes_he, loc);
  if (Array.isArray(out.unknowns_he)) out.unknowns_he = mapList(out.unknowns_he, loc);
  if (typeof out.message_he === 'string') out.message_he = translateByKey(loc, out.i18n_key, out.message_he);
  if (typeof out.note_he === 'string') out.note_he = translateByKey(loc, out.i18n_key || 'audio.note', out.note_he);
  if (typeof out.error_he === 'string') out.error_he = translateByKey(loc, out.i18n_error_key, out.error_he);
  if (typeof out.guideline === 'string') out.guideline = translateByKey(loc, out.i18n_guideline_key, out.guideline);
  if (typeof out.analysis === 'string') out.analysis = localizeMarkdown(out.analysis, loc);
  if (out.bands && typeof out.bands === 'object') {
    out.bands = Object.fromEntries(Object.entries(out.bands).map(([k, band]) => {
      if (!band || typeof band !== 'object') return [k, band];
      const key = band.i18n_key || `audio.${k}`;
      return [k, { ...band, label_he: translateByKey(loc, key, band.label_he) }];
    }));
  }
  if (out.factBlock && Array.isArray(out.factBlock.facts)) {
    out.factBlock = {
      ...out.factBlock,
      facts: out.factBlock.facts.map((f) => {
        const key = f.entity_key || f.i18n_key;
        if (!key || !CLINICAL_DICTIONARY[key]) return f;
        return { ...f, text: translateByKey(loc, key, f.text) };
      }),
    };
  }
  return out;
}

export { resolveLocale, dirFor } from './locale.js';
export { CLINICAL_DICTIONARY } from './clinicalDictionary.js';
