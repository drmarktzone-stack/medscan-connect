import React, { useState } from "react";
import { Upload, Sparkles, Loader2, FileSpreadsheet, CheckCircle2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { generateCasesWithAI } from "@/lib/evaluation";

export default function BulkImport({ type, target, onSaved }) {
  const [mode, setMode] = useState(null);
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState(10);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState([]);
  const [error, setError] = useState(null);

  const entityName = target === "gold"
    ? "GoldStandardCase"
    : { ecg: "ECGCase", skin: "SkinCase", radiology: "RadiologyCase" }[type];

  const handleCSV = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const result = await base44.integrations.Core.ExtractDataFromUploadedFile({
        file_url,
        json_schema: {
          type: "object",
          properties: {
            cases: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  diagnosis: { type: "string" },
                  category: { type: "string" },
                  key_features: { type: "string" },
                  description: { type: "string" },
                  urgent: { type: "boolean" },
                },
              },
            },
          },
        },
      });
      const cases = result.output?.cases || result.output || [];
      setPreview(cases);
    } catch (err) {
      setError("שגיאה בקריאת הקובץ. ודא שהוא בפורמט תקין.");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const cases = await generateCasesWithAI({ type, target, topic, count });
      setPreview(cases);
    } catch (err) {
      setError("שגיאה ביצירת מקרים. נסה שנית.");
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    setLoading(true);
    try {
      const records = preview.map((c) => {
        if (target === "gold") return { ...c, type, correct_diagnosis: c.diagnosis || c.correct_diagnosis };
        const { correct_diagnosis, ...rest } = c;
        return { ...rest, diagnosis: c.diagnosis || correct_diagnosis };
      });
      await base44.entities[entityName].bulkCreate(records);
      setPreview([]);
      setMode(null);
      onSaved?.();
    } catch (err) {
      setError("שגיאה בשמירת המקרים.");
    } finally {
      setLoading(false);
    }
  };

  if (preview.length > 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-green-500" />
          <p className="text-sm font-semibold">{preview.length} מקרים מוכנים לייבוא</p>
        </div>
        <div className="max-h-48 overflow-y-auto space-y-1.5">
          {preview.map((c, i) => (
            <div key={i} className="text-xs bg-slate-50 rounded-lg p-2">
              <span className="font-semibold">{c.title}</span>
              {c.diagnosis && <span className="text-muted-foreground"> — {c.diagnosis}</span>}
              {c.urgent && <span className="text-red-500 font-bold"> • דחוף</span>}
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={handleImport} disabled={loading}
            className="flex-1 h-9 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 flex items-center justify-center">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : `ייבא ${preview.length} מקרים`}
          </button>
          <button onClick={() => setPreview([])} className="h-9 px-4 rounded-lg border border-slate-200 text-sm text-muted-foreground">ביטול</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setMode("csv")} className={`h-20 rounded-xl border-2 flex flex-col items-center justify-center gap-1 transition-all ${mode === "csv" ? "border-primary bg-primary/5" : "border-slate-200 hover:border-primary/30"}`}>
          <FileSpreadsheet className="w-5 h-5 text-primary" />
          <span className="text-xs font-semibold">ייבוא CSV</span>
        </button>
        <button onClick={() => setMode("ai")} className={`h-20 rounded-xl border-2 flex flex-col items-center justify-center gap-1 transition-all ${mode === "ai" ? "border-primary bg-primary/5" : "border-slate-200 hover:border-primary/30"}`}>
          <Sparkles className="w-5 h-5 text-primary" />
          <span className="text-xs font-semibold">יצירה ב-AI</span>
        </button>
      </div>

      {mode === "csv" && (
        <label className="block">
          <input type="file" accept=".csv,.xlsx,.json" onChange={handleCSV} className="hidden" />
          <div className="cursor-pointer rounded-xl border-2 border-dashed border-slate-200 p-6 text-center hover:border-primary/40 hover:bg-slate-50 transition-all">
            {loading ? <Loader2 className="w-5 h-5 mx-auto text-primary animate-spin" /> : <Upload className="w-5 h-5 mx-auto text-primary" />}
            <p className="text-xs font-semibold mt-2">בחר קובץ CSV / Excel / JSON</p>
            <p className="text-[10px] text-muted-foreground mt-1">עמודות: title, diagnosis, category, key_features, description, urgent</p>
          </div>
        </label>
      )}

      {mode === "ai" && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="נושא (אופציונלי) — לדוגמה: הפרעות קצב חדריות"
            className="w-full h-9 rounded-lg border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">מספר מקרים:</label>
            <input type="number" min="1" max="30" value={count} onChange={(e) => setCount(Number(e.target.value))}
              className="w-16 h-9 rounded-lg border border-slate-200 px-2 text-sm text-center" />
          </div>
          <button onClick={handleGenerate} disabled={loading}
            className="w-full h-9 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            צור מקרים
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-500 text-center">{error}</p>}
    </div>
  );
}