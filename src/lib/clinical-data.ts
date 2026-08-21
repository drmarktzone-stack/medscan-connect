// DoctorPedAI — clinical domain model powering the Clinician Workbench,
// the MedScan modules and the Parent triage portal.
// Aligned with the Supabase schema (patients / encounters / questionnaire_responses).

import type { Instrument, TriageUrgency } from "@/types/doctorped";

export type Severity = "low" | "medium" | "high";
export type CaseStatus = "open" | "in_review" | "closed";

/* ---------------------------------- patients --------------------------------- */

export interface VitalSign {
  key: string;
  label: string;
  value: string;
  unit: string;
  status: "normal" | "watch" | "alert";
  ref: string;
}

export interface GrowthMetric {
  label: string;
  value: string;
  percentile: number;
  trend: "up" | "down" | "flat";
}

export interface HistoryItem {
  date: string;
  title: string;
  detail: string;
  kind: "visit" | "lab" | "vaccine" | "med" | "note";
}

export interface ClinicalPatient {
  id: string;
  display_name: string;
  age_months: number;
  sex: "male" | "female";
  weight_kg: number;
  height_cm: number;
  guardian: string;
  allergies: string[];
  chronic: string[];
  vitals: VitalSign[];
  growth: GrowthMetric[];
  history: HistoryItem[];
  chief_complaint: string;
  triage: TriageUrgency;
  severity: Severity;
}

