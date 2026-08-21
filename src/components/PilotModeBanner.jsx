import React from "react";
import { AlertTriangle } from "lucide-react";
import { isPilotMode, setPilotMode } from "@/lib/medscan/runtimeMode";

/**
 * באנר גלובלי קבוע שמוצג כל עוד מצב-פילוט פעיל.
 *
 * מצב-פילוט מאפשר למנועי הנימוק להשתמש גם בידע שטרם אומת (טיוטות
 * מעוגנות-מקור), כל פריט מסומן "לא מאומת". זה הופך את הכלי למתפקד
 * מקצה-לקצה לצורך הדגמה ובדיקה — אך אינו לשימוש קליני מחייב.
 *
 * הבאנר קבוע בראש המסך כדי שלעולם לא ייווצר מצב שבו ידע לא-מאומת
 * מוצג בלי שהרופא/ה יודע/ת שמצב-פילוט פעיל.
 */
export default function PilotModeBanner() {
  if (!isPilotMode()) return null;

  const exit = () => {
    setPilotMode(false);
    window.location.reload();
  };

  return (
    <div
      dir="rtl"
      className="sticky top-0 z-50 bg-amber-500 text-amber-950 border-b border-amber-600 shadow-sm"
    >
      <div className="max-w-3xl mx-auto px-3 py-2 flex items-center gap-2 text-sm">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span className="flex-1 font-medium leading-tight">
          מצב פילוט פעיל — התוצאות עשויות להישען על ידע שטרם אומת (מסומן
          "לא מאומת"). להדגמה ובדיקה בלבד, לא לשימוש קליני מחייב.
        </span>
        <button
          type="button"
          onClick={exit}
          className="shrink-0 rounded-lg bg-amber-950/10 hover:bg-amber-950/20 px-2.5 py-1 text-xs font-semibold"
        >
          יציאה
        </button>
      </div>
    </div>
  );
}
