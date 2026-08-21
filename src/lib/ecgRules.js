/**
 * Comprehensive ECG Interpretation Rules Engine
 *
 * This is the "brain" of ECG analysis — the complete set of laws, rules, and
 * diagnostic criteria for systematic ECG interpretation. It teaches the model
 * to read an ECG from first principles (lead by lead, rule by rule) BEFORE
 * matching against the knowledge base.
 *
 * Philosophy: the system can only diagnose accurately when it knows the exact
 * rules that map specific lead changes to specific diagnoses. This engine
 * encodes those rules so the model performs structured self-diagnosis.
 */

export const ECG_LEAD_TERRITORIES = `## טריטוריות הובלות ודפנות הלב
כל הובלה משקיפה על אזור מוגדר של שריר הלב. שינויים בהובלה אחת או יותר מצביעים על פתולוגיה באזור המתאים:

**דופן קדמית (Anterior):** V1–V4 (קדמית-חיצונית V3–V4, מחיצית V1–V2)
**דופן צידית (Lateral):** I, aVL, V5–V6 (צידית-גבוהה: I, aVL)
**דופן תחתית (Inferior):** II, III, aVF
**דופן אחורית (Posterior):** V1–V3 (שיקוף — ST depression + tall R) או V7–V9 (ישירות)
**חדר ימני (Right Ventricle):** V4R (והובלות ימניות V1, V3R–V6R)

**הובלות גפיים:**
- I: צידית-גבוהה שמאלית
- II: תחתית-קדמית
- III: תחתית
- aVR: בסיס הלב (cavotricuspid) — היפוך של כל שאר ההובלות
- aVL: צידית-גבוהה
- aVF: תחתית

**חשיבות aVR:** הגבהת ST ב-aVR > ST ב-V1 → חשד לאיסכמית גזע ראשי שמאלי (LAD) — מסכן חיים.`;

export const ECG_SYSTEMATIC_METHOD = `## שיטת פענוח שיטתית — 10 שלבים
בצע את הפענוח בסדר הבא, ללא דילוג:

### 1. קצב (Rate)
- חדרי: ספור מספר קומפלקסי QRS ברצועה של 30 שניות (רוחב נייר סטנדרטי) × 2, או 1500 / מספר משבצות 5mm בין R-R.
- עלייתי: ספור גלי P באותה שיטה.
- תקין: 60–100 bpm. Bradycardia <60, Tachycardia >100.

### 2. רגולריות (Regularity)
- בדוק R-R ו-P-P. סדיר / לא-סדיר / לא-סדיר-לחלוטין (irregularly irregular = AF).
- אם לא-סדיר: תבנית? (קבוצות של 3? Wenckebach? פעם נעדרת?)

### 3. גלי P (P waves)
- נוכחים? תדירות P:QRS (1:1, 2:1, נעדר)?
- מורפולוגיה ב-II: חיובי (סינוס), דו-פאזי/שלילי (לא-סינוס), גבוה-מחודד (P pulmonale), רחב-מפוצל (P mitrale).
- מורפולוגיה ב-V1: דו-פאזי (חיובי-שלילי) — הרכיב הסופי השלילי > 1mm עומק ו-40ms = LAE.

### 4. מרווח PR
- מדידה מתחילת P לתחילת QRS. תקין: 120–200ms.
- קצר (<120ms): פרה-אקסיטציה (WPW, LGL), AVNRT.
- מוארך (>200ms): חסם AV מדרגה 1.
- משתנה: חסם 2° (Wenckebach = מתארך-מתארך-נעדר; Mobitz II = קבוע ופתאום נעדר).
- נעדר: AV dissociation (חסם 3°), junctional/ventricular rhythm.

### 5. קומפלקס QRS
- משך: <120ms צר, ≥120ms רחב.
- רחב + rSR' ב-V1, S עמוק ב-V6 = RBBB.
- רחב + R רחב מוארך ב-V5/V6 (ללא Q), S עמוק ב-V1 = LBBB.
- רחב + דלתא wave + PR קצר = WPW.
- רחב + תבנית LBBB אך עם Q/pathological בהובלות ש-LBBB מסתיר = Sgarbossa (אוטם ב-LBBB).
- Q פתולוגי: רוחב ≥40ms ו/או עומק ≥1/3 מ-R באותה הובלה.

### 6. מקטע ST
- הגבהה: ≥1mm בהובלות גפיים, ≥2mm בהובלות פרה-קורדיאליות (גברים <40), ≥1.5mm (גברים >40/נשים). נמדד מ-J point.
- הגבהה עם convex/dome morphology = STEMI (לא early repolarization).
- שקיעה: שטוח/משופע-כלפי-מטה = איסכמיה; שקיעה שטוחה = subendocardial ischemia (NSTEMI).
- היפראקוטית: T גבוה-רחב-סימטרי באותן הובלות = אוטם מוקדם מאוד (hyperacute T).
- De Winter T waves: ST depression up-sloping ב-V1–V6 עם T חיובי גבוה-סימטרי = LAD occlusion.
- Wellens: T biphasic (עמוק שלילי) ב-V2–V3, כאב חולף = LAD critical stenosis.

### 7. גלי T
- היפוך: תחתית (II, III, aVF) = איסכמיה תחתית; קדמית (V1–V4) = איסכמיה קדמית/פרקרדיטיס.
- Peaked: היפרקלמיה (צר-גבוה-סימטרי, "tented").
- שטוח/נמוך: היפוקלמיה, איסכמיה.
- Hyperacute: גבוה-רחב באזור אוטם.

### 8. מקטע QT
- מדידה מתחילת Q לסוף T. QTc = QT / √(RR בשניות). תקין: <440ms (גברים), <460ms (נשים).
- מוארך: LQTS, תרופות, היפוקלצמיה, היפומגנזמיה.
- קצר: היפרקלצמיה, SQTS, דיגוקסין.
- QU: היפוקלמיה (U wave מתמזג).

### 9. ציר חשמלי (Axis)
- נורמלי: -30° עד +90°.
- שמאלי: -30° עד -90° (I חיובי, aVF שלילי) — LAFB, LBBB, LVH, אוטם תחתית.
- ימני: +90° עד +180° (I שלילי, aVF חיובי) — RVH, LPFB, אוטם צידי, dextrocardia.
- קיצוני: -90° עד ±180° (I ו-aVF שליליים) — אוטם נרחב, ventricular rhythm.

### 10. סיכום אבחנה
אחרי 9 השלבים, הצלב את הממצאים מול כללי האבחנה הבאים וקבע אבחנה.`;

