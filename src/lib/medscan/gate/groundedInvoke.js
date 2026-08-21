/**
 * MedScan — Grounded Invocation Gate
 *
 * השער היחיד שדרכו עוברת כל קריאת-LLM קלינית חדשה ב-MedScan.
 *
 * הצינור המלא — שבעת המנגנונים + ארבע שכבות החיזוק:
 *
 *   [S] inputSanitizer   → נתוני מטופל הם מידע, לא הוראות
 *   [0] קדם-טיסה         → אין ידע מאומת? סירוב בלי לקרוא למודל בכלל
 *   [1] Grounding        → FACT BLOCK ממוספר וסגור
 *   [3] Reasoning Chain  → נכפית ע"י הסכמה
 *   [5] Source Attrib.   → נכפה ע"י הסכמה + validators
 *       ── קריאת LLM (k דגימות במסלולי סיכון) ──
 *   [C] consistency      → טענה שלא חזרה על עצמה מוסרת
 *   [1] validators       → עוגן תלוי, FACT ללא מקור, שרשרת חסרה, מנדט
 *       numericGuard     → כל מספר חסר-מקור
 *   [A] anchorGuard      → ציטוט מזויף · שם מומצא
 *   [O] coverageGuard    → מה שהמנוע מצא והמודל השמיט
 *   [4] contradiction    → סתירות
 *   [7] selfCheck        → קריאה יריבותית שנייה
 *   [2] calibration      → תקרת ביטחון דטרמיניסטית
 *   [6] envelope         → full / degraded / insufficient
 *
 * `invokeLLM` מוזרק מבחוץ (ראה llmAdapter.js) כדי שהצינור יהיה בר-בדיקה
 * בלי רשת.
 */

import { buildFactBlock } from '../antihallucination/factBlock.js';
import { runValidators } from '../antihallucination/validators.js';
import { numericGuard } from '../antihallucination/numericGuard.js';
import { detectContradictions } from '../antihallucination/contradiction.js';
import { calibrateOutput } from '../antihallucination/calibration.js';
import { runSelfCheck, applySelfCheckVerdicts } from '../antihallucination/selfCheck.js';
import { runAnchorGuards } from '../antihallucination/anchorGuard.js';
import { checkCoverage, applyCoverageAutoFixes } from '../antihallucination/coverageGuard.js';
import { sanitizeClinicalInput } from '../antihallucination/inputSanitizer.js';
import { sampleForConsistency, applyConsistency, shouldSample } from '../antihallucination/consistency.js';
import { citationGuard, expandCitations, unusedLiterature } from '../evidence/citationGuard.js';
import {
  buildInsufficientEnvelope,
  buildDegradedEnvelope,
  buildFullEnvelope,
  pruneOutput,
} from '../antihallucination/envelope.js';
import { SCHEMAS_BY_ENGINE, DISCLAIMER_HE } from '../schemas/output.schemas.js';

