import React, { useState } from "react";
import { FlaskConical, ShieldCheck } from "lucide-react";
import { isPilotMode, setPilotMode } from "@/lib/medscan/runtimeMode";

/**
 * מתג בשליטת הרופא/ה: מצב קליני (רק ידע מאומת) מול מצב פילוט
 * (גם טיוטות מעוגנות-מקור, מסומנות "לא מאומת").
 *
 * ברירת המחדל היא קלינית. הדלקת מצב-פילוט היא בחירה מפורשת, ומלווה
 * באזהרה גלובלית קבועה (PilotModeBanner). הטעינה-מחדש מוודאת שכל
 * המנועים והרכיבים משקפים את המצב החדש מיידית.
 */
export default function PilotModeToggle() {
  const [on, setOn] = useState(isPilotMode());

  const toggle = () => {
    const next = !on;
    setPilotMode(next);
    setOn(next);
    window.location.reload();
  };

  return (
    <div className={`rounded-xl border p-4 ${on ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          {on ? (
            <FlaskConical className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          ) : (
            <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-bold">
              {on ? "מצב פילוט פעיל" : "מצב קליני (ברירת מחדל)"}
            </p>
            <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
              {on
                ? "מנועי הנימוק משתמשים גם בידע שטרם אומת (מסומן \"לא מאומת\"). מאפשר לראות את הכלי מתפקד מקצה-לקצה — להדגמה ובדיקה בלבד, לא לשימוש קליני מחייב."
                : "רק ידע מאומת מגיע לפלט. כל עוד לא אימתת ידע, מנועי הנימוק יסרבו במקום להציג טיוטות. הדלק/י מצב פילוט כדי לראות את הכלי פועל על הטיוטות."}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={toggle}
          role="switch"
          aria-checked={on}
          className={`relative shrink-0 w-12 h-7 rounded-full transition-colors ${on ? "bg-amber-500" : "bg-slate-300"}`}
        >
          <span
            className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? "right-0.5" : "right-[22px]"}`}
          />
        </button>
      </div>
    </div>
  );
}
