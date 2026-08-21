import React from "react";
import { Baby } from "lucide-react";
import { useI18n } from "@/lib/i18n";

const labels = {
  he: { title: "מטופל ילד (<18)", hint: "מחיל נורמות ואבחנות תואמות-גיל" },
  en: { title: "Pediatric patient (<18)", hint: "Applies age-specific norms & diagnoses" },
  ar: { title: "مريض طفل (<18)", hint: "يطبّق معايير وتشخيصات حسب العمر" },
};

/** Reusable toggle that forces age-specific evaluation in the engines. */
export default function PediatricToggle({ value, onChange }) {
  const { lang } = useI18n();
  const l = labels[lang] || labels.he;
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`w-full flex items-center gap-3 rounded-xl border p-3 transition-colors ${
        value ? "bg-pink-50 border-pink-300" : "bg-white border-slate-200 hover:bg-slate-50"
      }`}
    >
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${value ? "bg-pink-500" : "bg-slate-100"}`}>
        <Baby className={`w-5 h-5 ${value ? "text-white" : "text-slate-400"}`} />
      </div>
      <div className="flex-1 text-right">
        <p className={`text-sm font-semibold ${value ? "text-pink-700" : "text-foreground"}`}>{l.title}</p>
        <p className="text-[11px] text-muted-foreground">{l.hint}</p>
      </div>
      <div className={`w-10 h-6 rounded-full p-0.5 transition-colors shrink-0 ${value ? "bg-pink-500" : "bg-slate-200"}`}>
        <div className={`w-5 h-5 rounded-full bg-white transition-transform ${value ? "translate-x-[-16px]" : ""}`} />
      </div>
    </button>
  );
}