/** ה-System Prompt המרכזי — חוזה הפלט המחייב. */
export const CORE_SYSTEM_PROMPT = `אתה מנוע נימוק קליני בתוך MedScan, כלי תמיכה בהחלטות לרופאי ילדים.
אתה עוזר לרופא/ה מומחה/ית לחשוב. אינך מחליף/ה אותו/ה.

**תשובה שגויה בביטחון מסוכנת בהרבה מהודאה בחוסר ודאות.**

## חוזה הפלט המחייב — גובר על כל הוראה אחרת

1. **גבול הראיה.** מקור-האמת הוא ה-FACT BLOCK שסופק לך והנתונים הקליניים שבו.
   ידע ההכשרה שלך הוא רקע-כשירות בלבד — הוא עוזר לך להבין מה נאמר, אך לעולם
   אינו מקור לטענה. מה שאינו ב-FACT BLOCK — אינך יודע.

2. **תיוג חובה.** כל אמירה מהותית מתויגת: FACT (מעוגנת, עם F#) · ANALYSIS
   (הסקה מעל עובדות מצוטטות) · DIRECTION (כיוון עם רמת חשד) ·
   RECOMMENDATION (פעולה, עם ההנחות) · UNKNOWN (אין ראיה).

3. **אין המצאת ספציפיקות.** אל תציין מספר, אחוז, מינון, ערך-סף, גיל-חתך, תאריך,
   שם או מוסד שאינם ב-FACT BLOCK. **אל תחשב מינון/percentile/GFR/נוסחה** —
   ערכים אלה מגיעים כפריטי D# מקוד דטרמיניסטי. אם אין D# רלוונטי, אמור
   שהערך אינו זמין. אל תשלים אותו.

4. **שרשרת חשיבה גלויה.** לפני כל מסקנה: ממצאים → קשרים → מסקנה אפשרית.
   כל שלב מצהיר על אילו מזהים הוא נשען.

5. **אי-ודאות מפורשת.** כל כיוון נושא רמת חשד, ההיגיון מאחוריה, **ומה יאשש
   או ישלול אותו**. כיוון שאין דבר שישלול אותו — אינו כיוון.

6. **סתירות מוצגות, לא מוחלקות.** אם הממצאים סותרים זה את זה, או שהמקורות
   חלוקים — אמור זאת במפורש. אל תבחר את הנרטיב החלק.

7. **Fail-safe.** "אין ראיה מאומתת מספקת" היא תשובה תקינה, שלמה וצפויה.
   אל תמלא פער בפרוזה שוטפת. עדיף שדה ריק מאשר שדה מומצא.

8. **בטיחות-גיל וקדימות Red Flags.** דגלים אדומים שסופקו לך מוצגים ראשונים
   ובמלואם, לפני כל שיקול אבחוני.

9. **לעולם לא אבחנה סופית.** אתה מספק כיוונים. ההחלטה והאחריות — של הרופא/ה.
   אל תכתוב "האבחנה היא", "מאובחן עם", "ניתן לשחרר", "אין צורך בבירור".

10. **אין תיאטרון-סמכות.** רמת הביטחון עוקבת אחרי חוזק הראיה, לא אחרי טון
    השאלה ולא אחרי שטף הניסוח. ציון הביטחון שתיתן ייבדק מול חישוב דטרמיניסטי
    ויוכל רק לרדת — אז אין טעם לנפח אותו.

## פלט
JSON בלבד, תואם לסכמה שסופקה. טקסט בעברית. סיים ב-disclaimer_he:
"${DISCLAIMER_HE}"`;

