/**
 * MedScan — LLM Adapter
 *
 * הגשר בין השער (`groundedInvoke`) לבין `base44.integrations.Core.InvokeLLM`.
 *
 * למה שכבה נפרדת ולא קריאה ישירה:
 *  1. **בר-בדיקה.** השער מקבל `invokeLLM` כפרמטר, ולכן ניתן להריץ את כל
 *     שכבת האנטי-הזיה בבדיקות בלי רשת ובלי עלות.
 *  2. **הפרדת מודלים.** המאמת-הנגדי חייב לרוץ במודל **שונה** מהקריאה
 *     הראשית. מאמת שהוא אותה קריאה של אותו מודל נוטה לאשר את עצמו —
 *     וזה מבטל את מנגנון 7.
 *  3. **נקודת אכיפה יחידה.** `response_json_schema` נכפה כאן, ולא נשען
 *     על כך שכל קורא יזכור להעביר אותו.
 */

import { base44 } from '@/api/base44Client';
import { DIAGNOSIS_MODEL, FAST_MODEL, VISION_MODEL } from '@/lib/aiConfig';

/**
 * ⚠ מזהי הדגמים הם מזהי **Base44**, לא מזהי Anthropic API.
 * הזמינים ב-workspace הזה: claude_opus_4_8 / 4_7 / 4_6, claude_sonnet_4_6.
 * מזהה שאינו מסופק ע"י ה-workspace גורם לכשל בכל קריאת AI.
 * לכן אנו נשענים על aiConfig.js ואיננו כותבים מזהים כאן.
 */

/** המאמת-הנגדי רץ במודל המהיר — גם לעלות, וגם כדי לשבור את הסימטריה. */
const MODEL_BY_PURPOSE = {
  self_check: FAST_MODEL,
};

/**
 * בונה פונקציית invokeLLM להזרקה לשער.
 *
 * @param {object} [opts]
 * @param {string[]} [opts.fileUrls] תמונות, כשהמנוע הוא מודול Vision
 * @param {function} [opts.onCall]   hook לניטור/לוגים
 * @returns {function({system, prompt, schema, purpose}): Promise<object>}
 */
export function createInvokeLLM({ fileUrls = null, onCall = null } = {}) {
  return async function invokeLLM({ system, prompt, schema, purpose }) {
    if (!schema) {
      // כלל-ברזל 3: פלט לא-מובנה אסור. נכשל רועש, לא שקט.
      throw new Error(
        `MedScan: קריאת LLM ללא response_json_schema (purpose=${purpose}). ` +
        'פלט לא-מובנה אסור — הוא עוקף את כל שכבת האימות.'
      );
    }

    const model = MODEL_BY_PURPOSE[purpose] ?? DIAGNOSIS_MODEL;

    // ה-system מוזרק בראש הפרומפט: Core.InvokeLLM חושף שדה prompt יחיד.
    const fullPrompt = system ? `${system}\n\n${prompt}` : prompt;

    onCall?.({ purpose, model, promptLength: fullPrompt.length });

    const request = {
      prompt: fullPrompt,
      response_json_schema: schema,
      add_context_from_internet: false,   // מקור-האמת הוא ה-FACT BLOCK בלבד
      model,
    };
    if (fileUrls?.length) request.file_urls = fileUrls;

    return base44.integrations.Core.InvokeLLM(request);
  };
}

/**
 * מתאם למסלול ה-Vision — צורת ארגומנטים גולמית, אותם כללים.
 *
 * למה שני מתאמים ולא אחד: `createInvokeLLM` משרת את השער,
 * שמעביר `{system, prompt, schema, purpose}` ומזריק את ה-system בראש
 * הפרומפט. מנועי ה-Vision הקיימים בונים פרומפט מלא בעצמם
 * ומעבירים צורה גולמית. שכתוב שלהם הוא שינוי גדול ומסוכן
 * יותר מהתועלת — אבל אסור שיקראו ל-SDK ישירות.
 *
 * ⚠ מה שנאכף כאן ולא נסמך על זכרונו של הקורא:
 *   1. `response_json_schema` חובה — פלט לא-מובנה עוקף את כל האימות.
 *   2. `add_context_from_internet` מושבת תמיד — מקור-האמת הוא
 *      התמונה וה-FACT BLOCK, לא דף שהמודל מצא.
 *   3. נקודת ניטור אחת — `onCall`.
 *
 * @param {object} [opts]
 * @param {string} [opts.purpose] לצרכי ניטור ובחירת דגם
 * @param {function} [opts.onCall]
 */
