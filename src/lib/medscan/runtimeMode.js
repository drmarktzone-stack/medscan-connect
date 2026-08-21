/**
 * MedScan — Runtime Mode (מצב קליני / פילוט)
 *
 * ═══════════════════════════════════════════════════════════════════════
 *  החלטה בשליטת הרופא/ה — לא ברירת מחדל שקטה
 * ═══════════════════════════════════════════════════════════════════════
 *
 * כל מנועי הנימוק (מעבדה / אבחנה-מבדלת / פרוטוקול / הקשר-מטופל)
 * עוברים דרך שער העיגון. לשער שני מצבים:
 *
 *   'clinical'    — ברירת המחדל. מקבל רק ידע שאומת (verified).
 *                   טיוטות נדחות — הכלי מסרב במקום להציג ידע לא-מאומת.
 *   'development' — “מצב פילוט”. מקבל גם טיוטות (מעוגנות-מקור),
 *                   כל אחת מסומנת בבירור “לא מאומת”. מאפשר לרופא/ה
 *                   לראות את הכלי מתפקד מקצה-לקצה לפני שהידע אומת —
 *                   לצורך הדגמה, הרצה ובדיקה. **לא לשימוש קליני מחייב.**
 *
 * ברירת המחדל היא תמיד clinical. מצב פילוט נדלק רק בבחירה
 * מפורשת של הרופא/ה, ומלווה באזהרה גלובלית קבועה על המסך.
 *
 * node/SSR (בדיקות): אין localStorage → resolveMode מחזיר 'clinical'.
 * ═══════════════════════════════════════════════════════════════════════
 */

const KEY = 'medscan.pilotMode';

export function isPilotMode() {
  try {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setPilotMode(on) {
  try {
    if (typeof localStorage === 'undefined') return;
    if (on) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    /* אחסון חסום — נשארים ב-clinical */
  }
}

/**
 * ממפה מצב-ריצה ל-mode של שער העיגון.
 * @param {string} [explicit] אם סופק 'clinical'/'development' — גובר על ההעדפה.
 * @returns {'clinical'|'development'}
 */
export function resolveMode(explicit) {
  if (explicit === 'clinical' || explicit === 'development') return explicit;
  return isPilotMode() ? 'development' : 'clinical';
}