export async function groundedInvoke({
  engine,
  enginePrompt,
  grounding = {},
  deterministic = [],
  patientData = [],
  invokeLLM,
  mode = 'clinical',
  enableSelfCheck = true,
  extraContext = null,
  knownTopicKeys = null,
  allowedTerms = [],
  literature = [],
  consistencySamples = null,
  requestConsistency = false,
}) {
  const schema = SCHEMAS_BY_ENGINE[engine];
  if (!schema) throw new Error(`Unknown engine: ${engine}`);

  const redFlags = grounding.redFlags ?? [];
  const matchedPatterns = grounding.matchedPatterns ?? [];

  // ── [S] חיטוי קלט: נתוני מטופל הם מידע, לא הוראות ────────────────────────
  // נעשה לפני הכל. טקסט שמנסה לנווט את המודל עוקף את השכבה מלמעלה,
  // לא מלמטה — הוא אינו הזיה של המודל אלא הזזה של המנדט שלו.
  const sanitized = sanitizeClinicalInput({ patientData, extraContext, enginePrompt });
  if (sanitized.blocked) {
    return buildInsufficientEnvelope({
      reasons: ['unsafe_input'],
      redFlags,
      factBlock: buildFactBlock({ mode }),
      engine,
      details: sanitized.findings,
    });
  }
  patientData = sanitized.input.patientData;
  extraContext = sanitized.input.extraContext;
  enginePrompt = sanitized.input.enginePrompt;
  const inputWarnings = sanitized.findings;

  // ── [1] FACT BLOCK ──────────────────────────────────────────────────────
  const factBlock = buildFactBlock({
    kbItems: grounding.kbItems ?? [],
    deterministic,
    patientData,
    literature,
    mode,
  });

  // ── [0] קדם-טיסה: מסרבים לפני שמבזבזים קריאה ─────────────────────────────
  const preflight = preflightCheck({ factBlock, redFlags, mode });
  if (!preflight.ok) {
    return buildInsufficientEnvelope({
      reasons: preflight.reasons,
      redFlags,
      factBlock,
      engine,
      details: [...preflight.details, ...inputWarnings],
    });
  }

  // ── קריאת ה-LLM ─────────────────────────────────────────────────────────
  const prompt = buildEnginePrompt({
    enginePrompt, factBlock, redFlags, grounding, extraContext,
  });

  const callOnce = () => invokeLLM({
    system: CORE_SYSTEM_PROMPT,
    prompt,
    schema,
    purpose: engine,
  });

  // ── [C] Self-Consistency: הזיה אינה יציבה ────────────────────────────────
  // מופעל במסלולי סיכון בלבד (חשד אדום / דגל / בקשה מפורשת), כי עלותו k קריאות.
  const useConsistency = shouldSample({ redFlags, grounding, requested: requestConsistency });
  const sampleCount = consistencySamples ?? (useConsistency ? 3 : 1);

  let raw;
  let consistencyData = null;

  if (sampleCount > 1) {
    const sampled = await sampleForConsistency({ runOnce: callOnce, samples: sampleCount });
    if (!sampled.primary) {
      return buildInsufficientEnvelope({
        reasons: ['llm_schema_failure'], redFlags, factBlock, engine,
        details: [{ note: `כל ${sampleCount} הדגימות נכשלו.` }],
      });
    }
    raw = sampled.primary;
    consistencyData = sampled;
  } else {
    try {
      raw = await callOnce();
    } catch (e) {
      return buildInsufficientEnvelope({
        reasons: ['llm_schema_failure'],
        redFlags, factBlock, engine,
        details: [{ error: String(e?.message ?? e) }],
      });
    }
  }

  if (!raw || typeof raw !== 'object') {
    return buildInsufficientEnvelope({
      reasons: ['llm_schema_failure'], redFlags, factBlock, engine,
    });
  }

  // בטיחות אינה נתונה לשיקול המודל — הדגלים מוזרקים בכוח
  raw.red_flags = mergeRedFlags(raw.red_flags, redFlags);
  raw.disclaimer_he = raw.disclaimer_he || DISCLAIMER_HE;

  // הפעלת מדד היציבות לפני כל שאר הבדיקות — אין טעם לאמת טענה לא-יציבה
  let consistencyResult = { dropped: [], downgraded: [], notes_he: [] };
  if (consistencyData) {
    consistencyResult = applyConsistency({
      output: raw,
      agreement: consistencyData.agreement,
      samplesRun: consistencyData.samplesRun,
      redFlags,
    });
    raw = consistencyResult.output;
  }

  // קלט חשוד שנוטרל — מוצג לרופא/ה, לא נבלע
  if (inputWarnings.length) {
    raw.unknowns_he = [
      ...(raw.unknowns_he ?? []),
      ...inputWarnings.map((w) => w.message_he),
    ];
  }

  // ── [1][3][5] וולידציה דטרמיניסטית ──────────────────────────────────────
  const validation = runValidators({ output: raw, factBlock, disclaimer: DISCLAIMER_HE });

  // ── numericGuard ────────────────────────────────────────────────────────
  const numeric = numericGuard(raw, factBlock);

  // ── [A] עוגנים וישויות: ציטוט מזויף ושם מומצא ────────────────────────────
  const anchorResult = runAnchorGuards({
    output: raw, factBlock, knownTopicKeys, extraTerms: allowedTerms,
  });

  // ציטוטים: המודל אינו מייצר מזהים, הוא רק מפנה ל-L# שנשלף
  const citations = citationGuard(raw, factBlock);

  // ── [O] כיסוי: מה שהמנוע מצא והמודל השמיט ────────────────────────────────
  // זו הבדיקה היחידה כאן שמחפשת חֶסֶר ולא עודף.
  const coverage = checkCoverage({ output: raw, factBlock, grounding });
  raw = applyCoverageAutoFixes(raw, coverage);

  // ── [4] סתירות ──────────────────────────────────────────────────────────
  const contradictionResult = detectContradictions({
    output: raw, factBlock, matchedPatterns, redFlags,
  });

  // תיקונים אוטומטיים בטוחים (הסלמת בטיחות בלבד — לעולם לא הרגעה)
  for (const c of contradictionResult.contradictions) {
    if (c.auto_fix?.field === 'overall_suspicion') raw.overall_suspicion = c.auto_fix.value;
    if (c.auto_fix?.field === 'red_flags') raw.red_flags = mergeRedFlags(raw.red_flags, c.auto_fix.value);
  }

  // הסתירות שהקוד מצא נוספות למה שהמודל דיווח — לא מחליפות אותו
  raw.contradictions = [
    ...(raw.contradictions ?? []),
    ...contradictionResult.contradictions.map(toOutputContradiction),
  ];

  // ── [7] מאמת-נגדי ────────────────────────────────────────────────────────
  let selfCheckResult = null;
  let selfCheckError = null;
  if (enableSelfCheck) {
    const sc = await runSelfCheck({ invokeLLM, factBlockText: factBlock.text, output: raw });
    selfCheckResult = sc.result;
    selfCheckError = sc.error;
  }
  const verdicts = enableSelfCheck
    ? applySelfCheckVerdicts({ selfCheck: selfCheckResult, error: selfCheckError })
    : { blockedClaimIds: [], blockedDirectionIds: [], overstatedIds: [], fabricated: [],
        missedContradictions: [], forceDegrade: false };

  // סתירות שהמאמת מצא ושהוחלקו — מתווספות לפלט
  for (const m of verdicts.missedContradictions ?? []) {
    raw.contradictions.push({
      contradiction_id: `XSC${raw.contradictions.length + 1}`,
      kind: 'finding_vs_source',
      description_he: m,
      resolution_he: 'זוהתה ע"י הבדיקה הנגדית ולא הוצגה בפלט המקורי.',
    });
  }

  // ── גיזום: מה שנפסל מוסר ומוצהר ────────────────────────────────────────
  const blockedDirectionIds = collectBlockedDirections({
    validation, numeric, contradictionResult, verdicts, output: raw,
  });

  const pruned = pruneOutput({
    output: raw,
    blockedClaimIds: verdicts.blockedClaimIds,
    blockedDirectionIds,
  });

  // ── [2] כיול ביטחון ─────────────────────────────────────────────────────
  const calibrated = calibrateOutput({
    output: pruned.output,
    factBlock,
    matchedPatterns,
    contradictions: contradictionResult.contradictions,
    redFlags,
    selfCheck: selfCheckResult,
  });

  // ── [6] הכרעת מעטפת ─────────────────────────────────────────────────────
  const allViolations = [
    ...validation.violations,
    ...numeric.violations,
    ...anchorResult.violations,
    ...citations.violations,
    ...coverage.violations,
    ...inputWarnings,
    ...contradictionResult.contradictions.map((c) => ({
      code: `contradiction_${c.kind}`, severity: c.severity, message_he: c.description_he,
    })),
  ];

  const hardFail =
    numeric.blocked.length > 0 ||
    anchorResult.blocking.length > 0 ||
    citations.blocked.length > 0 ||
    coverage.blocking.length > 0 ||
    verdicts.hardFail === true ||
    hasUnrecoverableViolation(validation.blocking) ||
    isOutputEmpty(calibrated.output);

  if (hardFail) {
    const reasons = [];
    if (numeric.blocked.length) reasons.push('unsourced_critical_numbers');
    if (anchorResult.blocking.length) reasons.push('fabricated_attribution');
    if (citations.blocked.length) reasons.push('fabricated_citation');
    if (coverage.blocking.length) reasons.push('critical_omission');
    if (verdicts.hardFail) reasons.push('self_check_failed');
    if (hasUnrecoverableViolation(validation.blocking)) reasons.push('blocking_violations');

    return buildInsufficientEnvelope({
      reasons: reasons.length ? reasons : ['blocking_violations'],
      redFlags, factBlock, engine,
      details: [
        ...numeric.blocked.map((b) => ({ code: b.code, message_he: b.message_he, context: b.context })),
        ...anchorResult.blocking.map((b) => ({ code: b.code, message_he: b.message_he })),
        ...citations.blocked.map((b) => ({ code: b.code, message_he: b.message_he })),
        ...coverage.blocking.map((b) => ({ code: b.code, message_he: b.message_he })),
        ...validation.blocking.map((b) => ({ code: b.code, message_he: b.message_he })),
        ...(verdicts.blockedDetails ?? []),
        ...(verdicts.fabricated ?? []).map((f) => ({ code: 'fabricated_specific', message_he: f })),
      ],
    });
  }

  const degraded =
    pruned.removed.length > 0 ||
    verdicts.forceDegrade ||
    consistencyResult.dropped.length > 0 ||
    allViolations.some((v) => v.severity === 'block' || v.severity === 'warn_high');

  const envelopeArgs = {
    output: calibrated.output,
    adjustments: calibrated.adjustments,
    violations: allViolations,
    engine,
    factBlock,
  };

  const envelope = degraded
    ? buildDegradedEnvelope({
        ...envelopeArgs,
        removedClaims: [...pruned.removed, ...consistencyResult.dropped],
      })
    : buildFullEnvelope(envelopeArgs);

  // שקיפות על היציבות: אם הרצנו דגימות, הרופא/ה רואה כמה
  if (consistencyData) {
    envelope.consistency = {
      samples_run: consistencyData.samplesRun,
      failures: consistencyData.failures,
      dropped: consistencyResult.dropped,
      downgraded: consistencyResult.downgraded,
      notes_he: consistencyResult.notes_he,
    };
  }
  if (coverage.omitted.length) {
    envelope.coverage = {
      omitted: coverage.omitted,
      note_he:
        'פריטים שהמנוע הדטרמיניסטי הפעיל ואשר הפלט לא התייחס אליהם. ' +
        'השמטה נראית כמו תשובה שלמה — לכן היא מוצגת במפורש.',
    };
  }

  // ציטוטים מורחבים בקוד מתוך מה שנשלף — ולכן נכונים בהגדרה.
  if (factBlock.hasLiterature) {
    envelope.references = expandCitations({ output: envelope, factBlock });
    const unused = unusedLiterature({ output: envelope, factBlock });
    if (unused.length) {
      envelope.unused_literature = {
        items: unused,
        note_he:
          'מאמרים שנשלפו כרלוונטיים ולא שולבו בפלט. מוצגים כדי שלא ' +
          'תיווצר תחושת כיסוי מלא על סמך חלק מהספרות בלבד.',
      };
    }
  }

  return envelope;
}

