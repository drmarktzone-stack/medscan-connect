/**
 * MedScan — פענוח אובייקט-ליטרל של JavaScript, בלי הרצת קוד
 *
 * ## למה זה קיים
 * מבנה `BOOK` בקובץ הטבלאות הוא אובייקט JS, לא JSON: מפתחות ללא
 * מרכאות, מחרוזות בגרש בודד, ופסיקים נגררים.
 *
 * הגרסה הראשונה המירה אותו ל-JSON ברג'קס. זה נכשל, ובאופן מסוכן:
 *
 *   הדפוס  /([{,]\s*)([A-Za-z_$][\w$]*)\s*:/  נועד לצטט מפתחות,
 *   אבל הוא אינו יודע מה מחרוזת. בטקסט הקליני
 *
 *     «סרוטיפים אופיניים ל-Ia, Ib, II, III, V :Early onset»
 *
 *   הוא תפס את «, V :» והפך אותו ל-«, "V":» — **בתוך משפט רפואי**.
 *
 * כאן זה נכשל ברעש, ולכן התגלה. הסכנה האמיתית היא המקרים שבהם
 * המרה כזו מצליחה: אז היא משנה תוכן קליני בשקט, והתוצאה נראית תקינה.
 *
 * לכן אין כאן המרה בכלל. יש פרסר יורד-רקורסיבי שקורא את המבנה
 * ישירות. הוא יודע בכל רגע אם הוא בתוך מחרוזת, ולכן אינו יכול
 * לגעת בתוכן.
 *
 * ⚠ אין `eval` ואין `new Function`. הקובץ שהמשתמש מעלה הוא קלט
 * חיצוני; לא נריץ ממנו JavaScript.
 */

/** התו פותח שם-מפתח לא-מצוטט. */
const isIdentStart = (c) => /[A-Za-z_$]/.test(c);
const isIdentPart = (c) => /[\w$]/.test(c);

const ESCAPES = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0' };

export function parseJsLiteral(source) {
  const src = String(source ?? '');
  let i = 0;

  const fail = (msg) => {
    const around = src.slice(Math.max(0, i - 60), i + 60).replace(/\n/g, '⏎');
    throw new Error(`${msg} במיקום ${i}\n…${around}…`);
  };

  const skipWs = () => {
    while (i < src.length) {
      const c = src[i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v' || c === ' ') {
        i += 1;
      } else if (c === '/' && src[i + 1] === '/') {
        while (i < src.length && src[i] !== '\n') i += 1;
      } else if (c === '/' && src[i + 1] === '*') {
        i += 2;
        while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i += 1;
        i += 2;
      } else break;
    }
  };

  const parseString = () => {
    const quote = src[i];
    i += 1;
    let out = '';
    while (i < src.length) {
      const c = src[i];
      if (c === '\\') {
        const next = src[i + 1];
        if (next === 'u') {
          out += String.fromCharCode(parseInt(src.slice(i + 2, i + 6), 16));
          i += 6;
        } else if (next === 'x') {
          out += String.fromCharCode(parseInt(src.slice(i + 2, i + 4), 16));
          i += 4;
        } else if (next === '\n') {
          i += 2; // המשך שורה בליטרל תבנית
        } else {
          out += ESCAPES[next] ?? next;
          i += 2;
        }
        continue;
      }
      if (c === quote) { i += 1; return out; }
      out += c;
      i += 1;
    }
    fail('מחרוזת לא נסגרה');
    return null;
  };

  const parseNumber = () => {
    const start = i;
    if (src[i] === '+' || src[i] === '-') i += 1;
    while (i < src.length && /[\d.eE+-]/.test(src[i])) {
      // מונע בליעת סימן מהאיבר הבא: 1e-5 תקין, אבל 1-5 אינו מספר אחד
      if ((src[i] === '+' || src[i] === '-') && !/[eE]/.test(src[i - 1])) break;
      i += 1;
    }
    const raw = src.slice(start, i);
    const n = Number(raw);
    if (!Number.isFinite(n)) fail(`מספר לא תקין "${raw}"`);
    return n;
  };

  const parseKey = () => {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') return parseString();
    if (isIdentStart(c)) {
      const start = i;
      while (i < src.length && isIdentPart(src[i])) i += 1;
      return src.slice(start, i);
    }
    return fail('מפתח לא תקין');
  };

  const parseObject = () => {
    i += 1; // {
    const obj = {};
    skipWs();
    if (src[i] === '}') { i += 1; return obj; }

    for (;;) {
      skipWs();
      if (src[i] === '}') { i += 1; return obj; } // פסיק נגרר
      const key = parseKey();
      skipWs();
      if (src[i] !== ':') fail(`ציפינו ל-":" אחרי המפתח "${key}"`);
      i += 1;
      obj[key] = parseValue();
      skipWs();
      if (src[i] === ',') { i += 1; continue; }
      if (src[i] === '}') { i += 1; return obj; }
      fail('ציפינו ל-"," או "}"');
    }
  };

  const parseArray = () => {
    i += 1; // [
    const arr = [];
    skipWs();
    if (src[i] === ']') { i += 1; return arr; }

    for (;;) {
      skipWs();
      if (src[i] === ']') { i += 1; return arr; } // פסיק נגרר
      if (src[i] === ',') { i += 1; arr.push(null); continue; } // חור במערך
      arr.push(parseValue());
      skipWs();
      if (src[i] === ',') { i += 1; continue; }
      if (src[i] === ']') { i += 1; return arr; }
      fail('ציפינו ל-"," או "]"');
    }
  };

  const parseValue = () => {
    skipWs();
    const c = src[i];
    if (c === undefined) return fail('סוף קלט בלתי צפוי');
    if (c === '{') return parseObject();
    if (c === '[') return parseArray();
    if (c === '"' || c === "'" || c === '`') return parseString();
    if (src.startsWith('true', i)) { i += 4; return true; }
    if (src.startsWith('false', i)) { i += 5; return false; }
    if (src.startsWith('null', i)) { i += 4; return null; }
    if (src.startsWith('undefined', i)) { i += 9; return null; }
    if (/[\d+.-]/.test(c)) return parseNumber();
    return fail(`ערך לא מזוהה "${c}"`);
  };

  const value = parseValue();
  skipWs();
  if (i < src.length) fail('תוכן עודף אחרי סוף המבנה');
  return value;
}
