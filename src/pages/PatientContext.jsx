import React, { useState } from "react";
import { UserCog, Loader2, ShieldCheck, AlertTriangle, Pill, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import GroundedInterpretation from "@/components/GroundedInterpretation";
import DisclaimerBanner from "@/components/DisclaimerBanner";
import ClinicHeader from "@/components/clinic/ClinicHeader";
import { runPatientContext } from "@/lib/medscan/engines/patientContext";

const splitList = (s) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);

const SEVERITY_STYLE = {
  contraindicated: "bg-red-100 text-red-800 border-red-300",
  major: "bg-red-50 text-red-700 border-red-200",
  moderate: "bg-amber-50 text-amber-700 border-amber-200",
  minor: "bg-slate-50 text-slate-600 border-slate-200",
};

export default function PatientContext() {
  const [ageValue, setAgeValue] = useState("");
  const [ageUnit, setAgeUnit] = useState("years");
  const [sex, setSex] = useState("");
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [conditions, setConditions] = useState("");
  const [medications, setMedications] = useState("");
  const [allergies, setAllergies] = useState("");
  const [events, setEvents] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const canRun = ageValue !== "" && (conditions.trim() || medications.trim() || events.trim());

  const handleRun = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const patient = {
        [ageUnit === "days" ? "age_days" : ageUnit === "months" ? "age_months" : "age_years"]:
          Number(ageValue),
        sex: sex || undefined,
        weight_kg: weight ? Number(weight) : undefined,
        height_cm: height ? Number(height) : undefined,
        chronic_conditions: splitList(conditions),
        medications: splitList(medications),
        allergies: splitList(allergies),
      };
      setResult(await runPatientContext({ patient, recentEvents: splitList(events) }));
    } catch (e) {
      console.error(e);
      setError(e.message || "אירעה שגיאה בהרצת הניתוח.");
    } finally {
      setLoading(false);
    }
  };

  const ix = result?.interactions;
  const noSource = ix?.status === "no_source";

  return (
    <div className="clinic-page">
      <ClinicHeader title="הקשר מטופל" icon={UserCog} tone="tool" />

      <div className="max-w-lg mx-auto px-5 py-6 space-y-5">
        <p className="text-xs text-slate-500 leading-relaxed bg-slate-50 border border-slate-200 rounded-xl p-3">
          המנוע פועל על <strong>רקע</strong> — מחלות כרוניות, תרופות ואירועים אחרונים.
          מצב רקע שלא הפעיל כלל מאומת יוצג לך במפורש כפער ידע, ולא ייבלע.
        </p>

        <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3">
          <h3 className="text-sm font-bold">פרטי המטופל</h3>
          <div>
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
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[11px] font-medium text-slate-500 block mb-1">מין</label>
              <select value={sex} onChange={(e) => setSex(e.target.value)}
                className="w-full rounded-md border border-slate-200 text-sm px-2 py-2 bg-white">
                <option value="">—</option>
                <option value="male">זכר</option>
                <option value="female">נקבה</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-500 block mb-1">משקל (ק"ג)</label>
              <Input type="number" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} />
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-500 block mb-1">גובה (ס"מ)</label>
              <Input type="number" inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3">
          <h3 className="text-sm font-bold">רקע קליני</h3>
          {[
            { label: "מחלות רקע / מצבים כרוניים", value: conditions, set: setConditions, ph: "אספלניה, סוכרת T1, אסתמה" },
            { label: "תרופות קבועות", value: medications, set: setMedications, ph: "פרדניזון, אינסולין" },
            { label: "אלרגיות", value: allergies, set: setAllergies, ph: "פניצילין" },
            { label: "אירועים אחרונים", value: events, set: setEvents, ph: "חום 39, הקאות" },
          ].map(({ label, value, set, ph }) => (
            <div key={label}>
              <label className="text-[11px] font-medium text-slate-500 block mb-1">{label}</label>
              <textarea
                value={value} onChange={(e) => set(e.target.value)} rows={2} placeholder={ph}
                className="w-full rounded-md border border-slate-200 text-sm p-2 resize-none"
              />
            </div>
          ))}
          <p className="text-[10px] text-slate-400">מופרדים בפסיק.</p>
        </div>

        <Button onClick={handleRun} disabled={!canRun || loading}
          className="w-full h-12 rounded-xl text-sm font-semibold bg-violet-600 hover:bg-violet-700 shadow-md shadow-violet-500/20">
          {loading ? (
            <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> מנתח…</span>
          ) : "נתח הקשר"}
        </Button>

        {error && <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>}

        {result?.status === "input_error" && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <p className="text-sm font-semibold text-amber-800">לא ניתן לנתח</p>
            </div>
            <p className="text-xs text-amber-900">{result.message_he}</p>
          </div>
        )}

        {result && result.status !== "input_error" && (
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <ShieldCheck className="w-5 h-5 text-violet-600" />
              <div>
                <h3 className="font-bold text-sm">ניתוח הקשר מעוגן</h3>
                <p className="text-[11px] text-slate-500">עבר אימות מול בסיס הידע המאומת</p>
              </div>
            </div>

            {/* אינטראקציות — הבחנה חדה בין "לא נמצאו" ל"לא נבדק" */}
            {ix && (
              <div className={`rounded-xl border p-3 ${noSource ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"}`}>
                <div className="flex items-center gap-2 mb-2">
                  {noSource ? <ShieldOff className="w-4 h-4 text-amber-600" /> : <Pill className="w-4 h-4 text-slate-500" />}
                  <h4 className="text-sm font-bold text-slate-800">
                    {noSource ? "בדיקת אינטראקציות לא בוצעה" : "אינטראקציות תרופתיות"}
                  </h4>
                </div>
                <p className={`text-[11px] leading-relaxed ${noSource ? "text-amber-900" : "text-slate-600"}`}>
                  {ix.note_he}
                </p>

                {ix.matched?.length > 0 && (
                  <div className="space-y-2 mt-3">
                    {ix.matched.map((m, i) => (
                      <div key={i} className={`rounded-lg border p-2 ${SEVERITY_STYLE[m.severity]}`}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/60">
                            {m.severity_he}
                          </span>
                          <span className="text-xs font-semibold">{m.involved.join(" + ")}</span>
                        </div>
                        <p className="text-[11px] mt-1">{m.effect_he}</p>
                        {m.management_he && (
                          <p className="text-[11px] font-medium mt-0.5">← {m.management_he}</p>
                        )}
                        {m.source && (
                          <p className="text-[10px] opacity-70 mt-0.5">מקור: {m.source}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {result.uncovered_background?.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <h4 className="text-[11px] font-bold text-slate-600 mb-1">רקע ללא ידע מאומת במערכת</h4>
                <ul className="space-y-0.5">
                  {result.uncovered_background.map((b, i) => (
                    <li key={i} className="text-[11px] text-slate-600">· {b}</li>
                  ))}
                </ul>
                <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
                  אלה לא הפעילו שום כלל. <strong>אין עליהם ידע במערכת — וזה אינו אומר שאין בהם סיכון.</strong>
                </p>
              </div>
            )}

            {result.calculator_refusals?.length > 0 && (
              <div className="bg-slate-50 rounded-lg p-3">
                <h4 className="text-[11px] font-bold text-slate-600 mb-1">מחשבונים שסירבו</h4>
                <ul className="space-y-1">
                  {result.calculator_refusals.map((r, i) => (
                    <li key={i} className="text-[11px] text-slate-600 leading-snug">· {r.message_he}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* בדיקות, מעקב והתראות — ייחודיים למנוע הזה */}
            {result.recommended_tests?.length > 0 && (
              <div>
                <h4 className="text-xs font-bold text-slate-700 mb-2">בדיקות מומלצות</h4>
                <ul className="space-y-1.5">
                  {result.recommended_tests.map((t, i) => (
                    <li key={i} className="text-xs text-slate-700 leading-relaxed">
                      · <strong>{t.test_he}</strong>
                      {t.reason_he && <span className="text-slate-500"> — {t.reason_he}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.monitoring?.length > 0 && (
              <div>
                <h4 className="text-xs font-bold text-slate-700 mb-2">מעקב מומלץ</h4>
                <ul className="space-y-1.5">
                  {result.monitoring.map((m, i) => (
                    <li key={i} className="text-xs text-slate-700 leading-relaxed">
                      · <strong>{m.what_he}</strong>
                      {m.interval_he && <span className="text-indigo-600"> ({m.interval_he})</span>}
                      {m.reason_he && <span className="text-slate-500"> — {m.reason_he}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.dynamic_recommendations?.length > 0 && (
              <div>
                <h4 className="text-xs font-bold text-slate-700 mb-2">המלצות תלויות-הקשר</h4>
                <ul className="space-y-2">
                  {result.dynamic_recommendations.map((r, i) => (
                    <li key={i} className="text-xs bg-slate-50 rounded-lg p-2 leading-relaxed">
                      <span className="font-semibold text-slate-600">אם {r.trigger_he}</span>
                      <span className="block text-slate-700 mt-0.5">← {r.recommendation_he}</span>
                    </li>
                  ))}
                </ul>
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
