import React, { useState, useEffect } from "react";
import { Hand, ChevronDown } from "lucide-react";

/**
 * Two-channel input — captures clinical facts the IMAGE CANNOT CARRY and feeds
 * them into the model's context. Config-driven so each modality supplies its
 * own high-yield fields:
 *   - skin: diascopy, palpation texture, Nikolsky, elevation, tenderness, itch
 *   - ecg:  symptoms, culprit meds, electrolyte suspicion, prior events
 *   - radiology: indication, laterality, mechanism, focal exam sign
 * Emits a Hebrew summary string via onChange; empty when nothing is set.
 */

export const SKIN_EXAM_FIELDS = [
  { key: "diascopy", label: "לחיצה (diascopy)", options: [["", "לא נבדק"], ["מחוויר בלחיצה (blanching) — כלי-דם/אריתמה", "מחוויר"], ["לא מחוויר בלחיצה — חשד פורפורה/פטכיות", "לא מחוויר ⚠"]] },
  { key: "texture", label: "מרקם במישוש", options: [["", "לא נבדק"], ["מרקם חלק", "חלק"], ["מרקם מחוספס/נייר-זכוכית (sandpaper)", "מחוספס"], ["מוקשה/אינדורציה במישוש", "מוקשה"]] },
  { key: "elevation", label: "מישוש — מורם/שטוח", options: [["", "לא נבדק"], ["שטוח (מקולרי)", "שטוח"], ["מורם (פפולרי/פלאק)", "מורם"], ["מוסלל/עם תוכן (וסיקולה/בולה/ציסטה)", "עם תוכן"]] },
  { key: "nikolsky", label: "סימן Nikolsky", options: [["", "לא נבדק"], ["Nikolsky שלילי", "שלילי"], ["Nikolsky חיובי — חשד SJS/TEN/פמפיגוס/SSSS", "חיובי ⚠"]] },
  { key: "tenderness", label: "רגישות למגע", options: [["", "לא נבדק"], ["אינו רגיש", "לא רגיש"], ["רגיש/כואב במישוש", "כואב"]] },
  { key: "itch", label: "גרד", options: [["", "לא נבדק"], ["ללא גרד", "ללא"], ["מגרד", "מגרד"]] },
];

export const ECG_EXAM_FIELDS = [
  { key: "symptom", label: "תסמין מרכזי", options: [["", "לא צוין"], ["כאב חזה", "כאב חזה"], ["דפיקות לב (palpitations)", "דפיקות"], ["סינקופה/טרום-עילפון", "סינקופה"], ["קוצר נשימה", "קוצר נשימה"], ["א-סימפטומטי", "א-סימפטומטי"]] },
  { key: "meds", label: "תרופות רלוונטיות", options: [["", "לא צוין"], ["תרופות מאריכות QT", "מאריכות QT"], ["דיגוקסין", "דיגוקסין"], ["חוסמי-בטא/חוסמי-סידן", "חוסמי קצב"]] },
  { key: "lytes", label: "חשד אלקטרוליטי", options: [["", "לא צוין"], ["חשד היפרקלמיה", "היפרקלמיה"], ["חשד היפוקלמיה", "היפוקלמיה"], ["חשד היפו/היפרקלצמיה", "סידן"]] },
  { key: "history", label: "רקע לבבי", options: [["", "לא צוין"], ["אירוע לבבי/איסכמי קודם", "רקע איסכמי"], ["קוצב/ICD מושתל", "קוצב"], ["מחלת לב מבנית/מולדת", "מבני/מולד"]] },
];

export const RADIOLOGY_EXAM_FIELDS = [
  { key: "indication", label: "התוויה קלינית", options: [["", "לא צוין"], ["כאב חזה/קוצר נשימה", "חזה"], ["כאב בטן", "בטן"], ["חבלה/טראומה", "טראומה"], ["חום/חשד זיהום", "חום"], ["בדיקת מיקום טובוס/צנתר", "בדיקת טובוס"], ["מעקב/סקר", "מעקב"]] },
  { key: "laterality", label: "צד", options: [["", "לא צוין"], ["ימין", "ימין"], ["שמאל", "שמאל"], ["דו-צדדי", "דו-צדדי"]] },
  { key: "mechanism", label: "מנגנון", options: [["", "לא צוין"], ["טראומטי", "טראומטי"], ["לא-טראומטי", "לא-טראומטי"]] },
  { key: "focal", label: "ממצא מוקדי בבדיקה", options: [["", "לא צוין"], ["כאב/רגישות מקומית", "רגישות מקומית"], ["ירידה בכניסת אוויר", "אוויר ↓"], ["בטן חריפה", "בטן חריפה"]] },
];

export default function ExamFindingsInput({ onChange, fields = SKIN_EXAM_FIELDS, title = "ממצאי בדיקה גופנית (הערוץ שהמצלמה לא רואה)" }) {
  const [open, setOpen] = useState(false);
  const [vals, setVals] = useState({});

  useEffect(() => {
    const parts = fields.map((f) => vals[f.key]).filter(Boolean);
    onChange?.(parts.length ? `הקשר קליני נוסף (מהרופא/ה): ${parts.join("; ")}.` : "");
  }, [vals, onChange, fields]);

  const setField = (k, v) => setVals((p) => ({ ...p, [k]: v }));

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-3 text-right">
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Hand className="w-4 h-4 text-teal-500" />
          {title}
        </span>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
          {fields.map((f) => (
            <label key={f.key} className="text-[11px] text-slate-600">
              <span className="block mb-1 font-medium">{f.label}</span>
              <select
                value={vals[f.key] || ""}
                onChange={(e) => setField(f.key, e.target.value)}
                className="w-full h-9 rounded-lg border border-slate-200 px-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              >
                {f.options.map(([val, lbl]) => (
                  <option key={lbl} value={val}>{lbl}</option>
                ))}
              </select>
            </label>
          ))}
          <p className="col-span-2 text-[10px] text-slate-400">
            הממצאים מוזנים ל-AI כהקשר קליני — משפרים דיוק על מה שאינו נראה בתמונה.
          </p>
        </div>
      )}
    </div>
  );
}
