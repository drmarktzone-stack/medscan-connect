/**
 * MedScan — Knowledge Extraction: Pure Logic
 *
 * מופרד מ-`knowledgeIngestion.js` בכוונה: כאן אין I/O ואין תלות
 * ב-Base44, ולכן הלוגיקה הרגישה ביותר בייבוא — גילוי תפר וולידציית
 * החילוץ — ניתנת לבדיקה בלי האפליקציה כולה.
 *
 * זהו הרגע היחיד שבו תוכן קליני נכנס למערכת. כל שאר השכבות מגינות
 * על הפלט; אם החילוץ יכניס טעות, היא תעבור את כולן — כי היא תיראה
 * כמו ידע מאומת.
 */

import { resolveAnalyte } from '../deterministic/analyteCatalog.js';
import { EXTRACTION_SCHEMA, EXTRACTION_SYSTEM_PROMPT } from './extractionSchema.js';

/** גודל קטע לחילוץ. גדול מדי → המודל מסכם; קטן מדי → מאבד הקשר. */
export const CHUNK_CHARS = 6000;

/**
 * גילוי "תפר" — שתי עמודות שנתפרו לשורה אחת.
 *
 * ## למה זה הבדיקה החשובה ביותר בשלב הייבוא
 * מסמכים רפואיים נכתבים שכיחות בשתי עמודות — לעיתים שתי **מחלות
 * שונות** זו לצד זו. כשה-PDF משטח אותן לשורה אחת, מתקבל משפט
 * שנראה קוהרנטי ומערבב עובדות משתי מחלות.
 *
 * זה הגרוע מכל: המודל יחלץ ממנו ידע שנראה תקין, הוא יישא
 * ציטוט-מקור אמיתי, והרופא/ה יאשר/תאשר אותו — כי הציטוט אכן
 * מופיע במסמך. רק שהוא מעולם לא נכתב כמשפט אחד.
 */
/**
 * שורת-הוכחה: דפוס שאינו נוצר בטקסט תקין, ולכן נוכחותו
 * מספיקה — אין צורך בשיעור.
 *
 * רשימת תבליטים לגיטימית מתחילה בראש שורה ומופיעה פעם אחת בה.
 * תבליט שני באותה שורה, או תבליט אחרי טקסט עברי, פירושו ששני
 * שברי-עמודה נתפרו לשורה אחת.
 */
const SEAM_PROOF = [
  { re: /[֐-׿][^\n]*\s•\s*\S/, why: 'תבליט אחרי טקסט עברי באותה שורה' },
  { re: /•[^\n]*•/, why: 'שני תבליטים באותה שורה' },
];

/**
 * רמז: דפוס שעלול להופיע גם בטקסט תקין, ולכן נשקל לפי שיעור.
 */
const SEAM_HINTS = [
  { re: /[֐-׿][:)\]][֐-׿]/, why: 'מעבר עברית→עברית בלי רווח אחרי סימן פיסוק' },
  { re: /\)\s*•/, why: 'סוגר-סוגריים צמוד לתבליט' },
];

/**
 * ⚠ כלל שהוסר: «סוגר סוגריים ללא פותח» — /\)[^(]*$/
 *
 * הכלל נראה נכון והיה שגוי לחלוטין עבור עברית. בטקסט RTL
 * שחולץ מ-PDF, הסוגריים נשמרים בסדר לוגי ולכן «)טקסט(» הוא
 * המצב הרגיל, לא החריג.
 *
 * מדידה על הספר בפועל: הכלל לבדו סימן 39% מהתאים כמשובשים
 * (42% מהתווים), בעוד שיתר הכללים יחד מסמנים 2%. הוא היה
 * חוסם מעל ל-40% מהספר מחילוץ — ומדווח את זה כהגנה שפעלה.
 *
 * זהו כשל הפוך מהרגיל כאן ולכן קשה לראות: בדיקה שנכשלת לצד
 * החמרה נראית כמו בטיחות, והמחיר — ידע שמעולם לא נכנס — שקוף.
 */

