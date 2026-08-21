/**
 * DoctorPedAI — קטלוג מנועי MedScan במצב כלי עצמאי ובמצב מכשיר מאוחד.
 * אינו מריץ מנועים. ניתוב בלבד.
 */

export const INTEGRATION_MODES = Object.freeze(['standalone', 'unified']);
export const PERSONAS = Object.freeze(['clinician', 'parent']);
export const RLS_ROLES = Object.freeze(['clinician', 'parent']);

export const MEDSCAN_MODULES = Object.freeze([
  Object.freeze({
    id: 'labs', route: '/labs', engine: 'labInterpreter',
    i18n_key: 'mod.labs', standalone: true, instrument: true,
    triggers: [/lab|cbc|crp|מעבדה/i],
  }),
  Object.freeze({
    id: 'audio', route: '/audio', engine: 'audio',
    i18n_key: 'mod.audio', standalone: true, instrument: true,
    triggers: [/wheeze|stridor|crackle|שיעול|צפצוף|סטרידור/i],
  }),
  Object.freeze({
    id: 'skin', route: '/skin', engine: 'skin',
    i18n_key: 'mod.skin', standalone: true, instrument: true,
    triggers: [/rash|lesion|פריחה|נגע|עור/i],
  }),
  Object.freeze({
    id: 'radiology', route: '/radiology', engine: 'radiology',
    i18n_key: 'mod.radiology', standalone: true, instrument: true,
    triggers: [/x-?ray|ct |mri|צילום|רנטגן/i],
  }),
  Object.freeze({
    id: 'ultrasound', route: '/us', engine: 'pediatricUltrasound',
    i18n_key: 'mod.ultrasound', standalone: true, instrument: true,
    triggers: [/graf|ddh|ivh|ultrasound|אולטרסאונד|ירכיים/i],
  }),
  Object.freeze({
    id: 'genetics', route: '/genetics', engine: 'geneticsInterpreter',
    i18n_key: 'mod.genetics', standalone: true, instrument: true,
    triggers: [/dysmorph|down|turner|noonan|גנטי|דיסמורפ/i],
  }),
  Object.freeze({
    id: 'csf', route: '/csf', engine: 'csfInterpreter',
    i18n_key: 'mod.csf', standalone: true, instrument: true,
    triggers: [/\bcsf\b|lumbar|lp |נוזל שדרה|ניקור/i],
  }),
  Object.freeze({
    id: 'metabolic', route: '/metabolic', engine: 'metabolicInterpreter',
    i18n_key: 'mod.metabolic', standalone: true, instrument: true,
    triggers: [/pku|newborn screen|hypoglycemia|סקר ילודים|מטבול/i],
  }),
  Object.freeze({
    id: 'toxicology', route: '/tox', engine: 'toxicology',
    i18n_key: 'mod.toxicology', standalone: true, instrument: true,
    triggers: [/ingest|battery|magnet|paracetamol|ibuprofen|poison|הרעל|סוללת|מגנט|אקמול/i],
  }),
  Object.freeze({
    id: 'milestones', route: '/nutrition', engine: 'infantNutritionAndDevelopment',
    i18n_key: 'mod.milestones', standalone: true, instrument: true,
    triggers: [/milestone|formula|ftt|תמ"ל|אבני דרך|התפתחות/i],
  }),
  Object.freeze({
    id: 'ecg', route: '/ecg', engine: 'ecg',
    i18n_key: 'mod.ecg', standalone: true, instrument: true,
    triggers: [/ecg|ekg|אק.?ג|סינקופה|palpitation/i],
  }),
  Object.freeze({
    id: 'eeg', route: '/eeg', engine: 'eegInterpreter',
    i18n_key: 'mod.eeg', standalone: true, instrument: true,
    triggers: [/eeg|seizure|spasms|פרכוס|התכווצות/i],
  }),
  Object.freeze({
    id: 'trauma', route: '/trauma', engine: 'trauma',
    i18n_key: 'mod.trauma', standalone: true, instrument: true,
    triggers: [/head trauma|gcs|burn|חבלת ראש|כוויה|נפילה/i],
  }),
  Object.freeze({
    id: 'triads', route: '/syndromes', engine: 'syndromeMatcher',
    i18n_key: 'mod.triads', standalone: true, instrument: true,
    triggers: [/kawasaki|hus|cushing|samter|קוואסאקי/i],
  }),
  Object.freeze({
    id: 'pain', route: '/chronic', engine: 'chronicSymptomsEngine',
    i18n_key: 'mod.pain', standalone: true, instrument: true,
    triggers: [/abdominal pain|headache|migraine|כאב בטן|כאב ראש|מיגרנה/i],
  }),
  Object.freeze({
    id: 'neurodev', route: '/neurodev', engine: 'neurodevelopmentalEngine',
    i18n_key: 'mod.neurodev', standalone: true, instrument: true,
    triggers: [/adhd|asd|autism|m-?chat|vanderbilt|conners|קשב|אוטיזם/i],
  }),
  Object.freeze({
    id: 'growth', route: '/growth', engine: 'growth',
    i18n_key: 'mod.growth', standalone: true, instrument: true,
    triggers: [/short stature|percentile|immuniz|קומה|חיסון|גדילה/i],
  }),
]);

export function getModule(id) {
  return MEDSCAN_MODULES.find((m) => m.id === id) ?? null;
}

export function listToolboxModules() {
  return MEDSCAN_MODULES.filter((m) => m.standalone);
}

export function selectInstruments({ findings = [], presentation = '', labs = [], features = {}, moduleHint = null } = {}) {
  const blob = `${(findings ?? []).join(' ')} ${presentation} ${Object.keys(features ?? {}).join(' ')}`.toLowerCase();
  const ids = new Set();
  if (moduleHint && getModule(moduleHint)) ids.add(moduleHint);
  if ((labs ?? []).length) ids.add('labs');
  for (const mod of MEDSCAN_MODULES) {
    if (!mod.instrument) continue;
    if ((mod.triggers ?? []).some((re) => re.test(blob))) ids.add(mod.id);
  }
  return [...ids];
}