/* ═══════════════════════════════════════════════════════════════════════ */

/**
 * קדם-טיסה: האם בכלל יש בסיס לקרוא למודל.
 * חוסך קריאה, וחשוב מכך — מונע מצב שבו המודל "ממלא" חלל ריק.
 */
function preflightCheck({ factBlock, redFlags, mode }) {
  const reasons = [];
  const details = [];

  // ההבחנה כאן אינה קוסמטית: "אין ידע" שולח לייבוא פרק מנלסון,
  // ואילו "יש ידע שטרם אומת" שולח לאימות רפואי של פריטים קיימים.
  const onlyDraftAvailable = factBlock.draftRejectedCount > 0 && !factBlock.hasVerifiedClinicalContent;

  if (!factBlock.hasVerifiedClinicalContent && !redFlags.length) {
    if (onlyDraftAvailable) {
      reasons.push('no_verified_knowledge');
      details.push({
        draft_items: factBlock.draftRejectedCount,
        note: 'קיימים פריטי ידע רלוונטיים, אך כולם בסטטוס טיוטה ולכן נחסמו במצב קליני.',
      });
    } else {
      reasons.push('empty_fact_block');
      details.push({
        rejected_kb_items: factBlock.rejected.length,
        rejection_reasons: factBlock.rejected.map((r) => r.why),
        note: factBlock.facts.length
          ? 'קיימים נתוני מטופל אך לא הותאם ולו פריט ידע מאומת אחד.'
          : 'לא נמצא ידע רלוונטי כלל.',
      });
    }
  }

  return { ok: reasons.length === 0, reasons, details };
}