export function createVisionInvokeLLM({ purpose = 'vision', onCall = null } = {}) {
  return async function visionInvokeLLM(args = {}) {
    const { response_json_schema: schema, model } = args;

    if (!schema) {
      // כלל-ברזל 3: פלט לא-מובנה אסור. נכשל רועש, לא שקט.
      throw new Error(
        `MedScan: קריאת Vision ללא response_json_schema (purpose=${purpose}). ` +
        'פלט לא-מובנה אסור — הוא עוקף את כל שכבת האימות.'
      );
    }

    onCall?.({
      purpose,
      model: model ?? VISION_MODEL,
      promptLength: String(args.prompt ?? '').length,
      fileCount: (args.file_urls ?? []).length,
    });

    return base44.integrations.Core.InvokeLLM({
      ...args,
      // קריאת-התמונה רצה על מודל-הראייה (VISION_MODEL) — אלא אם המנוע נקב מודל מפורש.
      model: model ?? VISION_MODEL,
      // נכפה כאן ולא נסמך על הקורא: הקשר מהאינטרנט מכניס טענות
      // שאינן ניתנות לעקיבה לתמונה ולא לידע המאומת.
      add_context_from_internet: false,
    });
  };
}

/**
 * טוען את פריטי ה-KB הרלוונטיים מהישויות.
 * מחזיר את המבנה ש-`runRulesEngine` מצפה לו.
 *
 * שים לב: הסינון לפי `verification_status` נעשה במנוע עצמו ולא כאן —
 * כדי שהמנוע יוכל לספור כמה פריטי טיוטה נדחו, ולהבחין בין
 * "אין ידע בכלל" לבין "יש ידע שטרם אומת". שתי הכוונות שונות לרופא/ה.
 */
export async function loadKnowledgeBase({ domains = null, limit = 2000 } = {}) {
  const safeList = async (entityName) => {
    try {
      const rows = await base44.entities[entityName].list('-created_date', limit);
      return Array.isArray(rows) ? rows : [];
    } catch {
      // ישות שטרם נוצרה אינה שגיאה — היא פשוט ריקה.
      // המנוע יסרב בהתאם, וזו התנהגות נכונה.
      return [];
    }
  };

  const [rules, associations, labPatterns, redFlags, protocols, topics] = await Promise.all([
    safeList('ClinicalRule'),
    safeList('Association'),
    safeList('LabPattern'),
    safeList('RedFlag'),
    safeList('Protocol'),
    safeList('KnowledgeTopic'),
  ]);

  const byDomain = (rows) =>
    domains?.length ? rows.filter((r) => !r.domain || domains.includes(r.domain)) : rows;

  return {
    rules: byDomain(rules),
    associations: byDomain(associations),
    labPatterns: byDomain(labPatterns),
    redFlags: byDomain(redFlags),
    protocols: byDomain(protocols),
    topics,
    knownTopicKeys: topics.map((t) => t.topic_key).filter(Boolean),
  };
}

/** טוען טווחי ייחוס מישות ReferenceRange, בפורמט של refRanges.loadReferenceRanges. */
export async function loadReferenceRangePayload() {
  try {
    const rows = await base44.entities.ReferenceRange.list('-created_date', 1000);
    return {
      source: rows?.[0]?.lab_name ?? null,
      analytes: Array.isArray(rows) ? rows : [],
    };
  } catch {
    return { source: null, analytes: [] };
  }
}

/* ════════════════════════════════════════════════════════════════
 * ניהול ידע — קריאה, כתיבה ואימות
 * ═══════════════════════════════════════════════════════════════ */

const KB_ENTITIES = {
  KnowledgeTopic: 'topic_key',
  ClinicalRule: 'rule_key',
  LabPattern: 'pattern_key',
  RedFlag: 'flag_key',
  Association: 'assoc_key',
  Protocol: 'protocol_key',
  DoseRecord: 'drug_key',
  DrugInteraction: 'interaction_key',
  ReferenceRange: 'analyte',
};

export const KB_ENTITY_NAMES = Object.keys(KB_ENTITIES);