/**
 * ⚠ למה ההכרעה אינה לפי שיעור בלבד
 *
 * בגרסה קודמת ההכרעה היתה שיעור השורות המסומנות. זה מחמיץ
 * בדיוק את המקרים החמורים: בתא ארוך שממזג שתי עמודות, רק
 * השורות שבהן היה טקסט בשתי העמודות נושאות סימן. תא בן 46
 * שורות שהוא ודאית ממוזג קיבל 11% — מתחת לכל סף סביר.
 *
 * לכן שתי רמות: **הוכחה** (נוכחות מספיקה) ו**רמז** (שיעור).
 * מדידה על הספר בפועל: ההפרדה מוחלטת — כל תא שנראה ממוזג
 * נושא שורת-הוכחה, וכל תא נקי הוא אפס. 66 מתוך 2,131.
 *
 * ⚠ הדפוס מציין תבליט • בלבד, לא o. בטקסט RTL שחולץ מ-PDF,
 * שורה כמו «o Early-onset (…)» נשמרת כ-«Early-onset o (…)» —
 * ה-o נראה באמצע השורה אבל זה סידור דו-כיווני, לא מיזוג.
 *
 * @returns {{score: number, lines: object[], verdict: 'clean'|'suspect'|'corrupt'}}
 */
export function detectSeams(text) {
  const lines = String(text ?? '').split('\n').filter((l) => l.trim().length > 20);
  if (!lines.length) return { score: 0, lines: [], verdict: 'clean', total_lines: 0 };

  const flagged = [];
  let proofLines = 0;
  let hintLines = 0;

  for (const line of lines) {
    const proofs = SEAM_PROOF.filter((p) => p.re.test(line));
    const hints = SEAM_HINTS.filter((p) => p.re.test(line));
    if (proofs.length) proofLines += 1;
    else if (hints.length) hintLines += 1;
    if (proofs.length || hints.length) {
      flagged.push({
        line: line.slice(0, 120),
        reasons: [...proofs, ...hints].map((h) => h.why),
        proof: proofs.length > 0,
      });
    }
  }

  const hintScore = hintLines / lines.length;
  const verdict = proofLines > 0 ? 'corrupt'
    : hintScore > 0.25 ? 'corrupt'
    : hintScore > 0.08 ? 'suspect'
    : 'clean';

  return {
    score: Number(((proofLines + hintLines) / lines.length).toFixed(3)),
    proof_lines: proofLines,
    lines: flagged.slice(0, 8),
    verdict,
    total_lines: lines.length,
  };
}

/**
 * מפצל טקסט לקטעים, בגבולות טבעיים.
 * חיתוך באמצע נושא גורם לחילוץ חלקי שנראה שלם — לכן מעדיפים
 * גבול פסקה, ורק כמוצא אחרון חותכים באמצע.
 */
