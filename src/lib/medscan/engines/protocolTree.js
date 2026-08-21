/**
 * MedScan — Protocol Tree Navigation & Validation (לוגיקה טהורה)
 *
 * מופרד מ-`protocolRunner.js` בכוונה: כאן אין I/O ואין תלות ב-Base44,
 * ולכן הלוגיקה הרגישה ביותר במנוע — זיהוי צעד מומצא — ניתנת לבדיקה
 * ב-node בלי האפליקציה כולה.
 *
 * ## למה זה הקוד הרגיש ביותר במערכת
 * במנועי המעבדה וההקשר, סטייה של המודל מייצרת כיוון שגוי — רע, אך
 * הרופא/ה עדיין מפעיל/ה שיקול דעת עליו. בפרוטוקול סטייה מייצרת
 * **צעד**, וצעד נראה כמו הוראה מאושרת. לכן כל מזהה ופעולה בפלט
 * נבדקים מול הפרוטוקול בפועל.
 */

/**
 * בונה אינדקס שלבים ומאתר את השלב הנוכחי. דטרמיניסטי לחלוטין.
 */
export function resolveStep(protocol, currentStepId) {
  const steps = protocol?.steps ?? [];
  const index = new Map(steps.map((s) => [s.step_id, s]));

  if (!steps.length) {
    return { step: null, index, brokenBranches: [], error_he: 'הפרוטוקול אינו מכיל שלבים.' };
  }

  const step = currentStepId ? index.get(currentStepId) : steps[0];
  if (!step) {
    return {
      step: null,
      index,
      brokenBranches: [],
      error_he: `השלב "${currentStepId}" אינו קיים בפרוטוקול "${protocol.protocol_key}".`,
    };
  }

  // הסתעפות שמפנה לשלב שאינו קיים היא פגם **בפרוטוקול עצמו**, לא במודל.
  // עדיף לגלות אותו כאן מאשר ברגע שרופא/ה ילחץ/תלחץ עליו במיטת החולה.
  const brokenBranches = (step.branches ?? []).filter((b) => !index.has(b.next_step_id));

  return { step, index, brokenBranches, error_he: null };
}

/**
 * ולידציה ייחודית לפרוטוקול: כל מזהה ופעולה בפלט חייבים להתקיים בפועל.
 */
export function validateProtocolOutput({ output, protocol, stepIndex, allowedActions }) {
  const violations = [];

  const outStepId = output?.current_step?.step_id;
  if (outStepId && !stepIndex.has(outStepId)) {
    violations.push({
      code: 'fabricated_step',
      severity: 'block',
      message_he:
        `הפלט מתייחס לשלב "${outStepId}" שאינו קיים בפרוטוקול. ` +
        'שלב מומצא נראה לרופא/ה כחלק מהפרוטוקול המאושר — זהו הכשל החמור ביותר במנוע זה.',
    });
  }

  for (const b of output?.branch_options ?? []) {
    if (!stepIndex.has(b.next_step_id)) {
      violations.push({
        code: 'fabricated_branch',
        severity: 'block',
        message_he: `ההסתעפות מפנה לשלב "${b.next_step_id}" שאינו קיים בפרוטוקול.`,
      });
    }
  }

  // פעולה שאינה ברשימה שסופקה = פעולה שהמודל הוסיף.
  // מותר לו לנסח מחדש (חפיפה מהותית), אסור לו להוסיף.
  const allowed = new Set((allowedActions ?? []).map((a) => String(a).trim()));
  for (const a of output?.current_step?.actions_he ?? []) {
    const clean = String(a).trim();
    if (allowed.has(clean)) continue;
    const overlaps = [...allowed].some((orig) => orig.includes(clean) || clean.includes(orig));
    if (!overlaps) {
      violations.push({
        code: 'added_protocol_action',
        severity: 'block',
        message_he:
          `הפלט כולל פעולה שאינה בפרוטוקול: "${clean}". ` +
          'פעולה שנוספה ע"י מנוע הנימוק נקראת כחלק מהפרוטוקול המאושר.',
      });
    }
  }

  if (protocol?.protocol_key && output?.protocol_key &&
      output.protocol_key !== protocol.protocol_key) {
    violations.push({
      code: 'protocol_key_mismatch',
      severity: 'block',
      message_he: 'מזהה הפרוטוקול בפלט אינו תואם לפרוטוקול שנטען.',
    });
  }

  return { violations, blocking: violations.filter((v) => v.severity === 'block') };
}

/** ממפה deterministic_refs של שלב לבקשות מחשבון. */
export function buildCalcRequests({ step, patient, doseRecords = [] }) {
  const requests = [];
  for (const ref of step?.deterministic_refs ?? []) {
    if (/fluid/i.test(ref)) {
      requests.push({ type: 'maintenance_fluids', params: { weight_kg: patient.weight_kg } });
    } else if (/bsa/i.test(ref)) {
      requests.push({
        type: 'bsa',
        params: { height_cm: patient.height_cm, weight_kg: patient.weight_kg },
      });
    } else if (/dos/i.test(ref)) {
      const rec = doseRecords.find((d) => ref.includes(d.drug_key));
      requests.push({
        type: 'dose',
        params: {
          weight_kg: patient.weight_kg,
          age_days: patient.age_days,
          doseRecord: rec ?? null,   // בלי רשומה מאומתת — המחשבון יסרב
        },
      });
    }
  }
  return requests;
}