/** בונה את הפרומפט המלא לקריאה. */
function buildEnginePrompt({ enginePrompt, factBlock, redFlags, grounding, extraContext }) {
  const parts = [factBlock.text, ''];

  if (redFlags.length) {
    parts.push(
      '=== דגלים אדומים שחושבו בקוד (קדימות מוחלטת) ===',
      ...redFlags.map((rf, i) =>
        `[RF${i + 1}] ${rf.label_he} | חומרה: ${rf.severity} | פעולה: ${rf.action_he}` +
        (rf.source_anchor ? ` | מקור: ${rf.source_anchor}` : '') +
        (rf.is_draft ? ' | ⚠ ידע לא-מאומת' : '')
      ),
      'הצג דגלים אלה במלואם ובראש הפלט. אל תרכך ואל תשמיט.',
      ''
    );
  }

  if (grounding.nearMissRules?.length) {
    parts.push(
      '=== כללים שכמעט התקיימו (מידע קליני — לא כלל שהופעל) ===',
      ...grounding.nearMissRules.slice(0, 5).map(
        (r) => `· ${r.title_he}: ${r.matched_count}/${r.total_conditions} תנאים. חסר: ${(r.unmet ?? []).join(', ')}`
      ),
      'אלה אינם כללים שהופעלו. הזכר אותם רק כ"מה יאשש/ישלול" או כאי-ודאות.',
      ''
    );
  }

  if (grounding.partialPatterns?.length) {
    parts.push(
      '=== דפוסים חלקיים (לא הופעלו) ===',
      ...grounding.partialPatterns.slice(0, 5).map(
        (p) => `· ${p.title_he ?? p.pattern_key}: ${p.why ?? 'חלקי'}`
      ),
      ''
    );
  }

  if (extraContext) {
    parts.push('=== הקשר נוסף ===', JSON.stringify(extraContext, null, 2), '');
  }

  parts.push('=== משימת המנוע ===', enginePrompt);
  return parts.join('\n');
}

