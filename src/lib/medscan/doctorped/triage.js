/**
 * DoctorPedAI — טריאז' דטרמיניסטי לקהילה / הורה.
 * Emergency | HMO visit | Home care. בספק → ביקור בקופה, לא הרגעה ביתית.
 */

import { toAgeDays } from '../deterministic/labNormalize.js';
import { t } from '../i18n/localize.js';

export const URGENCY = Object.freeze({
  emergency: 'emergency',
  hmo_visit: 'hmo_visit',
  home_care: 'home_care',
});

const DRAFT = 'draft_needs_verification';

function textBlob({ findings = [], presentation = '', features = {} }) {
  const feat = Object.entries(features ?? {}).filter(([, v]) => v === true).map(([k]) => k);
  return `${(findings ?? []).join(' ')} ${presentation} ${feat.join(' ')}`.toLowerCase();
}

/**
 * דגלים אדומים לניתוב בלבד — לא אבחנה. בלי ספי מעבדה מומצאים.
 */
export function collectTriageFlags({ findings = [], presentation = '', features = {}, vitals = {}, patient = {} } = {}) {
  const tx = textBlob({ findings, presentation, features });
  const ageDays = toAgeDays(patient);
  const flags = [];
  const push = (key, i18n_key) => flags.push({ flag_key: key, i18n_key, verification_status: DRAFT });

  if (features.anaphylaxis === true || /anaphylax|אנפילקס/.test(tx)) push('triage.anaphylaxis', 'flag.anaphylaxis');
  if (features.button_battery || /button battery|סוללת כפתור/.test(tx)) push('triage.battery', 'tox.battery.action');
  if (features.magnets || /magnet|מגנט/.test(tx)) push('triage.magnets', 'tox.magnet.action');
  if (Number(vitals.gcs) > 0 && Number(vitals.gcs) <= 14) push('triage.low_gcs', 'emergency.ed');
  if (features.head_trauma === true || /head trauma|חבלת ראש/.test(tx)) {
    if (Number(vitals.gcs) <= 14 || features.lost_consciousness === true || /vomit|seizure|הקא|פרכוס/.test(tx)) {
      push('triage.head_trauma', 'pecarn.ct');
    }
  }
  if (/letharg|אפתי|ישנוני|לא מגיב/.test(tx) && (/fever|חום/.test(tx) || features.fever === true)) {
    push('triage.infant_sick', 'emergency.ed');
  }
  if (/petechia|purpura|פורפורה|פטכיות/.test(tx) && (/fever|חום/.test(tx) || features.fever === true)) {
    push('triage.petechiae_fever', 'emergency.ed');
  }
  if (/seizure|status|פרכוס/.test(tx)) push('triage.seizure', 'emergency.ed');
  if (/stridor|סטרידור|difficulty breathing|מצוקה נשימתית|cyanosis|כיחלון/.test(tx)) {
    push('triage.respiratory', 'emergency.ed');
  }
  if (Number.isFinite(ageDays) && ageDays < 90 && (/fever|חום/.test(tx) || features.fever === true)) {
    push('triage.neonate_fever', 'emergency.ed');
  }
  if (features.fpies === true || /fpies/.test(tx)) push('triage.fpies', 'flag.fpies');
  return { flags, ageDays, tx };
}

export function classifyUrgency(input = {}) {
  const { flags, ageDays } = collectTriageFlags(input);
  if (flags.length) {
    return {
      ok: true,
      urgency: URGENCY.emergency,
      i18n_key: 'triage.emergency',
      flags,
      age_days: ageDays,
      verification_status: DRAFT,
      formula_source: 'any marked red-flag → emergency (conservative community triage)',
    };
  }

  const tx = textBlob(input);
  const hasComplaint = (input.findings ?? []).some(Boolean) || Boolean(input.presentation);
  if (!hasComplaint) {
    return {
      ok: false,
      reason: 'no_triage_input',
      urgency: null,
      verification_status: 'unavailable',
    };
  }

  const mildUri = /cold|uri|נזלת|mild cough|צינון/.test(tx);
  const extra = /fever|rash|pain|חום|פריחה|כאב|ear|אוזן|vomit|letharg|stridor/.test(tx);
  if (mildUri && !extra && Number.isFinite(ageDays) && ageDays >= 90) {
    return {
      ok: true,
      urgency: URGENCY.home_care,
      i18n_key: 'triage.home_care',
      flags: [],
      age_days: ageDays,
      verification_status: DRAFT,
      formula_source: 'isolated mild URI tokens after age ≥90d and no red flags (draft)',
    };
  }

  // גיל חסר או תלונה לא מסווגת → קופה, לא טיפול ביתי.
  return {
    ok: true,
    urgency: URGENCY.hmo_visit,
    i18n_key: 'triage.hmo_visit',
    flags: [],
    age_days: ageDays,
    verification_status: DRAFT,
    formula_source: 'non-emergent or unclassified → HMO visit (not home-care default)',
  };
}

export function triageActionHe(urgency, locale = 'he') {
  if (urgency === URGENCY.emergency) return t(locale, 'emergency.ed');
  if (urgency === URGENCY.home_care) return t(locale, 'triage.home_care');
  return t(locale, 'triage.hmo_visit');
}
