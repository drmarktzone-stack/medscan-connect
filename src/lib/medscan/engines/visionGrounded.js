/**
 * MedScan — Grounded Vision Interpretation (רדיולוגיה · ECG · עור)
 *
 * שכבת פרשנות מעוגנת אחת לשלושת מודולי ה-Vision הקיימים.
 * לוקחת את הפלט של המנוע הקיים — לא משנה אותו, לא משכתבת אותו —
 * ומפיקה פרשנות נפרדת שעוברת את כל שכבות האנטי-הזיה.
 *
 * הפלט הקיים נשאר כפי שהוא. זה נוסף לידו.
 */

import { groundedInvoke } from '../gate/groundedInvoke.js';
import { resolveMode } from '../runtimeMode.js';
import { runRulesEngine } from '../rules/rulesEngine.js';
import {
  extractObservationsFor,
  toFindingStrings,
  toPatientFacts,
  extractIndeterminateZones,
} from './visionObservations.js';
import { retrieveEvidence } from '../evidence/evidenceGrounding.js';
import {
  createInvokeLLM,
  loadKnowledgeBase,
  loadVerifiedDrugTerms,
  writeAudit,
} from '../llmAdapter.js';

const BASE_RULES = `אתה מפרש **ממצאים שכבר נצפו** — אינך קורא תמונה.

הממצאים הוויזואליים מופיעים כפריטי P#. הם התצפית של קורא התמונה, ואתה
מקבל אותם כנתון. אל תוסיף ממצא שאינו שם, ואל תפקפק בקריאה עצמה —
אין לך גישה לתמונה.

תפקידך: לקשור בין הממצאים לבין הידע הקליני המאומת (F#), ולהפיק
אבחנה מבדלת מעוגנת.

1. **פרשנות ללא עוגן אינה מוצגת.** אם אין ידע מאומת שמקשר בין הממצא
   למשמעות קלינית — אמור זאת ב-unknowns_he. "נצפה ממצא X ואין לי ידע
   מאומת לפרשנותו" היא תשובה טובה ומלאה.

2. **must_not_miss** — סמן true לכל מצב מסכן-חיים, גם כשסבירותו נמוכה.

3. **אל תמציא מדידות.** אם הממצא לא כלל מספר — אין מספר. אל תעריך.

4. **discriminating_test_he** לכל אבחנה — מה יכריע בינה לבין הבאה.

5. **הקריאה הוויזואלית אינה ראיה מוחלטת.** איכות תמונה ירודה, זווית
   חלקית או ארטיפקט מחלישים כל מסקנה שנשענת עליה — ציין ב-refutes_he.

6. **ספרות (L#)** — קשר דרך literature_support וציין במה המקרה שונה.
   **אל תכתוב PMID/DOI בעצמך.**`;

const MODALITY_RULES = {
  radiology: `
7. **אזור שלא ניתן היה להעריך אינו אזור תקין.** אם סופקו אזורים כאלה —
   הצהר עליהם ב-unknowns_he. פער שלא הוצהר נקרא ככיסוי מלא.`,

  ecg: `
7. **המרווחים שסופקו נמדדו מהתרשים ע"י קורא התמונה** — הם תצפית, לא
   ערך מחושב. צטט אותם כפי שהם ואל תחשב מחדש. אם מרווח לא סופק —
   הוא לא נמדד, ואין לך אותו. אל תעריך אותו מהקצב או מהמראה.

8. **ילדים אינם מבוגרים קטנים ב-ECG.** טווחי נורמה של מרווחים, ציר
   ומורפולוגיה תלויי-גיל באופן חד. אל תיישם סף מבוגרים על ילד —
   אם אין לך ידע מאומת לגיל הרלוונטי, אמור זאת.`,

  skin: `
7. **צבע העור משפיע על המראה.** אותו נגע נראה שונה על גווני עור שונים,
   ורוב תיאורי הספרות מבוססים על עור בהיר. אם סופק Fitzpatrick —
   התייחס אליו כמגביל את הוודאות, וציין זאת ב-refutes_he.

8. **תמונה אחת אינה מהלך.** התפתחות הנגע לאורך זמן היא לרוב המפתח
   האבחוני, והיא אינה בידיך. הצהר על כך.`,
};