/** רשומות ישות ידע אחת. */
export async function listKbEntity(entityName, limit = 2000) {
  try {
    const rows = await base44.entities[entityName].list('-created_date', limit);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

/** סיכום מצב הידע — כמה מאומת, כמה טיוטה, בכל ישות. */
export async function loadKbStatus() {
  const entries = await Promise.all(
    KB_ENTITY_NAMES.map(async (name) => {
      const rows = await listKbEntity(name);
      const verified = rows.filter((r) => r.verification_status === 'verified').length;
      const flagged = rows.filter((r) => r.verification_status === 'flagged').length;
      return {
        entity: name,
        key_field: KB_ENTITIES[name],
        total: rows.length,
        verified,
        draft: rows.length - verified - flagged,
        flagged,
      };
    })
  );
  return entries;
}

/** יצירת רשומת ידע. תמיד נכנסת כטיוטה — במכוון. */
export async function createKbRecord(entityName, data) {
  return base44.entities[entityName].create({
    ...data,
    verification_status: 'draft_needs_verification',
  });
}

export async function updateKbRecord(entityName, id, data) {
  return base44.entities[entityName].update(id, data);
}

export async function deleteKbRecord(entityName, id) {
  return base44.entities[entityName].delete(id);
}

/**
 * אימות רשומה.
 *
 * החתימה (מי ומתי) אינה פורמלית: היא מה שהופך את האימות
 * מסימון לאחריות. בלעדיה, "verified" הוא סתם דגל.
 */
export async function verifyKbRecord(entityName, id, verifiedBy, note = null) {
  return base44.entities[entityName].update(id, {
    verification_status: 'verified',
    verified_by: verifiedBy,
    verified_at: new Date().toISOString(),
    ...(note ? { review_note_he: note } : {}),
  });
}

/** סימון רשומה כשגויה. רשומה flagged אינה נכנסת לפלט לעולם. */
export async function flagKbRecord(entityName, id, reason, flaggedBy) {
  return base44.entities[entityName].update(id, {
    verification_status: 'flagged',
    verified_by: flaggedBy,
    verified_at: new Date().toISOString(),
    review_note_he: reason,
  });
}

/** המשתמש הנוכחי — לחתימת אימות. */
export async function currentUser() {
  try {
    return await base44.auth.me();
  } catch {
    return null;
  }
}

/** טוען פרוטוקול בודד לפי מפתח. */
export async function loadProtocol(protocolKey) {
  try {
    const rows = await base44.entities.Protocol.list('-created_date', 500);
    return (rows ?? []).find((p) => p.protocol_key === protocolKey) ?? null;
  } catch {
    return null;
  }
}

/** רשימת הפרוטוקולים לבחירה. מסמן אילו מאומתים — רק הם ירוצו. */
export async function listProtocols() {
  try {
    const rows = await base44.entities.Protocol.list('-created_date', 500);
    return (rows ?? []).map((p) => ({
      protocol_key: p.protocol_key,
      title_he: p.title_he,
      domain: p.domain ?? null,
      age_scope: p.age_scope ?? 'all',
      entry_criteria_he: p.entry_criteria_he ?? [],
      step_count: (p.steps ?? []).length,
      verification_status: p.verification_status ?? 'draft_needs_verification',
      local_protocol_ref: p.local_protocol_ref ?? null,
    }));
  } catch {
    return [];
  }
}

/**
 * רשומות אינטראקציות.
 * ישות שטרם נוצרה מחזירה מערך ריק — והמנוע יצהיר במפורש
 * שלא בוצעה בדיקה, במקום להציג "לא נמצאו אינטראקציות".
 */
export async function loadInteractionKb() {
  try {
    const rows = await base44.entities.DrugInteraction.list('-created_date', 2000);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

/** שמות תרופות מרשומות מינון מאומתות — מותרים ל-entityGuard. */
export async function loadVerifiedDrugTerms() {
  try {
    const rows = await base44.entities.DoseRecord.list('-created_date', 1000);
    return (rows ?? [])
      .filter((r) => r.verification_status === 'verified')
      .flatMap((r) => [r.drug_name_en, r.drug_name_he, r.drug_key])
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** רושם יומן בקרה לכל ריצה. כישלון ברישום לא מפיל את הניתוח. */
export async function writeAudit({ engine, envelope }) {
  try {
    await base44.entities.AnalysisAudit.create({
      engine,
      status: envelope?.status ?? 'unknown',
      fact_block_size: envelope?.audit?.fact_block_size ?? 0,
      draft_items_rejected: envelope?.audit?.fact_block_draft_items ?? 0,
      anchors_used: envelope?.audit?.anchors_used ?? [],
      violation_count: envelope?.audit?.violation_count ?? 0,
      blocking_count: envelope?.audit?.blocking_count ?? 0,
      removed_claims: envelope?.integrity?.removed_claims ?? [],
      confidence_adjustments: envelope?.integrity?.confidence_adjustments ?? [],
      reason_codes: envelope?.audit?.reason_codes ?? [],
    });
  } catch {
    // אין להפיל ניתוח קליני בגלל כשל ברישום יומן.
  }
}
