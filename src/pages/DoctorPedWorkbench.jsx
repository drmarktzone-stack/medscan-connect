import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Stethoscope, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import DisclaimerBanner from "@/components/DisclaimerBanner";
import ClinicHeader from "@/components/clinic/ClinicHeader";
import PatientStrip from "@/components/doctorped/PatientStrip";
import EngineResultPanel from "@/components/doctorped/EngineResultPanel";
import PrintDraftButton from "@/components/clinic/PrintDraftButton";
import { useI18n } from "@/lib/i18n";
import { usePatientSession } from "@/lib/doctorped/patientSession";
import { runDoctorPedAI, listToolboxModules } from "@/lib/medscan/doctorped/index.js";
import { persistDoctorPedEncounter } from "@/lib/supabase/encounters.js";

export default function DoctorPedWorkbench() {
  const { t, lang } = useI18n();
  const { session, patch, patchFeature, patient, findings } = usePatientSession();
  const [proceed, setProceed] = useState(false);
  const [answers, setAnswers] = useState({});
  const [pupils, setPupils] = useState("");
  const [rrFlag, setRrFlag] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [saveNote, setSaveNote] = useState(null);
  const toolbox = useMemo(() => listToolboxModules(), []);

  const run = (extra = {}) => {
    setLoading(true);
    setError(null);
    try {
      const features = {
        ...session.features,
        vision_tested: session.features.vision_tested === true,
        hearing_tested: session.features.hearing_tested === true,
        gluten_containing_diet: session.features.gluten_containing_diet === true,
        gluten_free_diet: session.features.gluten_free_diet === true,
        growth_plotted: session.features.growth_plotted === true,
        ...extra.features,
      };
      const next = runDoctorPedAI({
        persona: "clinician",
        integrationMode: "unified",
        patient,
        presentation: session.presentation,
        findings: extra.findings ?? findings,
        features,
        answers: { ...answers, ...extra.answers },
        vitals: {
          gcs: session.gcs !== "" ? Number(session.gcs) : undefined,
          pupils: pupils || undefined,
          rr_flag: rrFlag || undefined,
        },
        gcs: session.gcs !== "" ? Number(session.gcs) : undefined,
        father_cm: session.fatherCm !== "" ? Number(session.fatherCm) : undefined,
        mother_cm: session.motherCm !== "" ? Number(session.motherCm) : undefined,
        proceed,
        locale: lang,
        mode: "development",
      });
      setResult(next);
      if (next?.ok && !next.awaiting_anamnesis) {
        persistDoctorPedEncounter({ result: next, locale: lang }).then((saved) => {
          setSaveNote(saved?.backend === "supabase" ? t("dp.save_ok") : t("dp.save_local"));
        }).catch(() => setSaveNote(t("dp.save_local")));
      }
    } catch (e) {
      setError(e.message || t("dp.error"));
    } finally {
      setLoading(false);
    }
  };

  const urgencyStyle = result?.emergency
    ? "bg-red-600 text-white"
    : result?.triage?.urgency === "home_care"
      ? "bg-emerald-50 border border-emerald-200"
      : "bg-amber-50 border border-amber-200";

  return (
    <div className="clinic-page">
      <ClinicHeader title={t("dp.workbench_title")} icon={Stethoscope} tone="clinic" />
      <div className="clinic-wrap py-6 grid lg:grid-cols-[minmax(0,1fr)_300px] gap-5">
        <div className="space-y-5">
          <p className="text-sm text-slate-600 leading-relaxed clinic-card p-4">{t("dp.workbench_intro")}</p>
          <div>
            <p className="clinic-label">{t("dp.patient_strip")}</p>
            <PatientStrip />
          </div>
          <div className="clinic-card p-4 space-y-3">
            <label className="clinic-label">{t("dp.presentation")}</label>
            <textarea className="w-full min-h-[80px] rounded-xl border p-3 text-sm" placeholder={t("dp.presentation")} value={session.presentation} onChange={(e) => patch({ presentation: e.target.value })} />
            <label className="clinic-label">{t("dp.findings")}</label>
            <textarea className="w-full min-h-[72px] rounded-xl border p-3 text-sm" placeholder={t("dp.findings")} value={session.findingsText} onChange={(e) => patch({ findingsText: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder={t("dp.pupils")} value={pupils} onChange={(e) => setPupils(e.target.value)} />
              <Input placeholder={t("dp.rr")} value={rrFlag} onChange={(e) => setRrFlag(e.target.value)} />
              <Input type="number" placeholder={t("dp.father")} value={session.fatherCm} onChange={(e) => patch({ fatherCm: e.target.value })} />
              <Input type="number" placeholder={t("dp.mother")} value={session.motherCm} onChange={(e) => patch({ motherCm: e.target.value })} />
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-slate-600">
              {["vision_tested", "hearing_tested", "gluten_containing_diet", "growth_plotted"].map((k) => (
                <label key={k} className="flex items-center gap-1">
                  <input type="checkbox" checked={session.features[k] === true} onChange={(e) => patchFeature(k, e.target.checked)} />
                  {t(`dp.feat.${k}`)}
                </label>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={proceed} onChange={(e) => setProceed(e.target.checked)} />
              {t("dp.proceed")}
            </label>
            <Button className="w-full h-12 font-bold rounded-xl" disabled={loading || !session.presentation.trim()} onClick={() => run()}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : t("dp.run")}
            </Button>
          </div>

          {error && <p className="text-sm text-red-700">{error}</p>}
          {saveNote && <p className="text-[11px] text-slate-500">{saveNote}</p>}

          {result?.awaiting_anamnesis && (
            <div className="bg-amber-50 border border-amber-300 rounded-2xl p-5 space-y-3">
              <p className="text-sm font-bold">{t("dp.anamnesis")}</p>
              {(result.anamnesis?.questions ?? []).map((q) => (
                <div key={q.id} className="space-y-1 clinic-card p-3">
                  <p className="text-sm text-amber-950">{q.question_he}</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant={answers[q.need] === true ? "default" : "outline"} onClick={() => setAnswers((a) => ({ ...a, [q.need]: true }))}>{t("dp.yes")}</Button>
                    <Button size="sm" variant={answers[q.need] === false ? "default" : "outline"} onClick={() => setAnswers((a) => ({ ...a, [q.need]: false }))}>{t("dp.no")}</Button>
                  </div>
                </div>
              ))}
              <Button className="w-full" onClick={() => run({ answers })}>{t("dp.run")}</Button>
            </div>
          )}

          {result?.triage && (
            <div className={`rounded-2xl p-4 ${urgencyStyle}`}>
              <p className="text-sm font-extrabold flex items-center gap-2">
                {result.emergency && <AlertTriangle className="w-4 h-4" />}
                {t("dp.triage")}: {result.triage.urgency}
              </p>
            </div>
          )}

          {result?.triggered_modules?.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {result.triggered_modules.map((id) => {
                const mod = toolbox.find((m) => m.id === id);
                return (
                  <Link key={id} to={mod?.route || "/doctorped"} className="text-xs px-3 py-1.5 rounded-full bg-cyan-50 border border-cyan-200 font-medium">
                    {mod?.title_he || id}
                  </Link>
                );
              })}
            </div>
          )}

          {result && !result.awaiting_anamnesis && (
            <div id="clinic-draft-print" className="space-y-4">
              <EngineResultPanel result={result} />
              <PrintDraftButton />
            </div>
          )}

          {result?.referral_gate && Object.keys(result.referral_gate).length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-1">
              <p className="text-sm font-semibold">{t("dp.referrals")}</p>
              {Object.entries(result.referral_gate).map(([k, v]) => (
                <p key={k} className="text-xs">{k}: {v.allowed ? t("dp.refer_ok") : v.message_he}</p>
              ))}
              <Link to="/referrals" className="text-xs underline font-semibold">{t("home.referrals_title")}</Link>
            </div>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 self-start no-print">
          <div className="clinic-card p-4">
            <p className="text-sm font-bold mb-2">{t("dp.toolbox")}</p>
            <div className="grid grid-cols-1 gap-1.5 max-h-[60vh] overflow-auto">
              {toolbox.map((m) => (
                <Link key={m.id} to={m.route} className="text-xs border rounded-lg p-2 hover:bg-cyan-50 hover:border-cyan-200">
                  {m.title_he || t(m.i18n_key)}
                </Link>
              ))}
            </div>
          </div>
          <DisclaimerBanner />
        </aside>
      </div>
    </div>
  );
}
