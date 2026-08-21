import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Contrast, RotateCcw, Eye, Layers, AlertTriangle, ZoomIn, ZoomOut, Loader2 } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/lib/i18n";
import {
  loadImageToGray,
  processPipeline,
  grayToImageData,
  buildDensityOverlay,
  histogram,
  PRESETS,
  DEFAULT_SETTINGS,
} from "@/lib/imageProcessing";

/**
 * לשונית "ניגודית" — כלי עיבוד תצוגה לצילום שהועלה.
 *
 * ⚠ תצוגה בלבד. הכלי אינו משנה את הקובץ שהועלה, ואינו משתתף בפענוח —
 * מנוע הפענוח רץ תמיד על התמונה המקורית. כל מה שכאן הוא מיפוי מחדש של
 * ערכי אפור שכבר קיימים בתמונה; לא נוצר מידע חדש.
 */
export default function RadiologyViewer({ src }) {
  const { t } = useI18n();
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const baseRef = useRef(null); // {gray, width, height} — המקור, לעולם לא משתנה

  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [activePreset, setActivePreset] = useState("original");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hist, setHist] = useState(null);

  const set = useCallback((patch) => {
    setSettings((s) => ({ ...s, ...patch }));
    setActivePreset(null);
  }, []);

  // טעינת המקור פעם אחת.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadImageToGray(src)
      .then((base) => {
        if (cancelled) return;
        baseRef.current = base;
        setHist(histogram(base.gray));
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(t("viewer.load_error"));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [src, t]);

  // ציור מחדש בכל שינוי הגדרות. debounce קצר כדי שגרירת סליידר תישאר חלקה.
  useEffect(() => {
    if (loading || error || !baseRef.current) return;
    const handle = setTimeout(() => {
      const { gray, width, height } = baseRef.current;
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");

      if (showOriginal) {
        ctx.putImageData(grayToImageData(gray, width, height), 0, 0);
        return;
      }

      const processed = processPipeline(gray, width, height, settings);
      const imageData = settings.overlayOn
        ? buildDensityOverlay(processed, width, height, {
            low: settings.overlayLow,
            high: settings.overlayHigh,
            opacity: settings.overlayOpacity,
          })
        : grayToImageData(processed, width, height);
      ctx.putImageData(imageData, 0, 0);
    }, 40);
    return () => clearTimeout(handle);
  }, [settings, loading, error, showOriginal]);

  const applyPreset = (preset) => {
    setSettings((s) => ({ ...s, ...preset.settings }));
    setActivePreset(preset.id);
  };

  const reset = () => {
    setSettings(DEFAULT_SETTINGS);
    setActivePreset("original");
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // גרירה להזזה כשמוגדלים.
  const dragRef = useRef(null);
  const onPointerDown = (e) => {
    if (zoom <= 1) return;
    dragRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!dragRef.current) return;
    setPan({ x: e.clientX - dragRef.current.x, y: e.clientY - dragRef.current.y });
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  const histPath = useMemo(() => {
    if (!hist) return null;
    const max = Math.max(...hist);
    if (max === 0) return null;
    // סולם לוגריתמי — אחרת פסגת הרקע השחור מוחקת את כל השאר.
    const lmax = Math.log1p(max);
    return Array.from(hist, (v, i) => `${i},${32 - (Math.log1p(v) / lmax) * 32}`).join(" ");
  }, [hist]);

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* אזהרה — ראשונה, לא בתחתית. */}
      <div className="flex gap-2.5 bg-amber-50 border border-amber-200 rounded-xl p-3">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-[11px] leading-relaxed text-amber-900">
          <p className="font-semibold mb-1">{t("viewer.warning_title")}</p>
          <p>{t("viewer.warning_body")}</p>
        </div>
      </div>

      {/* קנבס */}
      <div
        ref={containerRef}
        className="relative rounded-xl overflow-hidden bg-black border border-slate-200 touch-none"
        style={{ aspectRatio: "4 / 3" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center text-white/70">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full object-contain"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "center",
              cursor: zoom > 1 ? "grab" : "default",
            }}
          />
        )}

        {showOriginal && (
          <span className="absolute top-2 right-2 bg-white/90 text-slate-800 text-[10px] font-bold px-2 py-1 rounded">
            {t("viewer.showing_original")}
          </span>
        )}

        {/* בקרות זום */}
        <div className="absolute bottom-2 left-2 flex gap-1">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(6, z * 1.4))}
            className="w-8 h-8 rounded-lg bg-white/85 hover:bg-white flex items-center justify-center shadow"
            aria-label={t("viewer.zoom_in")}
          >
            <ZoomIn className="w-4 h-4 text-slate-700" />
          </button>
          <button
            type="button"
            onClick={() => {
              setZoom((z) => {
                const next = Math.max(1, z / 1.4);
                if (next === 1) setPan({ x: 0, y: 0 });
                return next;
              });
            }}
            className="w-8 h-8 rounded-lg bg-white/85 hover:bg-white flex items-center justify-center shadow"
            aria-label={t("viewer.zoom_out")}
          >
            <ZoomOut className="w-4 h-4 text-slate-700" />
          </button>
        </div>

        {/* השוואה למקור — החזקה */}
        <button
          type="button"
          onPointerDown={(e) => { e.stopPropagation(); setShowOriginal(true); }}
          onPointerUp={() => setShowOriginal(false)}
          onPointerLeave={() => setShowOriginal(false)}
          className="absolute bottom-2 right-2 flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white/85 hover:bg-white shadow text-[11px] font-semibold text-slate-700"
        >
          <Eye className="w-3.5 h-3.5" />
          {t("viewer.hold_original")}
        </button>
      </div>

      {/* היסטוגרמה */}
      {histPath && (
        <div className="bg-slate-50 border border-slate-100 rounded-lg p-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-semibold text-slate-500">{t("viewer.histogram")}</span>
            <span className="text-[9px] text-slate-400">{t("viewer.histogram_axis")}</span>
          </div>
          <svg viewBox="0 0 255 32" preserveAspectRatio="none" className="w-full h-8">
            <polyline points={histPath} fill="none" stroke="#6366f1" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
      )}

      {/* פריסטים */}
      <div>
        <p className="text-[11px] font-semibold text-slate-500 mb-2">{t("viewer.presets")}</p>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p)}
              className={`px-3 h-8 rounded-lg text-[11px] font-semibold border transition-colors ${
                activePreset === p.id
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-slate-700 border-slate-200 hover:border-indigo-300"
              }`}
            >
              {t(p.labelKey)}
            </button>
          ))}
          <button
            type="button"
            onClick={reset}
            className="px-3 h-8 rounded-lg text-[11px] font-semibold border border-slate-200 bg-white text-slate-500 hover:text-slate-700 flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" />
            {t("viewer.reset")}
          </button>
        </div>
      </div>

      {/* סליידרים */}
      <div className="space-y-3.5 bg-white border border-slate-100 rounded-xl p-4">
        <SliderRow
          label={t("viewer.clahe")}
          hint={t("viewer.clahe_hint")}
          value={settings.clahe}
          min={0} max={6} step={0.25}
          display={settings.clahe === 0 ? t("viewer.off") : settings.clahe.toFixed(2)}
          onChange={(v) => set({ clahe: v })}
        />
        <SliderRow
          label={t("viewer.window")}
          hint={t("viewer.window_hint")}
          value={settings.window}
          min={20} max={255} step={1}
          display={settings.window}
          onChange={(v) => set({ window: v })}
        />
        <SliderRow
          label={t("viewer.level")}
          hint={t("viewer.level_hint")}
          value={settings.level}
          min={0} max={255} step={1}
          display={settings.level}
          onChange={(v) => set({ level: v })}
        />
        <SliderRow
          label={t("viewer.gamma")}
          value={settings.gamma}
          min={0.4} max={2.5} step={0.05}
          display={settings.gamma.toFixed(2)}
          onChange={(v) => set({ gamma: v })}
        />
        <SliderRow
          label={t("viewer.sharpen")}
          hint={t("viewer.sharpen_hint")}
          value={settings.sharpen}
          min={0} max={2} step={0.1}
          display={settings.sharpen === 0 ? t("viewer.off") : settings.sharpen.toFixed(1)}
          onChange={(v) => set({ sharpen: v })}
        />

        <div className="flex items-center justify-between pt-1 border-t border-slate-100">
          <div>
            <p className="text-xs font-semibold text-slate-700">{t("viewer.invert")}</p>
            <p className="text-[10px] text-slate-400">{t("viewer.invert_hint")}</p>
          </div>
          <Switch checked={settings.invert} onCheckedChange={(v) => set({ invert: v })} />
        </div>
      </div>

      {/* מפת צפיפות */}
      <div className="bg-white border border-slate-100 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-500" />
            <div>
              <p className="text-xs font-semibold text-slate-700">{t("viewer.density_map")}</p>
              <p className="text-[10px] text-slate-400">{t("viewer.density_map_sub")}</p>
            </div>
          </div>
          <Switch checked={settings.overlayOn} onCheckedChange={(v) => set({ overlayOn: v })} />
        </div>

        {settings.overlayOn && (
          <>
            <div className="flex gap-2.5 bg-red-50 border border-red-200 rounded-lg p-2.5">
              <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
              <p className="text-[10px] leading-relaxed text-red-900">{t("viewer.density_warning")}</p>
            </div>
            <SliderRow
              label={t("viewer.density_low")}
              value={settings.overlayLow}
              min={0} max={255} step={1}
              display={settings.overlayLow}
              onChange={(v) => set({ overlayLow: Math.min(v, settings.overlayHigh - 1) })}
            />
            <SliderRow
              label={t("viewer.density_high")}
              value={settings.overlayHigh}
              min={0} max={255} step={1}
              display={settings.overlayHigh}
              onChange={(v) => set({ overlayHigh: Math.max(v, settings.overlayLow + 1) })}
            />
            <SliderRow
              label={t("viewer.density_opacity")}
              value={settings.overlayOpacity}
              min={0.1} max={0.9} step={0.05}
              display={`${Math.round(settings.overlayOpacity * 100)}%`}
              onChange={(v) => set({ overlayOpacity: v })}
            />
          </>
        )}
      </div>

      <p className="text-[10px] text-slate-400 leading-relaxed px-1">
        <Contrast className="w-3 h-3 inline-block ml-1 -mt-0.5" />
        {t("viewer.footer_note")}
      </p>
    </div>
  );
}

function SliderRow({ label, hint, value, min, max, step, display, onChange }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <div>
          <span className="text-xs font-semibold text-slate-700">{label}</span>
          {hint && <span className="text-[10px] text-slate-400 mr-1.5">· {hint}</span>}
        </div>
        <span className="text-[11px] font-mono text-slate-500 tabular-nums">{display}</span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v)}
      />
    </div>
  );
}