export function chunkText(text, maxChars = CHUNK_CHARS) {
  const clean = String(text ?? '').trim();
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];

  const chunks = [];
  let rest = clean;

  while (rest.length > maxChars) {
    const slice = rest.slice(0, maxChars);
    // עדיפות: שורה ריקה > סוף שורה > נקודה
    let cut = slice.lastIndexOf('\n\n');
    if (cut < maxChars * 0.5) cut = slice.lastIndexOf('\n');
    if (cut < maxChars * 0.5) cut = slice.lastIndexOf('. ');
    if (cut < maxChars * 0.5) cut = maxChars;

    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

/**
 * מחלץ ידע מקטע טקסט אחד.
 * @returns {Promise<{extraction: object|null, error: string|null}>}
 */
export async function extractFromChunk({ text, chapterHint = null, invokeLLM }) {
  try {
    const result = await invokeLLM({
      system: EXTRACTION_SYSTEM_PROMPT,
      prompt: [
        chapterHint ? `הקשר: ${chapterHint}` : '',
        '',
        'הטקסט לחילוץ:',
        '---',
        text,
        '---',
        '',
        'חלץ ידע מובנה. זכור: ציטוט-מקור לכל פריט, ואל תשלים מהידע שלך.',
      ].filter(Boolean).join('\n'),
      schema: EXTRACTION_SCHEMA,
      purpose: 'knowledge_extraction',
    });

    if (!result || typeof result !== 'object') {
      return { extraction: null, error: 'extraction_malformed' };
    }
    return { extraction: result, error: null };
  } catch (e) {
    return { extraction: null, error: String(e?.message ?? e) };
  }
}

/**
 * בדיקות תקינות דטרמיניסטיות על החילוץ — לפני שהוא מגיע לרופא/ה.
 * מסננות את מה שניתן לפסול בקוד, כדי שזמן הבדיקה האנושי יילך
 * למה שבאמת דורש שיקול דעת.
 */
export function validateExtraction(extraction, { knownTopicKeys = null } = {}) {
  const problems = [];

  // ⚠ עוגן תקף הוא עוגן שהנושא שלו קיים — באותה אצווה **או**
  // כבר ב-KB. הגרסה הקודמת הכירה רק את האצווה, ולכן טעינה
  // מצטברת נשברה בשקט: קובץ שטוען כללים לנושא שנטען קודם
  // ראה את כל כלליו נזרקים, עם נימוק שנשמע נכון.
  const topicKeys = new Set([
    ...(extraction?.topics ?? []).map((t) => t.topic_key),
    ...(knownTopicKeys ?? []),
  ]);

  const checkAnchor = (item, kind, key) => {
    if (!item.source_anchor) {
      problems.push({ kind, key, severity: 'drop', why_he: 'אין עוגן לנושא' });
      return false;
    }
    if (!topicKeys.has(item.source_anchor)) {
      problems.push({
        kind, key, severity: 'drop', code: 'dangling_anchor',
        anchor: item.source_anchor,
        why_he: `העוגן "${item.source_anchor}" אינו מצביע על נושא קיים — לא באצווה זו ולא ב-KB`,
      });
      return false;
    }
    return true;
  };

  const checkQuote = (item, kind, key) => {
    const q = item.source_quote_he;
    if (!q || q.trim().length < 10) {
      problems.push({ kind, key, severity: 'drop', why_he: 'אין ציטוט-מקור — לא ניתן לבדוק' });
      return false;
    }
    return true;
  };

  const kept = { topics: [], lab_patterns: [], red_flags: [], clinical_rules: [], associations: [] };

  for (const t of extraction?.topics ?? []) {
    if (!checkQuote(t, 'topic', t.topic_key)) continue;
    // ⚠ הדפוס חייב להיות מודע-יוניקוד. הגרסה הקודמת היתה [a-z0-9_]
    // ולכן התריעה על **כל** העוגנים שהספר מייצר. אזהרה
    // שנורית על הכל אינה אזהרה — היא רעש שמאמן להתעלם גם
    // מאזהרות אמיתיות.
    //
    // שני פורמטים מוכרים, וההבדל ביניהם אינו סגנוני:
    //   nelson22.c<פרק>.<נושא>  — עוגן למקור המלא, עם מספר פרק אמיתי
    //   nelson.<תחום>.<נושא>     — עוגן לספרון הסיכומים העברי
    //
    // הצורה השנייה אינה ניתנת לאימות מול מקור: אין בה פרק
    // ואין בה עמוד, ולכן רופא/ה אינו יכול/ה לבדוק אותה ולחתום.
    // לכן האזהרה מצביעה עליה, ולא על הצורה החדשה.
    const key = t.topic_key ?? '';
    const isAnchored = /^nelson22\.c\d+\.[\p{L}\p{N}_]+$/u.test(key);
    const isLegacy = /^nelson\.[\p{L}\p{N}_]+\.[\p{L}\p{N}_]+$/u.test(key);

    if (!isAnchored && !isLegacy) {
      problems.push({
        kind: 'topic', key, severity: 'warn',
        why_he: 'topic_key אינו בפורמט nelson22.c<פרק>.<נושא> ולא בפורמט nelson.<תחום>.<נושא>',
      });
    } else if (isLegacy) {
      problems.push({
        kind: 'topic', key, severity: 'warn',
        why_he:
          'עוגן לספרון הסיכומים ולא למקור המלא. אין בו פרק ולא עמוד, ' +
          'ולכן לא ניתן לאמת אותו מול נלסון ולחתום עליו כ-verified.',
      });
    }
    kept.topics.push(t);
  }

  for (const p of extraction?.lab_patterns ?? []) {
    if (!checkQuote(p, 'lab_pattern', p.pattern_key)) continue;
    if (!checkAnchor(p, 'lab_pattern', p.pattern_key)) continue;

    // מדד שאינו בקטלוג לא יתאים לעולם — עדיף לדעת עכשיו
    const unknown = (p.components ?? [])
      .filter((c) => !resolveAnalyte(c.analyte))
      .map((c) => c.analyte);
    if (unknown.length) {
      problems.push({
        kind: 'lab_pattern', key: p.pattern_key, severity: 'warn',
        why_he: `מדדים שאינם בקטלוג ולכן לא יופעלו: ${unknown.join(', ')}`,
      });
    }
    kept.lab_patterns.push(p);
  }

  for (const f of extraction?.red_flags ?? []) {
    if (!checkQuote(f, 'red_flag', f.flag_key)) continue;
    if (!checkAnchor(f, 'red_flag', f.flag_key)) continue;
    if (!(f.trigger?.findings ?? []).length) {
      problems.push({ kind: 'red_flag', key: f.flag_key, severity: 'drop', why_he: 'אין תנאי הפעלה' });
      continue;
    }
    // חלון גיל הפוך = תקלת חילוץ, והדגל לעולם לא ייורה
    if (Number.isFinite(f.age_min_days) && Number.isFinite(f.age_max_days)
        && f.age_min_days > f.age_max_days) {
      problems.push({ kind: 'red_flag', key: f.flag_key, severity: 'drop', why_he: 'חלון גיל הפוך' });
      continue;
    }
    kept.red_flags.push(f);
  }

  for (const r of extraction?.clinical_rules ?? []) {
    if (!checkQuote(r, 'clinical_rule', r.rule_key)) continue;
    if (!checkAnchor(r, 'clinical_rule', r.rule_key)) continue;

    // מינון שדלף לתוך כלל — נפסל. כללים אינם מקום למינון.
    const text = `${r.conclusion_he ?? ''} ${(r.recommended_workup_he ?? []).join(' ')}`;
    if (/\d+\s*(מ["׳']?ג|mg|mcg|מ["׳']?ל|ml)\s*\/\s*(ק["׳']?ג|kg)/i.test(text)) {
      problems.push({
        kind: 'clinical_rule', key: r.rule_key, severity: 'drop',
        why_he: 'הכלל מכיל מינון. מינונים שייכים ל-DoseRecord בלבד.',
      });
      continue;
    }
    kept.clinical_rules.push(r);
  }

  for (const a of extraction?.associations ?? []) {
    if (!checkQuote(a, 'association', a.assoc_key)) continue;
    if (!checkAnchor(a, 'association', a.assoc_key)) continue;
    kept.associations.push(a);
  }

  // חילוץ עשיר בלי ולו פער אחד מוצהר הוא חשוד
  const totalItems =
    kept.lab_patterns.length + kept.red_flags.length +
    kept.clinical_rules.length + kept.associations.length;
  if (totalItems >= 3 && !(extraction?.gaps_he ?? []).length) {
    problems.push({
      kind: 'extraction', key: '—', severity: 'warn',
      why_he: 'לא הוצהר שום פער. בקטע עשיר זה בדרך כלל אומר שמשהו הושלם במקום לדווח עליו.',
    });
  }

  return { kept, problems, dropped: problems.filter((p) => p.severity === 'drop').length };
}