export const clinicalPatients: ClinicalPatient[] = [
  {
    id: "p-maya",
    display_name: "מאיה כהן",
    age_months: 8,
    sex: "female",
    weight_kg: 8.1,
    height_cm: 69,
    guardian: "יובל כהן",
    allergies: ["אין ידועות"],
    chronic: [],
    chief_complaint: "חום 39.2° מעל 72 שעות",
    triage: "emergency",
    severity: "high",
    vitals: [
      { key: "temp", label: "חום", value: "39.2", unit: "°C", status: "alert", ref: "36.5–37.5" },
      { key: "hr", label: "דופק", value: "168", unit: "פעימות/דק׳", status: "alert", ref: "100–160" },
      { key: "rr", label: "נשימות", value: "44", unit: "/דק׳", status: "watch", ref: "24–40" },
      { key: "spo2", label: "סטורציה", value: "96", unit: "%", status: "normal", ref: "≥95" },
      { key: "bp", label: "לחץ דם", value: "84/48", unit: "mmHg", status: "normal", ref: "80–100/45–65" },
      { key: "crt", label: "מילוי נימי", value: "2.5", unit: "שנ׳", status: "watch", ref: "<2" },
    ],
    growth: [
      { label: "משקל", value: "8.1 ק״ג", percentile: 52, trend: "flat" },
      { label: "אורך", value: "69 ס״מ", percentile: 46, trend: "up" },
      { label: "היקף ראש", value: "44 ס״מ", percentile: 61, trend: "up" },
      { label: "BMI", value: "17.0", percentile: 58, trend: "flat" },
    ],
    history: [
      { date: "2026-08-21", title: "פנייה דחופה", detail: "חום מתמשך, ירידה בתיאבון", kind: "visit" },
      { date: "2026-08-19", title: "ספירת דם", detail: "WBC 17.4K, CRP 84", kind: "lab" },
      { date: "2026-06-02", title: "חיסון 6 חודשים", detail: "משושה + פנאומוקוק", kind: "vaccine" },
      { date: "2026-04-11", title: "ברונכיוליטיס", detail: "טופל אמבולטורית, ללא אשפוז", kind: "visit" },
    ],
  },
  {
    id: "p-noam",
    display_name: "נועם לוי",
    age_months: 34,
    sex: "male",
    weight_kg: 14.2,
    height_cm: 94,
    guardian: "דנה לוי",
    allergies: ["אמוקסיצילין (פריחה)"],
    chronic: ["אטופיק דרמטיטיס"],
    chief_complaint: "פריחה מקולופפולרית מפושטת",
    triage: "hmo_visit",
    severity: "medium",
    vitals: [
      { key: "temp", label: "חום", value: "37.8", unit: "°C", status: "watch", ref: "36.5–37.5" },
      { key: "hr", label: "דופק", value: "112", unit: "פעימות/דק׳", status: "normal", ref: "90–140" },
      { key: "rr", label: "נשימות", value: "26", unit: "/דק׳", status: "normal", ref: "20–30" },
      { key: "spo2", label: "סטורציה", value: "99", unit: "%", status: "normal", ref: "≥95" },
      { key: "bp", label: "לחץ דם", value: "92/56", unit: "mmHg", status: "normal", ref: "85–105/50–70" },
      { key: "crt", label: "מילוי נימי", value: "1.5", unit: "שנ׳", status: "normal", ref: "<2" },
    ],
    growth: [
      { label: "משקל", value: "14.2 ק״ג", percentile: 68, trend: "up" },
      { label: "גובה", value: "94 ס״מ", percentile: 72, trend: "up" },
      { label: "היקף ראש", value: "49 ס״מ", percentile: 55, trend: "flat" },
      { label: "BMI", value: "16.1", percentile: 60, trend: "flat" },
    ],
    history: [
      { date: "2026-08-21", title: "ביקור מרפאה", detail: "פריחה יום שני, ללא קוצר נשימה", kind: "visit" },
      { date: "2026-05-30", title: "מרשם", detail: "משחת סטרואיד קלה לאטופיק", kind: "med" },
      { date: "2026-02-14", title: "הערכת התפתחות", detail: "תקין לגיל", kind: "note" },
    ],
  },
  {
    id: "p-itay",
    display_name: "איתי ברק",
    age_months: 61,
    sex: "male",
    weight_kg: 19.7,
    height_cm: 112,
    guardian: "שירן ברק",
    allergies: [],
    chronic: ["אסתמה קלה"],
    chief_complaint: "שיעול לילי חוזר",
    triage: "home_care",
    severity: "low",
    vitals: [
      { key: "temp", label: "חום", value: "36.9", unit: "°C", status: "normal", ref: "36.5–37.5" },
      { key: "hr", label: "דופק", value: "96", unit: "פעימות/דק׳", status: "normal", ref: "80–120" },
      { key: "rr", label: "נשימות", value: "22", unit: "/דק׳", status: "normal", ref: "18–26" },
      { key: "spo2", label: "סטורציה", value: "98", unit: "%", status: "normal", ref: "≥95" },
      { key: "bp", label: "לחץ דם", value: "96/60", unit: "mmHg", status: "normal", ref: "90–110/55–72" },
      { key: "peak", label: "PEF", value: "78", unit: "% מהצפוי", status: "watch", ref: "≥80" },
    ],
    growth: [
      { label: "משקל", value: "19.7 ק״ג", percentile: 58, trend: "up" },
      { label: "גובה", value: "112 ס״מ", percentile: 64, trend: "up" },
      { label: "BMI", value: "15.7", percentile: 47, trend: "down" },
    ],
    history: [
      { date: "2026-08-20", title: "מעקב אסתמה", detail: "שימוש במרחיב 2×/שבוע", kind: "visit" },
      { date: "2026-07-02", title: "תפקודי ריאה", detail: "FEV1 86% מהצפוי", kind: "lab" },
    ],
  },
];

/* --------------------------------- red flags -------------------------------- */

export interface RedFlag {
  id: string;
  label: string;
  detail: string;
  level: "critical" | "warning" | "cleared";
  action: string;
}

export const redFlagsByPatient: Record<string, RedFlag[]> = {
  "p-maya": [
    { id: "rf1", label: "חום >39° מעל 72 שעות בגיל <12 חודשים", detail: "סיכון מוגבר לזיהום חיידקי סמוי (SBI)", level: "critical", action: "תרבית דם + שתן, שקילת אשפוז" },
    { id: "rf2", label: "טכיקרדיה מתמשכת ללא ירידה עם הורדת חום", detail: "168 פעימות/דק׳ בעת חום 39.2°", level: "critical", action: "ניטור רציף, בולוס נוזלים 20ml/kg" },
    { id: "rf3", label: "מילוי נימי 2.5 שנ׳", detail: "סימן פרפוזיה גבולי", level: "warning", action: "הערכה חוזרת תוך 30 דק׳" },
    { id: "rf4", label: "סימני גירוי קרומי המוח", detail: "לא נצפו: מרפס רך, אין עורף קשה", level: "cleared", action: "המשך מעקב נוירולוגי" },
  ],
  "p-noam": [
    { id: "rf1", label: "פורפורה / פטכיות שאינן מחווירות", detail: "לא נצפו — הפריחה מחווירה בלחיצה", level: "cleared", action: "אין צורך בבירור דחוף" },
    { id: "rf2", label: "מעורבות ריריות", detail: "אודם קל בשפתיים, ללא כיבים", level: "warning", action: "שלילת קוואסאקי אם החום >5 ימים" },
    { id: "rf3", label: "חשד לתגובה תרופתית", detail: "רגישות ידועה לאמוקסיצילין", level: "warning", action: "הימנעות מפניצילינים" },
  ],
  "p-itay": [
    { id: "rf1", label: "מצוקה נשימתית", detail: "ללא שימוש בשרירי עזר, דיבור שוטף", level: "cleared", action: "המשך טיפול מונע" },
    { id: "rf2", label: "PEF 78% מהצפוי", detail: "ירידה קלה מהבסיס האישי", level: "warning", action: "העלאת מינון סטרואיד בשאיפה" },
  ],
};

