import React, { useState } from "react";
import { useI18n } from "@/lib/i18n";

export default function AnnotatedImage({ imageUrl, findings }) {
  const { t } = useI18n();
  const [loaded, setLoaded] = useState(false);

  if (!imageUrl || !findings || findings.length === 0) return null;

  return (
    <div>
      <h4 className="text-sm font-bold text-foreground mb-3">{t("annotated.title")}</h4>
      <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-50 shadow-sm">
        <div className="relative">
          <img src={imageUrl} alt={t("annotated.alt")} onLoad={() => setLoaded(true)} className="w-full h-auto block" />
          {loaded && findings.map((f, i) => {
            const labelAbove = f.y >= 8;
            return (
              <div
                key={i}
                className="absolute border-2 border-red-500 rounded pointer-events-none"
                style={{ left: `${f.x}%`, top: `${f.y}%`, width: `${f.width}%`, height: `${f.height}%` }}
              >
                <span className={`absolute right-0 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap ${labelAbove ? "top-0 -translate-y-full" : "top-0.5"}`}>
                  {f.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-2 text-center">{t("annotated.count", { n: findings.length })}</p>
    </div>
  );
}