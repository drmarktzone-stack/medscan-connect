import React, { useState } from "react";
import { Loader2, Flag } from "lucide-react";
import { base44 } from "@/api/base44Client";
import ImageUploader from "@/components/ImageUploader";

const ecgCategories = ["rhythm","conduction","ischemic","chamber_abnormality","electrolyte","syndrome","drug_effect","other"];
const skinCategories = ["benign","malignant","precancerous","inflammatory","infectious","autoimmune","pigmentation","vascular","other"];
const radiologyCategories = ["chest","abdominal","musculoskeletal","neurological","cardiac","vascular","genitourinary","other"];

export default function GoldStandardForm({ type, onSaved }) {
  const [title, setTitle] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);

  const categories = type === "ecg" ? ecgCategories : type === "skin" ? skinCategories : radiologyCategories;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title || !diagnosis) return;
    setSaving(true);
    try {
      let image_url = "";
      if (files.length > 0) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file: files[0] });
        image_url = file_url;
      }
      await base44.entities.GoldStandardCase.create({
        type, title, correct_diagnosis: diagnosis, category, description, urgent, image_url,
      });
      setTitle(""); setDiagnosis(""); setCategory(""); setDescription(""); setUrgent(false); setFiles([]);
      onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="כותרת המקרה" required
        className="w-full h-9 rounded-lg border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
      <input value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder="האבחנה הנכונה (זהב)" required
        className="w-full h-9 rounded-lg border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
      <select value={category} onChange={(e) => setCategory(e.target.value)}
        className="w-full h-9 rounded-lg border border-slate-200 px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20">
        <option value="">קטגוריה</option>
        {categories.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="תיאור קליני" rows={2}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20" />
      <ImageUploader files={files} onFilesChange={setFiles} label="תמונת בדיקה" hint="תמונת המקרה להערכה" />
      <label className="flex items-center gap-2 cursor-pointer">
        <button type="button" onClick={() => setUrgent(!urgent)} className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg ${urgent ? "bg-red-500 text-white" : "bg-red-50 text-red-600 border border-red-200"}`}>
          <Flag className={`w-3.5 h-3.5 ${urgent ? "fill-current" : ""}`} /> דחוף
        </button>
      </label>
      <button type="submit" disabled={saving || !title || !diagnosis}
        className="w-full h-10 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 flex items-center justify-center">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "הוסף לסט הזהב"}
      </button>
    </form>
  );
}