/* ------------------------------- differentials ------------------------------ */

export interface Differential {
  id: string;
  name: string;
  probability: number;
  supporting: string[];
  against: string[];
  nextStep: string;
  urgency: TriageUrgency;
}

export const differentialsByPatient: Record<string, Differential[]> = {
  "p-maya": [
    { id: "d1", name: "זיהום חיידקי סמוי (בקטרמיה/UTI)", probability: 0.42, supporting: ["CRP 84", "WBC 17.4K", "חום >72 שעות"], against: ["ללא מוקד קליני ברור"], nextStep: "תרבית שתן בקטטר + תרבית דם", urgency: "emergency" },
    { id: "d2", name: "דלקת בדרכי השתן", probability: 0.27, supporting: ["נקבה <12 חודשים", "חום ללא מוקד"], against: ["ללא הקאות"], nextStep: "בדיקת שתן כללית ותרבית", urgency: "emergency" },
    { id: "d3", name: "זיהום ויראלי ממושך (HHV-6)", probability: 0.18, supporting: ["גיל אופייני", "מצב כללי סביר"], against: ["CRP גבוה"], nextStep: "מעקב 24 שעות", urgency: "hmo_visit" },
    { id: "d4", name: "מחלת קוואסאקי", probability: 0.08, supporting: ["חום >5 ימים בהמשך"], against: ["ללא קונג׳ונקטיביטיס", "ללא שינויי גפיים"], nextStep: "אקו לב אם החום נמשך", urgency: "emergency" },
    { id: "d5", name: "דלקת ריאות סמויה", probability: 0.05, supporting: ["טכיפניאה קלה"], against: ["האזנה נקייה", "סטורציה 96%"], nextStep: "צילום חזה בשיקול דעת", urgency: "hmo_visit" },
  ],
  "p-noam": [
    { id: "d1", name: "אקסנתמה ויראלית", probability: 0.56, supporting: ["חום נמוך", "פריחה מפושטת מחווירה"], against: [], nextStep: "טיפול תומך ומעקב 48 שעות", urgency: "home_care" },
    { id: "d2", name: "התלקחות אטופיק דרמטיטיס", probability: 0.21, supporting: ["רקע אטופי", "גרד"], against: ["התפשטות מהירה"], nextStep: "אמולינט + סטרואיד מקומי", urgency: "home_care" },
    { id: "d3", name: "אורטיקריה תרופתית", probability: 0.14, supporting: ["רגישות ידועה"], against: ["לא נטל תרופה לאחרונה"], nextStep: "אנטיהיסטמין לפי צורך", urgency: "hmo_visit" },
    { id: "d4", name: "סקרלטינה", probability: 0.09, supporting: ["אודם בלוע"], against: ["ללא לשון תות"], nextStep: "בדיקת סטרפ מהירה", urgency: "hmo_visit" },
  ],
  "p-itay": [
    { id: "d1", name: "אסתמה לא מאוזנת", probability: 0.62, supporting: ["שיעול לילי", "PEF 78%"], against: [], nextStep: "התאמת טיפול מונע", urgency: "hmo_visit" },
    { id: "d2", name: "ריניטיס אלרגי עם נזלת אחורית", probability: 0.24, supporting: ["עונתיות"], against: ["ללא גודש בולט"], nextStep: "סטרואיד אף", urgency: "home_care" },
    { id: "d3", name: "ריפלוקס גסטרו-ושטי", probability: 0.14, supporting: ["שיעול בשכיבה"], against: ["ללא צרבת"], nextStep: "ניסיון תזונתי", urgency: "home_care" },
  ],
};

