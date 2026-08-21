import React, { useRef, useState, useMemo, useEffect } from "react";
import { Upload, X, Plus, Camera } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export default function ImageUploader({ files, onFilesChange, label, hint, imageUrls = [], onImageUrlsChange }) {
  const { t } = useI18n();
  const inputRef = useRef(null);
  const cameraRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  const filePreviews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => {
    return () => filePreviews.forEach((url) => URL.revokeObjectURL(url));
  }, [filePreviews]);

  const allPreviews = [...filePreviews, ...(imageUrls || [])];

  const addFiles = (fileList) => {
    const valid = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    if (valid.length === 0) return;
    onFilesChange([...files, ...valid]);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  };

  const handleChange = (e) => {
    addFiles(e.target.files);
    e.target.value = "";
  };

  const removeFile = (idx) => {
    if (idx < files.length) {
      onFilesChange(files.filter((_, i) => i !== idx));
    } else {
      const urlIdx = idx - files.length;
      onImageUrlsChange?.((imageUrls || []).filter((_, i) => i !== urlIdx));
    }
  };

  return (
    <div className="w-full space-y-3">
      {allPreviews.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {allPreviews.map((url, idx) => (
            <div key={idx} className="relative rounded-lg overflow-hidden border border-slate-200 bg-slate-50 aspect-square">
              <img src={url} alt={t("uploader.image_alt", { n: idx + 1 })} className="w-full h-full object-cover" />
              {idx === 0 && (
                <span className="absolute top-1 right-1 bg-primary text-white text-[9px] font-bold px-1.5 py-0.5 rounded">{t("uploader.primary")}</span>
              )}
              <button
                onClick={() => removeFile(idx)}
                className="absolute top-1 left-1 bg-white/90 rounded-full p-1 shadow hover:bg-red-50 transition-colors"
              >
                <X className="w-3 h-3 text-red-500" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`rounded-xl border-2 border-dashed p-6 text-center transition-all duration-300 ${
          dragOver ? "border-primary bg-primary/5 scale-[1.01]" : "border-slate-200"
        }`}
      >
        <div className="flex flex-col items-center gap-2 mb-4">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            {allPreviews.length > 0 ? <Plus className="w-5 h-5 text-primary" /> : <Upload className="w-6 h-6 text-primary" />}
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              {allPreviews.length > 0 ? t("uploader.add_more") : label || t("uploader.upload_default")}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{hint || t("uploader.hint_default")}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex items-center justify-center gap-2 h-11 rounded-lg bg-primary text-primary-foreground text-sm font-semibold shadow-sm hover:bg-primary/90 transition-colors"
          >
            <Upload className="w-4 h-4" />
            {t("uploader.upload_btn")}
          </button>
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            className="flex items-center justify-center gap-2 h-11 rounded-lg bg-white border border-slate-200 text-foreground text-sm font-semibold shadow-sm hover:bg-slate-50 transition-colors"
          >
            <Camera className="w-4 h-4 text-primary" />
            {t("uploader.camera_btn")}
          </button>
        </div>
      </div>
      <input ref={inputRef} type="file" accept="image/*" multiple onChange={handleChange} className="hidden" />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handleChange} className="hidden" />
    </div>
  );
}