const MODALITY_LABEL = { radiology: 'רדיולוגיה', ecg: 'ECG', skin: 'עור' };

/**
 * @param {object} params
 * @param {'radiology'|'ecg'|'skin'} params.modality
 * @param {object} params.engineResult  הפלט של המנוע הקיים (לא משתנה)
 * @param {object} [params.patient]
 * @param {string} [params.clinicalContext]
 */
export async function runGroundedVisionInterpretation({
  modality,
  engineResult,
  patient = {},
  clinicalContext = null,
  mode = resolveMode(),
  withLiterature = true,
}) {
  if (!MODALITY_LABEL[modality]) throw new Error(`Unknown modality: ${modality}`);

  // המנוע נמנע (תמונה לא רלוונטית/לא קריאה) — אין ממצאים, אין מה לפרש.
  if (!engineResult || engineResult.abstain) return null;

  const structured = engineResult.structured;
  const observations = extractObservationsFor(modality, structured);
  if (!observations.length) return null;

  const findings = toFindingStrings(observations);
  const patientData = toPatientFacts(observations, structured, modality);
  const indeterminate = modality === 'radiology' ? extractIndeterminateZones(structured) : [];

  const invokeLLM = createInvokeLLM();

  const [kb, allowedTerms, evidence] = await Promise.all([
    loadKnowledgeBase(),
    loadVerifiedDrugTerms(),
    withLiterature
      ? retrieveEvidence({
          findings, patient, invokeLLM,
          extraContext: structured?.image_metadata ?? null,
        })
      : Promise.resolve({ literature: [], meta: { attempted: false, note_he: 'שליפת ספרות כובתה.' } }),
  ]);

  // ממצא ויזואלי מפעיל דגל אדום מ-KB דטרמיניסטית — לא דרך שיקול דעת המודל
  const grounding = runRulesEngine({
    kb: {
      redFlags: kb.redFlags,
      labPatterns: kb.labPatterns,
      rules: kb.rules,
      associations: kb.associations,
    },
    patient,
    labs: [],
    findings,
    mode,
  });

  const envelope = await groundedInvoke({
    engine: 'differential',
    enginePrompt: BASE_RULES + (MODALITY_RULES[modality] ?? ''),
    grounding,
    patientData,
    literature: evidence.literature,
    invokeLLM,           // ללא file_urls — אנחנו לא קוראים תמונה
    mode,
    knownTopicKeys: kb.knownTopicKeys,
    allowedTerms,
    extraContext: {
      modality: MODALITY_LABEL[modality],
      ...(clinicalContext ? { clinical_context_he: clinicalContext } : {}),
      ...(indeterminate.length ? { zones_not_assessable_he: indeterminate } : {}),
    },
  });

  // אזורים שלא הוערכו — מוצהרים תמיד, גם אם המודל שכח.
  // "לא הוערך" שלא נאמר נקרא כמו "תקין".
  if (indeterminate.length) {
    const note = `אזורים שלא ניתן היה להעריך בתמונה ולכן לא נכללו בפרשנות: ${indeterminate.join(', ')}.`;
    if (!(envelope.unknowns_he ?? []).some((u) => u.includes(indeterminate[0]))) {
      envelope.unknowns_he = [...(envelope.unknowns_he ?? []), note];
    }
  }

  await writeAudit({ engine: `${modality}_grounded`, envelope });

  return {
    ...envelope,
    modality,
    evidence_meta: evidence.meta,
    observations,
    observation_note_he:
      'הממצאים למטה הם הקריאה הוויזואלית של המנוע. הם אינם מעוגנים ב-Knowledge Base ' +
      'ואינם מתיימרים להיות — זו תצפית. הפרשנות שמעליהם עברה אימות עיגון מלא.',
  };
}