/* ---------------------------------- dosing ---------------------------------- */

export interface Drug {
  id: string;
  name: string;
  form: string;
  mgPerKg: number;
  maxSingleMg: number;
  frequency: string;
  concentration: number; // mg per 5 ml
  note: string;
}

export const drugs: Drug[] = [
  { id: "paracetamol", name: "פרצטמול", form: "סירופ 160mg/5ml", mgPerKg: 15, maxSingleMg: 1000, frequency: "כל 6 שעות", concentration: 160, note: "מקסימום 4 מנות ביממה" },
  { id: "ibuprofen", name: "איבופרופן", form: "סירופ 100mg/5ml", mgPerKg: 10, maxSingleMg: 600, frequency: "כל 8 שעות", concentration: 100, note: "לא מתחת לגיל 6 חודשים" },
  { id: "amoxicillin", name: "אמוקסיצילין", form: "סירופ 250mg/5ml", mgPerKg: 25, maxSingleMg: 1000, frequency: "כל 12 שעות", concentration: 250, note: "מנה יומית 50mg/kg מחולקת" },
  { id: "azithromycin", name: "אזיתרומיצין", form: "סירופ 200mg/5ml", mgPerKg: 10, maxSingleMg: 500, frequency: "פעם ביום", concentration: 200, note: "יום 1: 10mg/kg, ימים 2–5: 5mg/kg" },
  { id: "prednisolone", name: "פרדניזולון", form: "תמיסה 15mg/5ml", mgPerKg: 1, maxSingleMg: 40, frequency: "פעם ביום", concentration: 15, note: "3–5 ימים בהתלקחות אסתמה" },
  { id: "ondansetron", name: "אונדנסטרון", form: "טבליה נמסה 4mg", mgPerKg: 0.15, maxSingleMg: 8, frequency: "כל 8 שעות", concentration: 4, note: "מגיל שנה ומעלה" },
];

export function computeDose(drug: Drug, weightKg: number) {
  const raw = drug.mgPerKg * weightKg;
  const mg = Math.min(raw, drug.maxSingleMg);
  const ml = (mg / drug.concentration) * 5;
  return {
    mg: Math.round(mg * 10) / 10,
    ml: Math.round(ml * 10) / 10,
    capped: raw > drug.maxSingleMg,
  };
}

/* -------------------------------- MedScan ---------------------------------- */

export interface MedScanFinding {
  label: string;
  value: string;
  status: "normal" | "watch" | "alert";
}

export interface MedScanModule {
  id: string;
  title: string;
  icon: "labs" | "derm" | "ultrasound" | "genetics" | "milestones" | "questionnaires";
  summary: string;
  findings: MedScanFinding[];
  aiNote: string;
}

