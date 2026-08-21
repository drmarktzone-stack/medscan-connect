import React, { useState, useEffect } from "react";
import { ChevronDown, User } from "lucide-react";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/lib/i18n";

export default function ClinicalContextForm({ onChange, onMeta }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [fields, setFields] = useState({
    patient_ref: "",
    age: "",
    sex: "",
    symptoms: "",
    duration: "",
    history: "",
    medications: "",
  });

  useEffect(() => {
    const parts = [];
    if (fields.age) parts.push(`${t("ctx.out_age")}: ${fields.age}`);
    if (fields.sex) parts.push(`${t("ctx.out_sex")}: ${fields.sex}`);
    if (fields.symptoms) parts.push(`${t("ctx.out_symptoms")}: ${fields.symptoms}`);
    if (fields.duration) parts.push(`${t("ctx.out_duration")}: ${fields.duration}`);
    if (fields.history) parts.push(`${t("ctx.out_history")}: ${fields.history}`);
    if (fields.medications) parts.push(`${t("ctx.out_medications")}: ${fields.medications}`);
    onChange(parts.join("\n"));
    onMeta?.({ age: fields.age, sex: fields.sex, patient_ref: fields.patient_ref });
  }, [fields, onChange, onMeta, t]);

  const update = (key, value) => setFields((prev) => ({ ...prev, [key]: value }));
  const filledCount = Object.values(fields).filter(Boolean).length;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">{t("ctx.title")}</span>
          {filledCount > 0 && (
            <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full">
              {t("ctx.fields_count", { n: filledCount })}
            </span>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-100 pt-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">מזהה מטופל (אופציונלי · לא נשלח ל-AI)</label>
            <input
              type="text"
              value={fields.patient_ref}
              onChange={(e) => update("patient_ref", e.target.value)}
              placeholder="שם או מספר לזיהוי המטופל (להשוואת ECG)"
              className="w-full h-9 rounded-lg border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t("ctx.age")}</label>
              <input
                type="number"
                value={fields.age}
                onChange={(e) => update("age", e.target.value)}
                placeholder={t("ctx.age_ph")}
                className="w-full h-9 rounded-lg border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t("ctx.sex")}</label>
              <Select value={fields.sex || "unspecified"} onValueChange={(v) => update("sex", v === "unspecified" ? "" : v)}>
                <SelectTrigger className="w-full h-9 rounded-lg border-slate-200 text-sm bg-white">
                  <SelectValue placeholder={t("ctx.sex_unspecified")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unspecified">{t("ctx.sex_unspecified")}</SelectItem>
                  <SelectItem value={t("ctx.sex_male")}>{t("ctx.sex_male")}</SelectItem>
                  <SelectItem value={t("ctx.sex_female")}>{t("ctx.sex_female")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{t("ctx.symptoms")}</label>
            <input
              type="text"
              value={fields.symptoms}
              onChange={(e) => update("symptoms", e.target.value)}
              placeholder={t("ctx.symptoms_ph")}
              className="w-full h-9 rounded-lg border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{t("ctx.duration")}</label>
            <input
              type="text"
              value={fields.duration}
              onChange={(e) => update("duration", e.target.value)}
              placeholder={t("ctx.duration_ph")}
              className="w-full h-9 rounded-lg border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{t("ctx.history")}</label>
            <textarea
              value={fields.history}
              onChange={(e) => update("history", e.target.value)}
              placeholder={t("ctx.history_ph")}
              rows={2}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{t("ctx.medications")}</label>
            <input
              type="text"
              value={fields.medications}
              onChange={(e) => update("medications", e.target.value)}
              placeholder={t("ctx.medications_ph")}
              className="w-full h-9 rounded-lg border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <p className="text-[10px] text-muted-foreground/60">{t("ctx.hint")}</p>
        </div>
      )}
    </div>
  );
}