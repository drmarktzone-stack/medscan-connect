import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import ImageUploader from "@/components/ImageUploader";

const ecgCategories = [
  { value: "rhythm", label: "הפרעות קצב" },
  { value: "conduction", label: "הפרעות הולכה" },
  { value: "ischemic", label: "איסכמיה / אוטם" },
  { value: "chamber_abnormality", label: "הגדלת חדרים / עליות" },
  { value: "electrolyte", label: "הפרעות אלקטרוליטים" },
  { value: "syndrome", label: "תסמונות" },
  { value: "drug_effect", label: "השפעות תרופתיות" },
  { value: "other", label: "אחר" },
];

const skinCategories = [
  { value: "benign", label: "שפיר" },
  { value: "malignant", label: "ממאיר" },
  { value: "precancerous", label: "טרום-ממאיר" },
  { value: "inflammatory", label: "דלקתי" },
  { value: "infectious", label: "זיהומי" },
  { value: "autoimmune", label: "אוטואימוני" },
  { value: "pigmentation", label: "פיגמנטציה" },
  { value: "vascular", label: "כלי דם" },
  { value: "other", label: "אחר" },
];

const radiologyCategories = [
  { value: "chest", label: "חזה" },
  { value: "abdominal", label: "בטן" },
  { value: "musculoskeletal", label: "שלד ושרירים" },
  { value: "neurological", label: "נוירולוגי" },
  { value: "cardiac", label: "לב" },
  { value: "vascular", label: "כלי דם" },
  { value: "genitourinary", label: "אורוגניטלי" },
  { value: "other", label: "אחר" },
];

export default function CaseForm({ type, open, onOpenChange, onSaved }) {
  const categories = type === "ecg" ? ecgCategories : type === "skin" ? skinCategories : radiologyCategories;
  const [form, setForm] = useState({ title: "", diagnosis: "", category: "", key_features: "", description: "" });
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setForm({ title: "", diagnosis: "", category: "", key_features: "", description: "" });
    setFile(null);
    setPreview(null);
  };

  const handleSave = async () => {
    if (!form.title || !form.diagnosis) return;
    setLoading(true);
    try {
      let image_url = "";
      if (file) {
        const res = await base44.integrations.Core.UploadFile({ file });
        image_url = res.file_url;
      }

      const entityName = type === "ecg" ? "ECGCase" : type === "skin" ? "SkinCase" : "RadiologyCase";
      await base44.entities[entityName].create({
        ...form,
        category: form.category || "other",
        image_url,
      });

      reset();
      onOpenChange(false);
      onSaved();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>
            {type === "ecg" ? "הוסף דפוס ECG למאגר" : type === "skin" ? "הוסף מחלת עור למאגר" : "הוסף ממצא רדיולוגי למאגר"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>שם הדפוס / המחלה *</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder={type === "ecg" ? "לדוגמה: Atrial Fibrillation" : type === "skin" ? "לדוגמה: Melanoma" : "לדוגמה: Pneumothorax"}
              className="rounded-xl"
            />
          </div>

          <div className="space-y-1.5">
            <Label>אבחנה רשמית *</Label>
            <Input
              value={form.diagnosis}
              onChange={(e) => setForm({ ...form, diagnosis: e.target.value })}
              placeholder="אבחנה רשמית"
              className="rounded-xl"
            />
          </div>

          <div className="space-y-1.5">
            <Label>קטגוריה</Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="בחר קטגוריה" /></SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>מאפיינים מרכזיים</Label>
            <Textarea
              value={form.key_features}
              onChange={(e) => setForm({ ...form, key_features: e.target.value })}
              placeholder={type === "ecg" ? "המאפיינים העיקריים בתרשים ה-ECG..." : type === "skin" ? "המאפיינים הוויזואליים העיקריים..." : "המאפיינים הרדיולוגיים העיקריים..."}
              className="rounded-xl min-h-[70px]"
            />
          </div>

          <div className="space-y-1.5">
            <Label>תיאור קליני מפורט</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="תיאור קליני מלא — כולל קריטריונים, אבחנה מבדלת, טיפול..."
              className="rounded-xl min-h-[120px]"
            />
          </div>

          <div className="space-y-1.5">
            <Label>תמונת ייחוס (אופציונלי)</Label>
            <ImageUploader
              onFileSelect={(f) => { setFile(f); setPreview(URL.createObjectURL(f)); }}
              preview={preview}
              onClear={() => { setFile(null); setPreview(null); }}
              label="העלה תמונת ייחוס"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">ביטול</Button>
          <Button onClick={handleSave} disabled={loading || !form.title || !form.diagnosis} className="rounded-xl">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "שמור במאגר"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}