export const medscanModules: MedScanModule[] = [
  {
    id: "labs",
    title: "מעבדות",
    icon: "labs",
    summary: "פענוח אוטומטי של ספירת דם, כימיה ומדדי דלקת מול טווחי גיל.",
    findings: [
      { label: "WBC", value: "17.4 K/µL", status: "alert" },
      { label: "CRP", value: "84 mg/L", status: "alert" },
      { label: "Hb", value: "11.2 g/dL", status: "watch" },
      { label: "נויטרופילים", value: "72%", status: "watch" },
      { label: "קריאטינין", value: "0.3 mg/dL", status: "normal" },
    ],
    aiNote: "דפוס דלקתי חיידקי סביר (LR+ 4.1). מומלץ להשלים תרביות לפני אנטיביוטיקה.",
  },
  {
    id: "derm",
    title: "דרמטולוגיה (תמונה)",
    icon: "derm",
    summary: "ניתוח תמונה של נגעי עור, פריחות והערכת ABCDE.",
    findings: [
      { label: "סוג נגע", value: "מקולופפולרי", status: "watch" },
      { label: "פיזור", value: "גו ← גפיים", status: "watch" },
      { label: "מחוויר בלחיצה", value: "כן", status: "normal" },
      { label: "חשד לפורפורה", value: "לא", status: "normal" },
    ],
    aiNote: "התאמה של 81% לאקסנתמה ויראלית. ללא סימני דחיפות דרמטולוגית.",
  },
  {
    id: "ultrasound",
    title: "אקוסטיקה / אולטרסאונד",
    icon: "ultrasound",
    summary: "עיבוד קליפים של POCUS ריאות, בטן ומפרק ירך.",
    findings: [
      { label: "קווי B ריאתיים", value: "מפוזרים קלים", status: "watch" },
      { label: "החלקה פלאורלית", value: "תקינה", status: "normal" },
      { label: "נוזל חופשי בבטן", value: "לא נצפה", status: "normal" },
      { label: "IVC collapsibility", value: "42%", status: "watch" },
    ],
    aiNote: "סימני נפח תוך-כלי גבוליים — לשקול בולוס נוזלים ולחזור על הסריקה.",
  },
  {
    id: "genetics",
    title: "גנטיקה",
    icon: "genetics",
    summary: "סינון וריאנטים, תסמונות ותורשה משפחתית.",
    findings: [
      { label: "פאנל נשאות הורי", value: "שלילי", status: "normal" },
      { label: "וריאנט VUS", value: "אין", status: "normal" },
      { label: "סמנים דיסמורפיים", value: "0/12", status: "normal" },
      { label: "היסטוריה משפחתית", value: "אסתמה ואטופיה", status: "watch" },
    ],
    aiNote: "אין אינדיקציה לבירור גנטי כעת. לשקול פאנל אטופיה במידה של החמרה.",
  },
  {
    id: "milestones",
    title: "אבני דרך התפתחותיות",
    icon: "milestones",
    summary: "מעקב מוטורי, שפתי, חברתי וקוגניטיבי מול נורמות גיל.",
    findings: [
      { label: "מוטוריקה גסה", value: "תואם גיל", status: "normal" },
      { label: "מוטוריקה עדינה", value: "תואם גיל", status: "normal" },
      { label: "שפה", value: "פיגור קל", status: "watch" },
      { label: "חברתי-רגשי", value: "תואם גיל", status: "normal" },
    ],
    aiNote: "פער שפתי קל — מומלץ סקר שפה חוזר בעוד 3 חודשים.",
  },
  {
    id: "questionnaires",
    title: "שאלונים סטנדרטיים",
    icon: "questionnaires",
    summary: "M-CHAT-R/F, Vanderbilt, Conners והערכות ASD/ADHD.",
    findings: [
      { label: "M-CHAT-R", value: "2 (סיכון נמוך)", status: "normal" },
      { label: "Vanderbilt הורים", value: "לא בוצע", status: "watch" },
      { label: "Conners מורים", value: "לא בוצע", status: "watch" },
      { label: "סקר ASD", value: "לא נדרש", status: "normal" },
    ],
    aiNote: "השלמת Vanderbilt הורים ומורים תעלה את הדיוק האבחוני ב-ADHD ל-88%.",
  },
];

export interface InstrumentCard {
  id: Instrument | "conners_teacher";
  instrument: Instrument;
  title: string;
  ageRange: string;
  items: number;
  status: "done" | "pending" | "available";
  score?: string;
  interpretation: string;
}

export const instrumentCards: InstrumentCard[] = [
  { id: "mchat", instrument: "mchat", title: "M-CHAT-R/F — סקר אוטיזם", ageRange: "16–30 חודשים", items: 20, status: "done", score: "2 / 20", interpretation: "סיכון נמוך — אין צורך בשאלון המשך" },
  { id: "vanderbilt", instrument: "vanderbilt", title: "Vanderbilt — הורים (ADHD)", ageRange: "6–12 שנים", items: 55, status: "pending", interpretation: "ממתין למילוי ההורים" },
  { id: "conners", instrument: "conners", title: "Conners-3 — מורים", ageRange: "6–18 שנים", items: 45, status: "available", interpretation: "ניתן לשלוח קישור לצוות החינוכי" },
  { id: "conners_teacher", instrument: "symptom_checker", title: "בודק תסמינים כללי", ageRange: "0–18 שנים", items: 12, status: "available", interpretation: "אשף טריאז׳ מהיר להורים" },
];

/* ------------------------------ parent triage ------------------------------- */

export interface TriageOption {
  label: string;
  weight: number;
  hint?: string;
}

export interface TriageStep {
  id: string;
  question: string;
  helper: string;
  options: TriageOption[];
}

