/**
 * MedScan — Must-Not-Miss Enforcement (לוגיקה טהורה)
 *
 * ## הבעיה שהמנגנון הזה פותר
 * אבחנה מבדלת ממוינת לפי סבירות. זה נכון ברוב המקרים — **וזו בדיוק
 * הנקודה שבה היא הופכת מסוכנת**: המצב מסכן-החיים הוא לרוב גם הנדיר,
 * ולכן הוא נוחת בתחתית הרשימה, מתחת לקיפול, ולא נקרא.
 *
 * הפתרון המקובל — לסמן "אסור לפספס" — נשען על שיקול דעת. אם המודל
 * שוכח לסמן, אין סימון, ואף אחד לא ידע שהיה צריך להיות.
 *
 * ## הפתרון כאן
 * הסימון **נאכף בקוד** מתוך ה-KB: פריט ידע שהמנוע הדטרמיניסטי הפעיל
 * וסומן בו `suspicion: 'red'` הוא מסכן-חיים לפי הידע המאומת, בלי קשר
 * למה שהמודל חשב. אם הכיוון המתאים לא סומן — הקוד מסמן אותו.
 *
 * זו הבחנה חשובה: המודל **מציע** must_not_miss; הקוד **מוסיף** את מה
 * שהידע מחייב. אין הסרה — רק הוספה. בטיחות היא חד-כיוונית.
 */

import { normalizeText } from '../rules/rulesEngine.js';

/**
 * מאתר פריטי KB אדומים שהופעלו, וממפה אותם לטקסט שניתן להשוות אליו.
 */
export function collectRedKbItems(grounding = {}) {
  const items = [
    ...(grounding.matchedPatterns ?? []),
    ...(grounding.firedRules ?? []),
    ...(grounding.associations ?? []),
    ...(grounding.matchedSyndromes ?? []),
  ].filter((i) => i.suspicion === 'red');

  return items.map((i) => ({
    entity_key: i.pattern_key ?? i.rule_key ?? i.assoc_key ?? null,
    label_he: i.title_he ?? i.implies_he ?? i.direction_he ?? i.conclusion_he ?? '',
    implies_he: i.implies_he ?? i.direction_he ?? i.conclusion_he ?? '',
    source_anchor: i.source_anchor ?? null,
  }));
}

/** האם הכיוון מתייחס לפריט ה-KB האדום הזה. */
function directionCovers(direction, redItem) {
  const refs = new Set([
    ...(direction.based_on_patterns ?? []),
    ...(direction.source_anchors ?? []),
  ]);
  if (redItem.entity_key && refs.has(redItem.entity_key)) return true;
  if (redItem.source_anchor && refs.has(redItem.source_anchor)) return true;

  // התאמה טקסטואלית — גסה בכוונה. עדיף לסמן כיוון אחד מיותר
  // כ"אסור לפספס" מאשר להחמיץ אחד.
  const dirText = normalizeText(direction.diagnosis_direction_he ?? '');
  const implies = normalizeText(redItem.implies_he ?? '');
  if (!dirText || !implies) return false;
  if (dirText.includes(implies) || implies.includes(dirText)) return true;

  const words = implies.split(/\s+/).filter((w) => w.length >= 3);
  const hits = words.filter((w) => dirText.includes(w)).length;
  return words.length > 0 && hits >= Math.min(2, words.length);
}

/**
 * אוכף את סימון must_not_miss.
 *
 * @returns {{differential: object[], enforced: object[], uncoveredRed: object[]}}
 *   enforced    — כיוונים שהקוד סימן והמודל לא
 *   uncoveredRed— פריטי ידע אדומים שאף כיוון לא כיסה (השמטה אמיתית)
 */
export function enforceMustNotMiss({ differential = [], grounding = {} }) {
  const redItems = collectRedKbItems(grounding);
  if (!redItems.length) {
    return { differential, enforced: [], uncoveredRed: [] };
  }

  const list = differential.map((d) => ({ ...d }));
  const enforced = [];
  const uncoveredRed = [];

  for (const red of redItems) {
    const match = list.find((d) => directionCovers(d, red));

    if (!match) {
      uncoveredRed.push(red);
      continue;
    }

    if (!match.must_not_miss) {
      match.must_not_miss = true;
      match.must_not_miss_enforced_by_code = true;
      match.must_not_miss_reason_he =
        `סומן אוטומטית: הידע המאומת (${red.source_anchor ?? red.entity_key ?? 'KB'}) ` +
        'מגדיר מצב זה כמסכן-חיים. הסימון אינו תלוי בשיקול דעת מנוע הנימוק.';
      enforced.push({
        direction_id: match.direction_id,
        direction_he: match.diagnosis_direction_he,
        because_of: red.entity_key ?? red.source_anchor,
      });
    }
  }

  return { differential: list, enforced, uncoveredRed };
}

/**
 * מיון תצוגה: "אסור לפספס" תמיד ראשונים, ובתוך כל קבוצה לפי rank.
 *
 * זו הנקודה שבה מיון לפי סבירות הופך למסוכן — ולכן היא מופרדת
 * מהמיון של המודל ונעשית בקוד.
 */
export function sortForDisplay(differential = []) {
  return [...differential].sort((a, b) => {
    if (Boolean(a.must_not_miss) !== Boolean(b.must_not_miss)) {
      return a.must_not_miss ? -1 : 1;
    }
    return (a.rank ?? 99) - (b.rank ?? 99);
  });
}
