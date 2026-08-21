import React, { useState } from "react";
import { ShieldCheck, ShieldAlert, ChevronDown } from "lucide-react";

/**
 * מציג את תוצאת ה-numericGuard על נרטיב הפענוח.
 *
 * למה זה על המסך ולא רק בלוג: בדיקה שרצה ואינה נראית שקולה לבדיקה
 * שלא רצה. אם מספר נוטרל מהניתוח, הרופא/ה חייב/ת לדעת שהיה שם מספר —
 * אחרת הטקסט נקרא כשלם.
 */
export default function NumericIntegrityNotice({ integrity }) {
  const [open, setOpen] = useState(false);
  const mandateHit = (integrity?.mandate_violations?.length ?? 0) > 0;
  if (!integrity || (!integrity.checked_numbers && !mandateHit)) return null;

  const blocked = integrity.blocked ?? [];
  const warnings = (integrity.violations ?? []).filter((v) => v.severity !== "block");
  const clean = blocked.length === 0 && warnings.length === 0;

  // באנר מנדט: ניסוח שחורג מגבול הכלי (אבחנה סופית וכו') — מוצג תמיד, גם כשהמספרים נקיים.
  const MandateBanner = mandateHit ? (
    <div className="rounded-xl border p-3 text-sm bg-red-50 border-red-200 text-red-900 mb-2">
      <div className="flex items-start gap-2">
        <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold">ניסוח חורג ממנדט — הכלי אינו קובע אבחנה סופית</p>
          <p className="text-xs mt-1 opacity-90">{integrity.mandate_note_he}</p>
        </div>
      </div>
    </div>
  ) : null;

  // אין ממצא ואין מה להתריע — הודעה שקטה בשורה אחת.
  if (clean) {
    return (
      <>
        {MandateBanner}
        {integrity.checked_numbers ? (
          <div className="flex items-start gap-2 text-xs text-muted-foreground border border-border rounded-lg px-3 py-2">
            <ShieldCheck className="w-4 h-4 mt-px shrink-0 text-emerald-600" />
            <span>
              {integrity.checked_numbers} מספרים בניתוח נבדקו — לכולם יש מקור בתצפית.
              <span className="block opacity-70">{integrity.limitation_he}</span>
            </span>
          </div>
        ) : null}
      </>
    );
  }

  const severe = blocked.length > 0;

  return (
    <>
    {MandateBanner}
    <div
      className={`rounded-xl border p-3 text-sm ${
        severe
          ? "bg-red-50 border-red-200 text-red-900"
          : "bg-amber-50 border-amber-200 text-amber-900"
      }`}
    >
      <div className="flex items-start gap-2">
        <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold">
            {severe
              ? `${blocked.length} מספרים ללא מקור נוטרלו מהניתוח`
              : `${warnings.length} מספרים ללא מקור מאומת`}
          </p>
          <p className="text-xs mt-1 opacity-90">{integrity.note_he}</p>

          {severe && integrity.redacted_fields?.length > 0 && (
            <p className="text-xs mt-1 opacity-90">
              שדות שתוקנו: {integrity.redacted_fields.join(", ")}
            </p>
          )}

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2"
          >
            {open ? "הסתר פירוט" : "הצג את המספרים"}
            <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>

          {open && (
            <ul className="mt-2 space-y-1.5">
              {[...blocked, ...warnings].map((v, i) => (
                <li key={i} className="text-xs bg-white/60 rounded-md px-2 py-1.5">
                  <span className="font-mono font-semibold">{v.raw}</span>
                  {v.severity === "block" && (
                    <span className="ms-1.5 text-[10px] font-bold uppercase">נוטרל</span>
                  )}
                  <span className="block opacity-75 mt-0.5">…{v.context}…</span>
                </li>
              ))}
            </ul>
          )}

          <p className="text-[11px] mt-2 opacity-70">{integrity.limitation_he}</p>
        </div>
      </div>
    </div>
    </>
  );
}
