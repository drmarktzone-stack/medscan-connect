import React, { useState, useEffect, useRef } from "react";
import { Ruler, Loader2, Info, GitCompareArrows, AlertTriangle, Upload } from "lucide-react";
import { measureLesionFromImage } from "@/lib/skinMorphometry";
import { deterministicLesionDelta } from "@/lib/skinCompare";

/**
 * מורפומטריה דטרמיניסטית של נגע (ABCDE בקוד) + מעקב-שינוי לאורך זמן.
 *
 * עיקרון אנטי-הזיה: כל המדדים נמדדים בקוד (Otsu + מסכה), לא מנוחשים ע"י המודל.
 * ללא סמן קנה-מידה — יחסי בלבד ומוצהר. אם הסגמנטציה/CORS נכשלים — הודעה כנה,
 * לא מספר מנוחש.
 *
 * מעקב-שינוי (skinCompare): אם המשתמש מעלה תמונה קודמת של אותו נגע, המערכת
 * מודדת את שתיהן ומחשבת דלתא דטרמיניסטית (קוטר/אסימטריה/גבול/צבע). שינוי
 * מהותי → העלאת דחיפות. "שינוי הוא לב האבחון".
 */
export default function LesionMorphometry({ imageUrl }) {
  const [state, setState] = useState({ loading: true, data: null, failed: null });
  const [prior, setPrior] = useState({ url: null, data: null, loading: false, failed: null });
  const [fieldMm, setFieldMm] = useState("");
  const fileRef = useRef(null);

  // מדידת התמונה הנוכחית
  useEffect(() => {
    if (!imageUrl) return;
    let alive = true;
    setState({ loading: true, data: null, failed: null });
    measureFromUrl(imageUrl, true).then((res) => {
      if (!alive) return;
      if (res?.ok) setState({ loading: false, data: res, failed: null });
      else setState({ loading: false, data: null, failed: res?.reason || "unknown" });
    });
    return () => { alive = false; };
  }, [imageUrl]);

  // ניקוי object URL של התמונה הקודמת
  useEffect(() => () => { if (prior.url) URL.revokeObjectURL(prior.url); }, [prior.url]);

  async function measureFromUrl(url, crossOrigin) {
    return new Promise((resolve) => {
      const img = new Image();
      if (crossOrigin) img.crossOrigin = "anonymous";
      img.onload = async () => {
        try { resolve(await measureLesionFromImage(img, {})); }
        catch { resolve({ ok: false, reason: "error" }); }
      };
      img.onerror = () => resolve({ ok: false, reason: "load_error" });
      img.src = url;
    });
  }

  async function handlePriorFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPrior({ url, data: null, loading: true, failed: null });
    const res = await measureFromUrl(url, false); // local blob → no CORS taint
    if (res?.ok) setPrior({ url, data: res, loading: false, failed: null });
    else setPrior({ url, data: null, loading: false, failed: res?.reason || "unknown" });
  }

  if (!imageUrl) return null;

  const REASON_HE = {
    segmentation_unreliable: "לא ניתן לבודד את הנגע מהעור באמינות (רקע/תאורה) — לא מוצג מדד מנוחש.",
    tainted_canvas: "לא ניתן לגשת לפיקסלים של התמונה (הגבלת CORS) — מדידה בצד-לקוח לא זמינה.",
    load_error: "טעינת התמונה למדידה נכשלה.",
    no_pixels: "התמונה ריקה/לא נטענה.",
    error: "אירעה שגיאה במדידה.",
    unknown: "המדידה לא הושלמה.",
  };

  const fieldMmNum = Number(fieldMm);
  const realDiameterMm =
    state.data && Number.isFinite(fieldMmNum) && fieldMmNum > 0 && state.data.image_width_px
      ? Math.round((state.data.diameter_px * fieldMmNum / state.data.image_width_px) * 10) / 10
      : null;

  const delta = state.data && prior.data ? deterministicLesionDelta(state.data, prior.data) : null;

  return (
    <div className="bg-white rounded-xl border border-pink-200 p-4">
      <div className="flex items-center gap-2 mb-1">
        <Ruler className="w-4 h-4 text-pink-500" />
        <h4 className="text-sm font-bold">מורפומטריה (ABCDE בקוד)</h4>
      </div>
      <p className="text-[10px] text-muted-foreground mb-3 leading-relaxed">
        נמדד ישירות מהתמונה בקוד, לא ע"י המודל. מדד תומך בלבד — אינו מאבחן.
      </p>

      {state.loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
          <Loader2 className="w-4 h-4 animate-spin" /> מודד…
        </div>
      ) : state.data ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Metric label={realDiameterMm != null ? "קוטר (ממ)" : "קוטר (יחסי)"} value={realDiameterMm != null ? (realDiameterMm + " ממ") : state.data.diameter_mm != null ? `${state.data.diameter_mm} מ"מ` : `${state.data.diameter_px}px`} />
            <Metric label="אסימטריה (A)" value={state.data.asymmetry_index != null ? state.data.asymmetry_index : "—"} hint="0=סימטרי · 1=א-סימטרי" />
            <Metric label="חוסר-סדירות גבול (B)" value={state.data.border_irregularity != null ? state.data.border_irregularity : "—"} hint="1.0=עיגול · גבוה=משונן" />
            <Metric label="גווני צבע (C)" value={state.data.color_clusters} hint="ריבוי גוונים → דגל" />
          </div>
          <div className="mt-2 bg-slate-50 border border-slate-200 rounded-lg p-2.5">
            <label className="text-[10px] font-semibold text-slate-600 flex items-center gap-1">
              <Info className="w-3 h-3 text-slate-400" /> סמן קנה-מידה (אופציונלי)
            </label>
            <div className="flex items-center gap-2 mt-1.5">
              <input
                type="number" inputMode="decimal" min="1" value={fieldMm}
                onChange={(e) => setFieldMm(e.target.value)}
                placeholder='רוחב התמונה במציאות (מילימטר)'
                className="flex-1 h-8 rounded-md border border-slate-300 px-2 text-[12px]"
              />
              {realDiameterMm != null && (
                <span className="text-[12px] font-bold text-pink-600 whitespace-nowrap">≈ {realDiameterMm} ממ</span>
              )}
            </div>
            <p className="text-[9px] text-muted-foreground mt-1 leading-relaxed">
              {realDiameterMm != null
                ? 'קוטר אמיתי חושב מרוחב-השדה שהזנת (לא נוחש). אמת מול סרגל בתמונה.'
                : 'אין סמן קנה-מידה — הקוטר יחסי. אם צילמת עם סרגל/מדבקה, הזן כמה מילימטר רוחב כל התמונה מכסה → תקבל קוטר אמיתי.'}
            </p>
          </div>

          {/* מעקב-שינוי לאורך זמן */}
          <div className="mt-3 pt-3 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1.5">
                <GitCompareArrows className="w-3.5 h-3.5 text-pink-500" /> מעקב-שינוי (תמונה קודמת)
              </span>
              <button
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1 text-[11px] font-semibold text-pink-600 bg-pink-50 border border-pink-200 rounded-lg px-2 py-1"
              >
                <Upload className="w-3 h-3" /> {prior.url ? "החלף" : "העלה"}
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePriorFile} />
            </div>
            <p className="text-[9px] text-muted-foreground mt-1 leading-relaxed">
              העלה צילום קודם של <strong>אותו נגע</strong> — המערכת תמדוד את שתיהן ותשווה דטרמיניסטית. שינוי מהותי מעלה דחיפות.
            </p>

            {prior.loading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                <Loader2 className="w-4 h-4 animate-spin" /> מודד תמונה קודמת…
              </div>
            )}
            {prior.failed && (
              <p className="text-[11px] text-slate-600 mt-2">{REASON_HE[prior.failed] || REASON_HE.unknown}</p>
            )}

            {delta && (
              delta.comparable ? (
                <div className={`mt-2 rounded-lg p-2.5 ${delta.significant_change ? "bg-red-50 border border-red-200" : "bg-green-50 border border-green-200"}`}>
                  <p className={`text-[12px] font-bold flex items-center gap-1.5 ${delta.significant_change ? "text-red-700" : "text-green-700"}`}>
                    {delta.significant_change && <AlertTriangle className="w-3.5 h-3.5" />}
                    {delta.significant_change ? "שינוי מהותי מדיד" : "אין שינוי מהותי מדיד"}
                    {delta.forced_urgency && <span className="text-[9px] bg-red-600 text-white px-1.5 py-0.5 rounded">{delta.forced_urgency}</span>}
                  </p>
                  {delta.changes?.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {delta.changes.map((c, i) => (
                        <li key={i} className="text-[11px] text-red-700">· {c.detail_he}</li>
                      ))}
                    </ul>
                  )}
                  <p className="text-[10px] text-slate-600 mt-1.5 leading-relaxed">{delta.recommendation_he}</p>
                </div>
              ) : (
                <p className="text-[11px] text-slate-600 mt-2">{delta.reason_he}</p>
              )
            )}
          </div>
        </>
      ) : (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-start gap-2">
          <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-slate-600 leading-relaxed">{REASON_HE[state.failed] || REASON_HE.unknown}</p>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, hint }) {
  return (
    <div className="bg-slate-50 rounded-lg py-2 px-2 text-center">
      <p className="text-lg font-extrabold text-pink-600">{value}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
      {hint && <p className="text-[9px] text-muted-foreground/70 mt-0.5 leading-tight">{hint}</p>}
    </div>
  );
}
