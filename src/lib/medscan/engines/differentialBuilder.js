/**
 * MedScan — Differential Diagnosis Builder (P1)
 *
 * בונה אבחנה מבדלת מדורגת מממצאים קליניים ומעבדה.
 *
 * ## מה מייחד אותו
 * זהו המנוע היחיד שמפיק **רשימה ממוינת**, וזו בדיוק נקודת הסיכון שלו:
 * מיון לפי סבירות דוחף את המצב מסכן-החיים לתחתית, כי הוא לרוב גם הנדיר.
 *
 * שני מנגנונים מטפלים בזה, שניהם בקוד ולא בשיקול דעת המודל:
 *   1. `enforceMustNotMiss` — הידע המאומת קובע מה מסכן-חיים, לא המודל
 *   2. `sortForDisplay`     — "אסור לפספס" תמיד בראש, בלי קשר ל-rank
 */

import { groundedInvoke } from '../gate/groundedInvoke.js';
import { resolveMode } from '../runtimeMode.js';
import { runRulesEngine } from '../rules/rulesEngine.js';
import { normalizeLabs, toPatientFacts, toAgeDays } from '../deterministic/labNormalize.js';
import { loadReferenceRanges } from '../deterministic/refRanges.js';
import { retrieveEvidence } from '../evidence/evidenceGrounding.js';
import { enforceMustNotMiss, sortForDisplay } from './mustNotMiss.js';
import {
  createInvokeLLM,
  loadKnowledgeBase,
  loadVerifiedDrugTerms,
  loadReferenceRangePayload,
  writeAudit,
} from '../llmAdapter.js';
import { finalizeLocale } from '../i18n/localize.js';

const ENGINE_PROMPT = `אתה בונה **אבחנה מבדלת מדורגת** מממצאים שסופקו.

הממצאים מגיעים כ-P#, הידע המאומת כ-F#, ערכים מחושבים כ-D#, ספרות כ-L#.

כללים ייחודיים למנוע הזה:

1. **rank לפי סבירות.** דרג מהסביר ביותר לפחות, על סמך הממצאים שסופקו.

2. **must_not_miss לפי חומרה, לא לפי סבירות.** סמן true לכל מצב
   מסכן-חיים שאסור לפספס — **גם כשסבירותו נמוכה מאוד**. אלה שני צירים
   נפרדים: אבחנה יכולה להיות rank 7 ועדיין must_not_miss.
   הערה: הקוד יוסיף סימון בעצמו לכל מצב שהידע המאומת מגדיר כמסכן-חיים.
   אל תסמוך על כך — סמן בעצמך.

3. **discriminating_test_he חובה לכל פריט.** מה יכריע בינו לבין הבא
   אחריו. זו השורה השימושית ביותר לרופא/ה, וללא זה הרשימה היא רק
   רשימה.

4. **כל פריט צריך refutes_he.** אבחנה שאין דבר שישולל אותה אינה
   אבחנה מבדלת — היא ניחוש.

5. **אל תמציא מצב שאין לו עוגן.** אם עולה בדעתך אבחנה שאין לה תמיכה
   ב-F# — הצהר עליה ב-unknowns_he כ"נשקלה ולא ניתן לעגן", אל תכניס
   אותה לרשימה.

6. **אל תמציא מספרים.** ספים, אחוזים, שכיחויות — רק מ-D# או מהמקור.

7. **ספרות (L#)** — קשר דרך literature_support. אל תכתוב PMID/DOI.`;

/**
 * @param {object} params
 * @param {object} params.patient
 * @param {string[]} params.findings   ממצאים קליניים
 * @param {object[]} [params.labs]
 * @param {string} [params.presentation] תיאור קליני חופשי
 */
export async function runDifferentialBuilder({
  patient = {},
  findings = [],
  labs = [],
  presentation = null,
  mode = resolveMode(),
  withLiterature = true,
  locale = 'he',
}) {
  const ageDays = toAgeDays(patient);
  const pt = { ...patient, age_days: ageDays };

  if (!findings.length && !labs.length) {
    return finalizeLocale({
      status: 'input_error',
      i18n_key: 'ddx.empty',
      message_he: 'לא הוזנו ממצאים או תוצאות מעבדה. אין ממה לבנות אבחנה מבדלת.',
    }, locale);
  }

  // ── נרמול מעבדה (אם הוזנה) ───────────────────────────────────────────
  let normalized = [];
  let missingRanges = [];
  let labWarnings = [];
  if (labs.length) {
    loadReferenceRanges(await loadReferenceRangePayload());
    const r = normalizeLabs({ labs, patient: pt });
    normalized = r.normalized;
    missingRanges = r.missingRanges;
    labWarnings = r.warnings;

    const blocking = labWarnings.filter((w) => w.severity === 'block');
    if (blocking.length) {
      return finalizeLocale({
        status: 'input_error',
        blocking_warnings: blocking,
        message_he: blocking.map((b) => b.message_he).join(' '),
      }, locale);
    }
  }

  // ── grounding דטרמיניסטי ─────────────────────────────────────────────
  const kb = await loadKnowledgeBase();
  const grounding = runRulesEngine({
    kb: {
      redFlags: kb.redFlags,
      labPatterns: kb.labPatterns,
      rules: kb.rules,
      associations: kb.associations,
    },
    patient: pt,
    labs: normalized,
    findings,
    mode,
  });
  grounding.missingRanges = missingRanges;

  const patientData = [
    ...toPatientFacts(normalized),
    ...findings.map((f, i) => ({ key: `finding_${i + 1}`, label_he: 'ממצא קליני', value: f })),
    ...(presentation ? [{ key: 'presentation', label_he: 'תיאור קליני', value: presentation }] : []),
  ];

  const invokeLLM = createInvokeLLM();
  const [allowedTerms, evidence] = await Promise.all([
    loadVerifiedDrugTerms(),
    withLiterature
      ? retrieveEvidence({ findings, patient: pt, invokeLLM })
      : Promise.resolve({ literature: [], meta: { attempted: false, note_he: 'לא בוצעה שליפת ספרות.' } }),
  ]);

  const envelope = await groundedInvoke({
    engine: 'differential',
    enginePrompt: ENGINE_PROMPT,
    grounding,
    patientData,
    literature: evidence.literature,
    invokeLLM,
    mode,
    knownTopicKeys: kb.knownTopicKeys,
    allowedTerms,
    extraContext: missingRanges.length
      ? { analytes_without_reference_range: missingRanges }
      : null,
  });

  // ── אכיפת must_not_miss מהידע, לא מהמודל ─────────────────────────────
  const { differential, enforced, uncoveredRed } = enforceMustNotMiss({
    differential: envelope.differential ?? [],
    grounding,
  });

  const final = {
    ...envelope,
    differential: sortForDisplay(differential),
  };

  // מצב מסכן-חיים שהופעל ואף כיוון לא כיסה — השמטה שחייבת להיאמר
  if (uncoveredRed.length) {
    final.unknowns_he = [
      ...(final.unknowns_he ?? []),
      ...uncoveredRed.map(
        (r) =>
          `הידע המאומת הפעיל מצב מסכן-חיים ("${r.label_he}") שאינו מופיע ` +
          'באבחנה המבדלת. יש לשקול אותו במפורש.'
      ),
    ];
  }

  await writeAudit({ engine: 'differential', envelope: final });

  return finalizeLocale({
    ...final,
    must_not_miss_enforced: enforced,
    uncovered_red_items: uncoveredRed,
    normalized,
    missing_ranges: missingRanges,
    lab_warnings: labWarnings,
    evidence_meta: evidence.meta,
  }, locale);
}