export const ECG_DIAGNOSTIC_RULES = `## כללי אבחנה — ממצאים → אבחנה
הפעל כל קבוצת כללים. עבור כלל, סמן: **מתקיים / לא מתקיים / לא-בר-הערכה** עם ראיה מהמדידות.

### א. הפרעות קצב (Arrhythmias)
- **סינוס תקין:** P חיובי ב-II, 1:1, PR תקין, סדיר, 60–100.
- **סינוס מהיר:** כנ"ל, >100.
- **סינוס איטי:** כנ"ל, <60.
- **פרפור עליות (AF):** לא-סדיר-לחלוטין, ללא P, f-waves או שטוח.
- **רפרוף עליות (AFlutter):** sawtooth flutter waves (~300), סדיר/לא-סדיר, QRS צר.
- **SVT:** צר, מהיר (150–250), סדיר, P נעדר/מוסתר/retrograde.
- **AT (atrial tachycardia):** P שונה מסינוס, סדיר.
- **Junctional:** P retrograde (שלילי ב-II) או נעדר, QRS צר, 40–60 (escape) או 70–130 (tach).
- **VT:** רחב, מהיר (>100), סדיר/מעט לא-סדיר, AV dissociation, capture/fusion beats.
- **VF:** כאוטי, ללא QRS מזוהה.
- **Torsades:** VT פולימורפי, סיבוב ציר, QT מוארך.
- **AVNRT:** צר, מהיר מאוד (150–250), P retrograde בתוך/אחרי QRS או נעדר.
- **AVRT (orthodromic):** צר, מהיר, P retrograde ב-ST segment, לעיתים pseudo-S ב-II/III/aVF.

### ב. הפרעות הולכה (Conduction)
- **חסם AV 1°:** PR >200ms, 1:1.
- **חסם AV 2° Mobitz I (Wenckebach):** PR מתארך-מתארך עד נעדר, מחזורי.
- **חסם AV 2° Mobitz II:** PR קבוע, פתאום נעדר, QRS לרוב רחב.
- **חסם AV 2° 2:1:** 2 P על כל QRS — לא ניתן לסווג I/II ללא מנה ארוכה.
- **חסם AV 3° (מלא):** AV dissociation, P ו-QRS עצמאיים, QRS צר (junctional) או רחב (ventricular).
- **RBBB:** QRS ≥120ms, rSR' ב-V1–V2, S עמוק ב-I/V5–V6.
- **LBBB:** QRS ≥120ms, R מוארך-מוצר ב-V5–V6 (ללא Q), QS/rS עמוק ב-V1.
- **LAFB:** ציר שמאלי (-45 עד -90), qR ב-aVL, rS ב-III, QRS <120ms.
- **LPFB:** ציר ימני (+90 עד +180), rS ב-I, qR ב-III, QRS <120ms, ללא RVH.
- **Bifascicular:** RBBB + LAFB (השכיח) או RBBB + LPFB.
- **Trifascicular:** Bifascicular + חסם AV 1°.

### ג. אוטם / איסכמיה (Ischemia/Infarction) — לפי הובלות
**STEMI — הגבהת ST בתבנית טריטוריאלית:**
- **קדמי (Anterior):** ST elevation V1–V4.
- **מחיצתי (Septal):** ST elevation V1–V2 (לבד או עם קדמי).
- **צידי (Lateral):** ST elevation I, aVL, V5–V6.
- **תחתית (Inferior):** ST elevation II, III, aVF.
- **אחורי (Posterior):** ST depression V1–V3 + tall R + upright T (mirror) — או ST elevation V7–V9.
- **צידי-גבוה (High lateral):** ST elevation I, aVL (לבד).
- **גזע ראשי / LAD proximal:** ST elevation aVR > V1 + דיכוי ST נרחב.
- **חדר ימני (RVMI):** ST elevation V4R (תמיד בדוק באוטם תחתית!).

**דפוסים מיוחדים של איסכמיה:**
- **De Winter T waves:** ST depression up-sloping V1–V6 + T חיובי סימטרי = LAD occlusion (STEMI-equivalent).
- **Wellens syndrome:** T biphasic (עמוק שלילי) V2–V3, כאב חולף = LAD critical stenosis (סכנה לאוטם קדמי מסיבי).
- **Hyperacute T:** T גבוה-רחב-בלתי-סימטרי בטריטוריה = אוטם מוקדם מאוד.
- **NSTEMI:** ST depression / T inversion, ללא STEMI pattern, troponin חיובי.
- **Sgarbossa (אוטם ב-LBBB/קוצב):** ST elevation ≥5mm עם כיוון QRS הפוך (concordant), או ST elevation ≥1mm concordant, או ST depression ≥1mm ב-V1–V3.

### ד. הגדלת חדרים / עליות (Chamber Hypertrophy/Enlargement)
- **LAE (left atrial enlargement):** P >120ms מפוצל ב-II, או רכיב סופי שלילי ב-V1 (עומק × משך > 0.04mm·s).
- **RAE (right atrial enlargement):** P >2.5mm ב-II (P pulmonale), <2.5mm ב-V1.
- **LVH (Sokolow-Lyon):** S V1 + R V5/V6 ≥35mm (גברים ≥40mm, נשים ≥35mm). או R aVL ≥11mm. או Cornell: S V3 + R aVL ≥28mm (גברים) / ≥20mm (נשים).
- **RVH:** R dominant ב-V1 (R>S ב-V1), ציר ימני, S עמוק ב-V5–V6.
- **Biatrial/Biventricular:** שילוב קריטריונים.

### ה. אלקטרוליטים ומטבוליזם
- **היפרקלמיה:** T peaked-tented → QRS מתרחב → P נעלם → sine wave (מסכן חיים). מדורג לפי חומרה.
- **היפוקלמיה:** T שטוח/נמוך, U waves, ST depression, QU prolongation. חמור → VT/Torsades.
- **היפרקלצמיה:** QT קצר, לעיתים J wave (Osborn-like).
- **היפוקלצמיה:** QT מוארך (ST מוארך, T תקין).
- **היפותירואידיזם:** bradycardia, T שטוח, pericardial effusion (low voltage).
- **היפרתירואידיזם:** tachycardia, AF.
- **היפותרמיה:** Osborn/J waves, bradycardia, AF.

### ו. תסמונות תורשתיות / מולדות
- **Brugada:** coved ST elevation ≥2mm ב-V1–V3 (Type 1), T שלילי. סכנת VT/VF.
- **LQTS:** QTc >460ms (נשים) / >440ms (גברים). LQT1: T broad-based; LQT2: T notched/biphasic; LQT3: T late-onset.
- **SQTS:** QTc <340ms, T tall.
- **WPW:** PR <120ms, delta wave, QRS רחב, pseudo-Q ב-II/III/aVF (מזויף אוטם תחתית).
- **ARVC:** T inversion V1–V3, epsilon wave, RBBB-like, PVCs LBBB-morphology.
- **HCM:** LVH מסיבי, T inversion עמוק V1–V6, Q pathological (septal), apical variant = T giant negative.
- **CPVT:** פולימורפי PVCs/VT במאמץ, ECG במנוחה תקין.

### ז. השפעות תרופות / רעלים
- **דיגוקסין:** ST scooping ("reverse check"), T flat/inverted, QT קצר, PVCs. רעילות: arrhythmias, MAT, brady/tachy.
- **תרופות מאריכות QT:** antiarrhythmics, antipsychotics, antibiotics, methadone.
- **Amiodarone:** QT מוארך, T flat/notched, bradycardia.
- **קוקאין:** STEMI-like (vasospasm), tachycardia, VT.
- **TCAs:** QRS רחב, R' ב-aVR, tachycardia.

### ח. פריקרדיטיס / תסמינים אחרים
- **פריקרדיטיס:** ST elevation דיפוזי concave, PR depression (דיפוזי), ללא תבנית טריטוריאלית, ללא Q pathological.
- **Early repolarization:** ST elevation concave, J-point notching, T tall, בהובלות קדמיות-צידיות, בריא צעיר.
- **Pulmonary embolism:** S1Q3T3 (S ב-I, Q ב-III, T inverted ב-III), sinus tach, RBBB, T inversion V1–V4.
- **CNS/Brain injury:** T giant inverted, QT מוארך, bradycardia.
- **Hypertrophic CMP:** ראה HCM לעיל.`;