export const triageSteps: TriageStep[] = [
  {
    id: "age",
    question: "מה גיל הילד/ה?",
    helper: "גיל צעיר מעלה את רמת הזהירות הנדרשת.",
    options: [
      { label: "פחות מ-3 חודשים", weight: 4 },
      { label: "3–12 חודשים", weight: 2 },
      { label: "1–5 שנים", weight: 1 },
      { label: "מעל 5 שנים", weight: 0 },
    ],
  },
  {
    id: "fever",
    question: "מה מידת החום?",
    helper: "מדדו בבית השחי או ברקטום לתינוקות.",
    options: [
      { label: "מעל 39° יותר מ-3 ימים", weight: 4 },
      { label: "38–39°", weight: 2 },
      { label: "37.5–38°", weight: 1 },
      { label: "ללא חום", weight: 0 },
    ],
  },
  {
    id: "breathing",
    question: "האם יש קושי בנשימה?",
    helper: "שקעים בין הצלעות, נחיריים מתרחבים או נשימה מהירה מאוד.",
    options: [
      { label: "כן, נשימה מאומצת מאוד", weight: 5, hint: "סימן אזהרה" },
      { label: "נשימה מהירה מהרגיל", weight: 3 },
      { label: "שיעול בלבד", weight: 1 },
      { label: "נשימה תקינה", weight: 0 },
    ],
  },
  {
    id: "hydration",
    question: "כמה הילד/ה שותה ומשתין/ה?",
    helper: "חיתול יבש מעל 8 שעות הוא סימן להתייבשות.",
    options: [
      { label: "כמעט לא שותה, חיתול יבש", weight: 4 },
      { label: "שותה מעט", weight: 2 },
      { label: "שתייה כרגיל", weight: 0 },
    ],
  },
  {
    id: "behavior",
    question: "איך ההתנהגות וההכרה?",
    helper: "ילד שקשה להעיר או בוכה בלי הפוגה דורש בדיקה דחופה.",
    options: [
      { label: "רדום מאוד / קשה להעיר", weight: 5, hint: "סימן אזהרה" },
      { label: "עצבני מהרגיל", weight: 2 },
      { label: "משחק ומגיב כרגיל", weight: 0 },
    ],
  },
  {
    id: "rash",
    question: "האם יש פריחה שאינה מחווירה בלחיצה?",
    helper: "בדקו עם כוס שקופה — פריחה שנשארת אדומה דורשת מיון.",
    options: [
      { label: "כן", weight: 5, hint: "סימן אזהרה" },
      { label: "יש פריחה שמחווירה", weight: 1 },
      { label: "אין פריחה", weight: 0 },
    ],
  },
];

export function triageResult(score: number): {
  urgency: TriageUrgency;
  title: string;
  message: string;
  actions: string[];
} {
  if (score >= 8) {
    return {
      urgency: "emergency",
      title: "מומלץ לגשת למיון עכשיו",
      message: "התשובות שלכם כוללות סימנים שדורשים בדיקה רפואית מיידית.",
      actions: ["גשו לחדר מיון ילדים הקרוב", "אל תיתנו אוכל או שתייה עד לבדיקה אם יש הקאות", "קחו איתכם רשימת תרופות וחיסונים"],
    };
  }
  if (score >= 4) {
    return {
      urgency: "hmo_visit",
      title: "כדאי לקבוע ביקור בקופת החולים היום",
      message: "המצב אינו נראה מסכן חיים, אך דורש בדיקה של רופא/ת ילדים בשעות הקרובות.",
      actions: ["קבעו תור דחוף לרופא/ת הילדים", "מדדו חום כל 4 שעות ורשמו", "חזרו לאשף אם משהו מחמיר"],
    };
  }
  return {
    urgency: "home_care",
    title: "ניתן לטפל בבית עם מעקב",
    message: "לא זוהו סימני אזהרה. המשיכו במעקב ביתי צמוד.",
    actions: ["הקפידו על שתייה מרובה ומנוחה", "מדדו חום פעמיים ביום", "אם מופיע סימן אזהרה — חזרו לאשף מיד"],
  };
}

export const triageTone: Record<TriageUrgency, "high" | "medium" | "low"> = {
  emergency: "high",
  hmo_visit: "medium",
  home_care: "low",
};

export function ageLabel(months: number) {
  if (months < 24) return `${months} חודשים`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest ? `${years} שנים ו-${rest} חודשים` : `${years} שנים`;
}
