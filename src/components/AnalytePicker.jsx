import React, { useState, useRef, useEffect } from "react";
import { Check, Search } from "lucide-react";
import { searchAnalytes, resolveAnalyte, CATEGORIES, RESULT_TYPES } from "@/lib/medscan/deterministic/analyteCatalog";

/**
 * בורר מדדי מעבדה עם השלמה אוטומטית.
 *
 * שתי החלטות תכנון:
 *
 * 1. **טקסט חופשי מותר.** מדד שאינו בקטלוג עדיין נקלט — הרשימה היא
 *    עזר, לא כלוב. מדד לא-מוכר פשוט לא יקבל מפתח קנוני, ולכן לא ישתתף
 *    בהתאמת דפוסים. זה מוצג למשתמש ולא נבלע.
 *
 * 2. **הבחירה מזרימה יחידה וסוג תוצאה.** מדד מיקרוביולוגי או גנטי
 *    מסומן כאיכותי, והטופס מפסיק לדרוש ממנו מספר. זו לא נוחות —
 *    תרבית דם היא ממצא, לא ערך.
 */
export default function AnalytePicker({ value, onChange, onSelect, placeholder = "חפש מדד…", className = "" }) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef(null);

  useEffect(() => {
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const handleChange = (v) => {
    onChange(v);
    const r = searchAnalytes(v, 8);
    setResults(r);
    setHighlight(0);
    setOpen(r.length > 0 && v.trim().length > 0);
  };

  const pick = (a) => {
    onChange(a.he);
    onSelect?.(a);
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (!open || !results.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => (h + 1) % results.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => (h - 1 + results.length) % results.length); }
    else if (e.key === "Enter") { e.preventDefault(); pick(results[highlight]); }
    else if (e.key === "Escape") setOpen(false);
  };

  const known = resolveAnalyte(value);
  const isFreeText = value?.trim() && !known;

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <div className="relative">
        <input
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => { if (value?.trim()) handleChange(value); }}
          placeholder={placeholder}
          className={`w-full h-9 rounded-md border text-xs px-2 pl-6 bg-white ${
            isFreeText ? "border-amber-300" : "border-slate-200"
          }`}
        />
        {known ? (
          <Check className="absolute left-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-emerald-500" />
        ) : (
          <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300" />
        )}
      </div>

      {isFreeText && !open && (
        <p className="text-[10px] text-amber-700 mt-0.5 leading-tight">
          מדד שאינו בקטלוג — ייקלט, אך לא ישתתף בהתאמת דפוסים.
        </p>
      )}

      {open && (
        <ul className="absolute z-40 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg">
          {results.map((a, i) => (
            <li key={a.key}>
              <button
                type="button"
                onMouseEnter={() => setHighlight(i)}
                onClick={() => pick(a)}
                className={`w-full text-right px-2.5 py-1.5 transition-colors ${
                  i === highlight ? "bg-slate-50" : ""
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-medium text-slate-800">{a.he}</span>
                  <span className="text-[10px] text-slate-400 shrink-0">
                    {a.unit || (a.type !== RESULT_TYPES.NUMERIC ? "איכותי" : "")}
                  </span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[10px] text-slate-500">{a.en}</span>
                  <span className="text-[10px] text-slate-300">·</span>
                  <span className="text-[10px] text-slate-400">{CATEGORIES[a.cat]}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
