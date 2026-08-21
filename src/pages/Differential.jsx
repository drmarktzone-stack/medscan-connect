import React, { useState } from "react";
import { ListChecks, Loader2, ShieldCheck, AlertTriangle, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import GroundedInterpretation from "@/components/GroundedInterpretation";
import DisclaimerBanner from "@/components/DisclaimerBanner";
import ClinicHeader from "@/components/clinic/ClinicHeader";
import { runDifferentialBuilder } from "@/lib/medscan/engines/differentialBuilder";

const emptyLab = () => ({ analyte: "", value: "", unit: "", ref_low: "", ref_high: "" });
const splitList = (s) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);

export default function Differential() {
  const [ageValue, setAgeValue] = useState("");
  const [ageUnit, setAgeUnit] = useState("years");
  const [sex, setSex] = useState("");
  const [findingsText, setFindingsText] = useState("");
  const [presentation, setPresentation] = useState("");
  const [labs, setLabs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const updateLab = (i, f, v) =>
    setLabs((r) => r.map((row, idx) => (idx === i ? { ...row, [f]: v } : row)));

  const canRun = ageValue !== "" && findingsText.trim();

  const handleRun = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const patient = {
        [ageUnit === "days" ? "age_days" : ageUnit === "months" ? "age_months" : "age_years"]:
          Number(ageValue),
        sex: sex || undefined,
      };
      const filledLabs = labs
        .filter((l) => l.analyte.trim() && l.value !== "")
        .map((l) => ({
          analyte: l.analyte.trim(),
          value: Number(l.value),
          unit: l.unit.trim() || undefined,
          ref_low: l.ref_low !== "" ? Number(l.ref_low) : undefined,
          ref_high: l.ref_high !== "" ? Number(l.ref_high) : undefined,
        }));

      setResult(await runDifferentialBuilder({
        patient,
        findings: splitList(findingsText),
        labs: filledLabs,
        presentation: presentation.trim() || null,
      }));
    } catch (e) {
      console.error(e);
      setError(e.message || "אירעה שגיאה בבניית האבחנה המבדלת.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="clinic-page">
      <ClinicHeader title="אבחנה מבדלת" icon={ListChecks} tone="tool" />

      <div className="max-w-lg mx-auto px-5 py-6 space-y-5">
        <p className="text-xs text-slate-500 leading-relaxed bg-slate-50 border border-slate-200 rounded-xl p-3">
          הרשימה ממוינת לפי סבירות — <strong>אבל מצבים מסכני-חיים תמיד בראש</strong>,
          גם כשסבירותם נמוכה. הסימון נקבע מהידע המאומת ולא משיקול דעת המנוע.
        </p>

        <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3">
          <h3 className="text-sm font-bold">פרטי המטופל</h3>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[11px] font-medium text-slate-500 block mb-1">
                גיל <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                <Input type="number" inputMode="numeric" value={ageValue}
                  onChange={(e) => setAgeValue(e.target.value)} className="flex-1" />
                <select value={ageUnit} onChange={(e) => setAgeUnit(e.target.value)}
                  className="rounded-md border border-slate-200 text-sm px-2 bg-white">
                  <option value="years">שנים</option>
                  <option value="months">חודשים</option>
                  <option value="days">ימים</option>
                </select>
              </div>
            </div>
            <div className="w-24">
              <label className="text-[11px] font-medium text-slate-500 block mb-1">מין</label>
              <select value={sex} onChange={(e) => setSex(e.target.value)}
                className="w-full rounded-md border border-slate-200 text-sm px-2 py-2 bg-white">
                <option value="">—</option>
                <option value="male">זכר</option>
                <option value="female">נקבה</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3">
          <div>
            <label className="text-sm font-bold block mb-2">
              ממצאים קליניים <span className="text-red-500">*</span>
            </label>
            <textarea value={findingsText} onChange={(e) => setFindingsText(e.target.value)}
              rows={3} placeholder="חום 5 ימים, פריחה, לימפאדנופתיה צווארית"
              className="w-full rounded-md border border-slate-200 text-sm p-2 resize-none" />
            <p className="text-[10px] text-slate-400 mt-1">מופרדים בפסיק.</p>
          </div>
          <div>
            <label className="text-sm font-bold block mb-2">תיאור קליני חופשי</label>
            <textarea value={presentation} onChange={(e) => setPresentation(e.target.value)}
              rows={2} placeholder="מהלך המחלה, הקשר, רקע"
              className="w-full rounded-md border border-slate-200 text-sm p-2 resize-none" />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold">תוצאות מעבדה (אופציונלי)</h3>
            <button onClick={() => setLabs((l) => [...l, emptyLab()])}
              className="flex items-center gap-1 text-xs text-rose-600 font-medium">
              <Plus className="w-3.5 h-3.5" /> שורה
            </button>
          </div>
          {labs.map((row, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto] gap-2 items-center">
              <div className="grid grid-cols-4 gap-1">
                <Input value={row.analyte} onChange={(e) => updateLab(i, "analyte", e.target.value)}
                  placeholder="מדד" className="text-xs h-9" />
                <Input type="number" value={row.value} onChange={(e) => updateLab(i, "value", e.target.value)}
                  placeholder="ערך" className="text-xs h-9" />
                <Input value={row.unit} onChange={(e) => updateLab(i, "unit", e.target.value)}
                  placeholder="יחידה" className="text-xs h-9" />
                <div className="flex gap-1">
                  <Input type="number" value={row.ref_low} onChange={(e) => updateLab(i, "ref_low", e.target.value)}
                    placeholder="מ" className="text-xs h-9 px-1" />
                  <Input type="number" value={row.ref_high} onChange={(e) => updateLab(i, "ref_high", e.target.value)}
                    placeholder="עד" className="text-xs h-9 px-1" />
                </div>
              </div>
              <button onClick={() => setLabs((l) => l.filter((_, idx) => idx !== i))}
                className="text-slate-300 hover:text-red-500">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          {labs.length === 0 && (
            <p className="text-[11px] text-slate-400">ניתן להוסיף תוצאות מעבדה לחידוד האבחנה.</p>
          )}
        </div>

        <Button onClick={handleRun} disabled={!canRun || loading}
          className="w-full h-12 rounded-xl text-sm font-semibold bg-rose-600 hover:bg-rose-700 shadow-md shadow-rose-500/20">
          {loading ? (
            <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> בונה…</span>
          ) : "בנה אבחנה מבדלת"}
        </Button>

        {error && <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>}

        {result?.status === "input_error" && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <p className="text-sm font-semibold text-amber-800">לא ניתן לבנות</p>
            </div>
            <p className="text-xs text-amber-900">{result.message_he}</p>
          </div>
        )}

        {result && result.status !== "input_error" && (
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <ShieldCheck className="w-5 h-5 text-rose-600" />
              <div>
                <h3 className="font-bold text-sm">אבחנה מבדלת מעוגנת</h3>
                <p className="text-[11px] text-slate-500">מסכני-חיים בראש, בלי קשר לסבירות</p>
              </div>
            </div>

            {result.must_not_miss_enforced?.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <h4 className="text-[11px] font-bold text-red-800 mb-1">
                  סומנו אוטומטית כ"אסור לפספס"
                </h4>
                <ul className="space-y-0.5">
                  {result.must_not_miss_enforced.map((e, i) => (
                    <li key={i} className="text-[11px] text-red-900">· {e.direction_he}</li>
                  ))}
                </ul>
                <p className="text-[10px] text-red-700 mt-1 leading-relaxed">
                  הידע המאומת מגדיר מצבים אלה כמסכני-חיים. הסימון אינו תלוי בשיקול דעת מנוע הנימוק.
                </p>
              </div>
            )}

            {result.uncovered_red_items?.length > 0 && (
              <div className="bg-amber-50 border border-amber-300 rounded-lg p-3">
                <h4 className="text-[11px] font-bold text-amber-800 mb-1">מצבים מסכני-חיים שלא נדונו</h4>
                <ul className="space-y-0.5">
                  {result.uncovered_red_items.map((r, i) => (
                    <li key={i} className="text-[11px] text-amber-900">· {r.label_he}</li>
                  ))}
                </ul>
                <p className="text-[10px] text-amber-700 mt-1">
                  הופעלו ע"י המנוע ואינם ברשימה. יש לשקול אותם במפורש.
                </p>
              </div>
            )}

            <GroundedInterpretation data={result} />
          </div>
        )}

        <DisclaimerBanner />
      </div>
    </div>
  );
}