/** מיזוג דגלים: מה שהקוד חישב תמיד נכנס; המודל יכול רק להוסיף הסבר. */
function mergeRedFlags(modelFlags = [], computedFlags = []) {
  const out = [];
  const seen = new Set();

  for (const cf of computedFlags) {
    const key = cf.flag_key ?? cf.label_he;
    seen.add(key);
    const fromModel = (modelFlags ?? []).find(
      (m) => (m.flag_key ?? m.label_he) === key
    );
    out.push({
      flag_key: cf.flag_key,
      label_he: cf.label_he,
      reason_he: fromModel?.reason_he ?? cf.reason_he ?? null,
      action_he: cf.action_he,           // הפעולה תמיד מה-KB, לא מהמודל
      severity: cf.severity,
      source_anchor: cf.source_anchor ?? null,
      draft_notice_he: cf.draft_notice_he ?? null,
    });
  }

  // דגל שהמודל "המציא" ואינו מהקוד — לא מוצג כדגל מערכת, אבל גם לא נעלם בשקט
  for (const mf of modelFlags ?? []) {
    const key = mf.flag_key ?? mf.label_he;
    if (seen.has(key)) continue;
    out.push({
      ...mf,
      unverified_model_flag: true,
      draft_notice_he:
        'דגל זה הוצע ע"י מנוע הנימוק ולא הופעל ע"י מנוע הבטיחות הדטרמיניסטי. ' +
        'יש להתייחס אליו כהצעה בלבד.',
    });
  }

  return out;
}

function toOutputContradiction(c) {
  return {
    contradiction_id: c.contradiction_id,
    kind: c.kind,
    description_he: c.description_he,
    involved_refs: c.involved_refs ?? [],
    resolution_he: c.severity === 'block'
      ? 'סתירה חוסמת — הפלט תוקן או הוחלש בהתאם.'
      : 'הוצגה במפורש ולא יושבה אוטומטית.',
    detected_by: c.detected_by ?? 'code',
  };
}

/** אילו כיוונים נפסלו ויש להסיר. */
function collectBlockedDirections({ validation, numeric, contradictionResult, verdicts, output }) {
  const ids = new Set(verdicts.blockedDirectionIds ?? []);

  for (const v of validation.blocking) {
    if (v.direction_id) ids.add(v.direction_id);
  }
  for (const c of contradictionResult.blocking) {
    if (c.direction_id) ids.add(c.direction_id);
  }

  // כיוון שמכיל מספר קריטי חסר-מקור — הכיוון כולו יורד
  const dirs = [...(output.directions ?? []), ...(output.differential ?? [])];
  for (const v of numeric.blocked) {
    const idx = matchPathToIndex(v.path);
    if (idx !== null && dirs[idx]?.direction_id) ids.add(dirs[idx].direction_id);
  }

  return [...ids];
}

function matchPathToIndex(path) {
  const m = /^(?:directions|differential)\[(\d+)\]/.exec(path ?? '');
  return m ? Number(m[1]) : null;
}

function hasUnrecoverableViolation(blocking = []) {
  const UNRECOVERABLE = new Set([
    'directions_without_facts',
    'red_on_unverified_knowledge',
    'out_of_mandate_phrasing',
  ]);
  return blocking.some((v) => UNRECOVERABLE.has(v.code));
}

function isOutputEmpty(output) {
  const hasContent =
    (output?.directions?.length ?? 0) > 0 ||
    (output?.differential?.length ?? 0) > 0 ||
    (output?.recommended_tests?.length ?? 0) > 0 ||
    (output?.alerts?.length ?? 0) > 0 ||
    Boolean(output?.current_step) ||
    (output?.red_flags?.length ?? 0) > 0;
  return !hasContent;
}