/** Combined full ruleset injected into the ECG interpretation stage. */
export const ECG_FULL_RULES = `${ECG_LEAD_TERRITORIES}

${ECG_SYSTEMATIC_METHOD}

${ECG_DIAGNOSTIC_RULES}`;

/** Schema for the structured ECG interpretation output. */
export const ECG_INTERPRETATION_SCHEMA = {
  type: "object",
  properties: {
    lead_findings: {
      type: "array",
      description: "ממצאים לפי כל הובלה או קבוצת הובלות",
      items: {
        type: "object",
        properties: {
          leads: { type: "string", description: "ההובלות (למשל: V1-V4, II/III/aVF)" },
          finding: { type: "string", description: "הממצא בהובלות אלו (למשל: ST elevation 2mm)" },
          territory: { type: "string", description: "הדופן/טריטוריה המתאימה" },
        },
        required: ["leads", "finding"],
      },
    },
    systematic_analysis: {
      type: "array",
      description: "תוצאות 10 שלבי הפענוח השיטתי",
      items: {
        type: "object",
        properties: {
          step: { type: "string", description: "שם השלב (קצב, רגולריות, גלי P, וכו')" },
          result: { type: "string", description: "התוצאה הכמותית/תיאורית" },
        },
        required: ["step", "result"],
      },
    },
    rule_applications: {
      type: "array",
      description: "הפעלת כללי האבחנה — איזה כלל מתקיים/לא מתקיים",
      items: {
        type: "object",
        properties: {
          rule: { type: "string", description: "שם הכלל/האבחנה האפשרית" },
          status: { type: "string", enum: ["met", "not_met", "indeterminate"] },
          evidence: { type: "string", description: "הראיה מהמדידות/ההובלות" },
          confidence: { type: "number", description: "ביטחון 0-100" },
        },
        required: ["rule", "status", "evidence"],
      },
    },
    preliminary_diagnosis: { type: "string", description: "האבחנה הראשית על בסיס הכללים" },
    differentials: {
      type: "array",
      description: "אבחנות מבדלות",
      items: { type: "string" },
    },
    reasoning: { type: "string", description: "נימוק מפורט לאבחנה על בסיס הכללים וההובלות" },
  },
  required: ["lead_findings", "systematic_analysis", "rule_applications", "preliminary_diagnosis", "reasoning"],
};