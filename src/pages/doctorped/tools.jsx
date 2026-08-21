import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Biohazard, Flame, Baby, Brain, Bone, Dna, Droplets, Waves, Mic, GitBranch, Activity, Pill } from "lucide-react";
import ToolPageShell from "@/components/doctorped/ToolPageShell";
import PatientStrip from "@/components/doctorped/PatientStrip";
import EngineResultPanel from "@/components/doctorped/EngineResultPanel";
import ChipToggle from "@/components/doctorped/ChipToggle";
import { useI18n } from "@/lib/i18n";
import { usePatientSession, splitList } from "@/lib/doctorped/patientSession";
import { runToxicologyEngine, runTraumaEngine, runGrowthImmunizationEngine } from "@/lib/medscan/engines/expertModules.js";
import { runInfantNutritionAndDevelopment } from "@/lib/medscan/engines/infantNutritionAndDevelopment.js";
import { runNeurodevelopmentalEngine } from "@/lib/medscan/engines/neurodevelopmentalEngine.js";
import { runChronicSymptomsEngine } from "@/lib/medscan/engines/chronicSymptomsEngine.js";
import { runSyndromeMatcher, FEATURE_ALIASES as SYN_FEAT } from "@/lib/medscan/engines/syndromeMatcher.js";
import { runGeneticsInterpreter, FEATURE_ALIASES as GEN_FEAT } from "@/lib/medscan/engines/geneticsInterpreter.js";
import { runMetabolicInterpreter } from "@/lib/medscan/engines/metabolicInterpreter.js";
import { runCsfInterpreter } from "@/lib/medscan/engines/csfInterpreter.js";
import { runPediatricUltrasound } from "@/lib/medscan/engines/pediatricUltrasound.js";
import { runEegInterpreter } from "@/lib/medscan/engines/eegInterpreter.js";
import { preprocessAudio } from "@/lib/medscan/audio/audioPreprocess.js";
import {
  evaluateAsdAdhdReferral,
  evaluateCeliacReferral,
  evaluateShortStatureReferral,
  specialistAllowed,
  diagnosticTree,
} from "@/lib/medscan/doctorped/index.js";

const BURN_REGIONS = ["head", "neck", "anterior_trunk", "posterior_trunk", "upper_arm", "forearm", "hand", "buttocks", "genitalia", "thigh", "leg", "foot"];
const MILESTONES = ["social_smile", "head_control", "sits", "stands_or_pulls", "pincer_or_grasp", "babble_or_mama", "walks", "words", "two_word"];

function useRun() {
  const { lang } = useI18n();
  const ctx = usePatientSession();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const go = (fn) => {
    setLoading(true);
    try { setResult(fn({ locale: lang, patient: ctx.patient, findings: ctx.findings, mode: "development" })); }
    catch (e) { setResult({ ok: false, reason: e.message }); }
    finally { setLoading(false); }
  };
  return { ...ctx, lang, result, setResult, loading, go };
}

function RunBar({ loading, onClick, disabled }) {
  const { t } = useI18n();
  return (
    <Button className="w-full" disabled={loading || disabled} onClick={onClick}>
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : t("dp.run")}
    </Button>
  );
}

export function ToxicologyPage() {
  const { t } = useI18n();
  const u = useRun();
  const [ingested, setIngested] = useState("");
  const [pupils, setPupils] = useState("");
  const [rr, setRr] = useState("");
  const [extra, setExtra] = useState([]);
  return (
    <ToolPageShell icon={Biohazard} titleKey="home.tox_title" introKey="home.tox_desc">
      <PatientStrip compact />
      <Input placeholder={t("dp.ingested_mg")} value={ingested} onChange={(e) => setIngested(e.target.value)} />
      <Input placeholder={t("dp.pupils")} value={pupils} onChange={(e) => setPupils(e.target.value)} />
      <Input placeholder={t("dp.rr")} value={rr} onChange={(e) => setRr(e.target.value)} />
      <ChipToggle options={["button battery", "magnets", "paracetamol", "ibuprofen"].map((id) => ({ id, label: id }))} selected={extra} onToggle={setExtra} />
      <RunBar loading={u.loading} onClick={() => u.go((p) => runToxicologyEngine({
        ...p, findings: [...p.findings, ...extra], ingested_mg: ingested === "" ? null : Number(ingested),
        vitals: { gcs: u.session.gcs === "" ? undefined : Number(u.session.gcs), pupils, rr_flag: rr },
      }))} />
      <EngineResultPanel result={u.result} />
    </ToolPageShell>
  );
}

export function TraumaPage() {
  const { t } = useI18n();
  const u = useRun();
  const [regions, setRegions] = useState({});
  const [loc, setLoc] = useState(false);
  return (
    <ToolPageShell icon={Flame} titleKey="home.trauma_title" introKey="home.trauma_desc">
      <PatientStrip />
      <label className="text-xs flex items-center gap-2"><input type="checkbox" checked={loc} onChange={(e) => setLoc(e.target.checked)} />{t("dp.loc")}</label>
      <div className="grid grid-cols-2 gap-2 text-xs">
        {BURN_REGIONS.map((r) => (
          <label key={r} className="flex items-center gap-1">
            {r}
            <Input type="number" min="0" max="1" step="0.1" className="h-8" value={regions[r] ?? ""} onChange={(e) => setRegions((s) => ({ ...s, [r]: e.target.value }))} />
          </label>
        ))}
      </div>
      <RunBar loading={u.loading} onClick={() => {
        const burn = {};
        for (const [k, v] of Object.entries(regions)) if (v !== "") burn[k] = Number(v);
        u.go((p) => runTraumaEngine({
          ...p, gcs: u.session.gcs === "" ? null : Number(u.session.gcs),
          findings: [...p.findings, ...(loc ? ["lost consciousness"] : []), "head trauma"],
          features: { head_trauma: true, lost_consciousness: loc },
          burn_regions: Object.keys(burn).length ? burn : null,
        }));
      }} />
      <EngineResultPanel result={u.result} />
    </ToolPageShell>
  );
}

export function GrowthPage() {
  const { t } = useI18n();
  const u = useRun();
  const [lms, setLms] = useState("");
  return (
    <ToolPageShell icon={Activity} titleKey="home.growth_title" introKey="home.growth_desc">
      <PatientStrip />
      <div className="grid grid-cols-2 gap-2">
        <Input type="number" placeholder={t("dp.father")} value={u.session.fatherCm} onChange={(e) => u.patch({ fatherCm: e.target.value })} />
        <Input type="number" placeholder={t("dp.mother")} value={u.session.motherCm} onChange={(e) => u.patch({ motherCm: e.target.value })} />
      </div>
      <textarea className="w-full min-h-[64px] rounded-md border p-2 text-xs" placeholder={t("dp.lms")} value={lms} onChange={(e) => setLms(e.target.value)} />
      <RunBar loading={u.loading} onClick={() => {
        let table = null;
        if (lms.trim()) {
          try { table = JSON.parse(lms); } catch { u.setResult({ ok: false, message_he: t("dp.lms_bad") }); return; }
        }
        u.go((p) => runGrowthImmunizationEngine({
          ...p, weight_kg: p.patient.weight_kg, height_cm: p.patient.height_cm, lmsTable: table,
          father_cm: u.session.fatherCm === "" ? null : Number(u.session.fatherCm),
          mother_cm: u.session.motherCm === "" ? null : Number(u.session.motherCm),
        }));
      }} />
      <EngineResultPanel result={u.result} />
    </ToolPageShell>
  );
}

export function NutritionPage() {
  const { t } = useI18n();
  const u = useRun();
  const [feeds, setFeeds] = useState("6");
  const [canDo, setCanDo] = useState([]);
  const [flags, setFlags] = useState([]);
  return (
    <ToolPageShell icon={Baby} titleKey="home.nutrition_title" introKey="home.nutrition_desc">
      <PatientStrip />
      <Input type="number" placeholder={t("dp.feeds")} value={feeds} onChange={(e) => setFeeds(e.target.value)} />
      <ChipToggle options={["cmpa", "anaphylaxis", "fpies", "projectile vomiting"].map((id) => ({ id, label: id }))} selected={flags} onToggle={setFlags} />
      <p className="text-xs font-medium">{t("dp.milestones")}</p>
      <ChipToggle options={MILESTONES.map((id) => ({ id, label: id }))} selected={canDo} onToggle={setCanDo} />
      <RunBar loading={u.loading} onClick={() => u.go((p) => runInfantNutritionAndDevelopment({
        ...p, weight_kg: p.patient.weight_kg, feeds_per_day: Number(feeds) || 6,
        ga_weeks: p.patient.ga_weeks, can_do: canDo, findings: [...p.findings, ...flags],
        features: { cmpa: flags.includes("cmpa"), anaphylaxis: flags.includes("anaphylaxis"), fpies: flags.includes("fpies"), projectile_vomiting: flags.includes("projectile vomiting") },
      }))} />
      <EngineResultPanel result={u.result} />
    </ToolPageShell>
  );
}

export function NeurodevPage() {
  const { t } = useI18n();
  const u = useRun();
  const [mchat, setMchat] = useState("");
  const [ticks, setTicks] = useState([]);
  const [settings, setSettings] = useState([]);
  return (
    <ToolPageShell icon={Brain} titleKey="home.neurodev_title" introKey="home.neurodev_desc">
      <PatientStrip compact />
      <Input type="number" placeholder={t("dp.mchat")} value={mchat} onChange={(e) => setMchat(e.target.value)} />
      <ChipToggle options={["home", "school"].map((id) => ({ id, label: id }))} selected={settings} onToggle={setSettings} />
      <ChipToggle options={["no eye contact", "hand flapping", "does not listen", "fidgets"].map((id) => ({ id, label: id }))} selected={ticks} onToggle={setTicks} />
      <RunBar loading={u.loading} onClick={() => u.go((p) => runNeurodevelopmentalEngine({
        ...p, findings: [...p.findings, ...ticks], mchat_total: mchat === "" ? null : Number(mchat), settings,
      }))} />
      <EngineResultPanel result={u.result} />
    </ToolPageShell>
  );
}

export function ChronicPage() {
  const { t } = useI18n();
  const u = useRun();
  const [months, setMonths] = useState("");
  const [attacks, setAttacks] = useState("");
  const [hours, setHours] = useState("");
  const [flags, setFlags] = useState([]);
  return (
    <ToolPageShell icon={Pill} titleKey="home.chronic_title" introKey="home.chronic_desc">
      <PatientStrip compact />
      <ChipToggle options={["abdominal pain", "headache", "morning vomiting", "wakes from sleep", "blood in stool"].map((id) => ({ id, label: id }))} selected={flags} onToggle={setFlags} />
      <div className="grid grid-cols-3 gap-2">
        <Input type="number" placeholder={t("dp.duration_m")} value={months} onChange={(e) => setMonths(e.target.value)} />
        <Input type="number" placeholder={t("dp.attacks")} value={attacks} onChange={(e) => setAttacks(e.target.value)} />
        <Input type="number" placeholder={t("dp.hours")} value={hours} onChange={(e) => setHours(e.target.value)} />
      </div>
      <RunBar loading={u.loading} onClick={() => u.go((p) => runChronicSymptomsEngine({
        ...p, findings: [...p.findings, ...flags],
        duration_months: months === "" ? null : Number(months),
        attacks: attacks === "" ? null : Number(attacks),
        duration_hours: hours === "" ? null : Number(hours),
        features: {
          abdominal_pain: flags.includes("abdominal pain"),
          headache: flags.includes("headache"),
          morning_vomiting: flags.includes("morning vomiting"),
          wakes_from_sleep: flags.includes("wakes from sleep"),
        },
      }))} />
      <EngineResultPanel result={u.result} />
    </ToolPageShell>
  );
}

export function SyndromesPage() {
  const u = useRun();
  const keys = Object.keys(SYN_FEAT);
  const [sel, setSel] = useState([]);
  return (
    <ToolPageShell icon={GitBranch} titleKey="home.syndromes_title" introKey="home.syndromes_desc">
      <PatientStrip compact />
      <ChipToggle options={keys.map((id) => ({ id, label: id }))} selected={sel} onToggle={setSel} />
      <RunBar loading={u.loading} onClick={() => u.go((p) => runSyndromeMatcher({
        ...p, findings: [...p.findings, ...sel], features: Object.fromEntries(sel.map((k) => [k, true])),
      }))} />
      <EngineResultPanel result={u.result} />
    </ToolPageShell>
  );
}

export function MetabolicPage() {
  const { t } = useI18n();
  const u = useRun();
  const [nbs, setNbs] = useState("");
  return (
    <ToolPageShell icon={Droplets} titleKey="home.metabolic_title" introKey="home.metabolic_desc">
      <PatientStrip compact />
      <textarea className="w-full min-h-[72px] rounded-md border p-2 text-sm" placeholder={t("dp.nbs")} value={nbs} onChange={(e) => setNbs(e.target.value)} />
      <RunBar loading={u.loading} onClick={() => {
        const rows = splitList(nbs).map((tok) => {
          const [analyte, flag = "high"] = tok.split(/[:\s]+/);
          return { analyte, flag };
        });
        u.go((p) => runMetabolicInterpreter({ ...p, nbs: rows, findings: [...p.findings, ...splitList(nbs)] }));
      }} />
      <EngineResultPanel result={u.result} />
    </ToolPageShell>
  );
}

export function GeneticsPage() {
  const u = useRun();
  const keys = Object.keys(GEN_FEAT);
  const [sel, setSel] = useState([]);
  return (
    <ToolPageShell icon={Dna} titleKey="home.genetics_title" introKey="home.genetics_desc">
      <PatientStrip compact />
      <ChipToggle options={keys.map((id) => ({ id, label: id }))} selected={sel} onToggle={setSel} />
      <RunBar loading={u.loading} onClick={() => u.go((p) => runGeneticsInterpreter({ ...p, findings: sel, features: sel }))} />
      <EngineResultPanel result={u.result} />
    </ToolPageShell>
  );
}

export function CsfPage() {
  const u = useRun();
  const [csf, setCsf] = useState({ wbc: "", rbc: "", protein: "", glucose: "", blood_glucose: "", gram: "" });
  const set = (k, v) => setCsf((s) => ({ ...s, [k]: v }));
  return (
    <ToolPageShell icon={Droplets} titleKey="home.csf_title" introKey="home.csf_desc">
      <PatientStrip compact />
      <div className="grid grid-cols-2 gap-2">
        {["wbc", "rbc", "protein", "glucose", "blood_glucose"].map((k) => (
          <Input key={k} type="number" placeholder={k} value={csf[k]} onChange={(e) => set(k, e.target.value)} />
        ))}
        <Input placeholder="Gram stain" value={csf.gram} onChange={(e) => set("gram", e.target.value)} />
      </div>
      <RunBar loading={u.loading} onClick={() => u.go((p) => runCsfInterpreter({
        ...p,
        csf: {
          wbc: csf.wbc === "" ? undefined : Number(csf.wbc),
          rbc: csf.rbc === "" ? undefined : Number(csf.rbc),
          protein: csf.protein === "" ? undefined : Number(csf.protein),
          glucose: csf.glucose === "" ? undefined : Number(csf.glucose),
          blood_glucose: csf.blood_glucose === "" ? undefined : Number(csf.blood_glucose),
          gram_stain: csf.gram || undefined,
        },
      }))} />
      <EngineResultPanel result={u.result} />
    </ToolPageShell>
  );
}

export function UltrasoundPage() {
  const u = useRun();
  const [alpha, setAlpha] = useState("");
  const [ivh, setIvh] = useState(false);
  return (
    <ToolPageShell icon={Waves} titleKey="home.us_title" introKey="home.us_desc">
      <PatientStrip compact />
      <Input type="number" placeholder="Graf alpha °" value={alpha} onChange={(e) => setAlpha(e.target.value)} />
      <label className="text-xs flex items-center gap-2"><input type="checkbox" checked={ivh} onChange={(e) => setIvh(e.target.checked)} />IVH</label>
      <RunBar loading={u.loading} onClick={() => u.go((p) => runPediatricUltrasound({
        ...p,
        hips: alpha === "" ? null : { alpha_deg: Number(alpha), side: "left" },
        cranial: ivh ? { ivh_grade: 2 } : null,
      }))} />
      <EngineResultPanel result={u.result} />
    </ToolPageShell>
  );
}

export function EegPage() {
  const { t } = useI18n();
  const u = useRun();
  const [ann, setAnn] = useState([]);
  const [dur, setDur] = useState("");
  return (
    <ToolPageShell icon={Brain} titleKey="home.eeg_title" introKey="home.eeg_desc">
      <PatientStrip compact />
      <ChipToggle options={["hypsarrhythmia", "spikes", "absence", "burst_suppression", "status_epilepticus"].map((id) => ({ id, label: id }))} selected={ann} onToggle={setAnn} />
      <Input type="number" placeholder={t("dp.seizure_min")} value={dur} onChange={(e) => setDur(e.target.value)} />
      <RunBar loading={u.loading} onClick={() => {
        const annotations = Object.fromEntries(ann.map((k) => [k, true]));
        if (dur !== "") annotations.seizure_duration_min = Number(dur);
        u.go((p) => runEegInterpreter({ ...p, annotations, findings: [...p.findings, ...ann] }));
      }} />
      <EngineResultPanel result={u.result} />
    </ToolPageShell>
  );
}

export function AudioPage() {
  const { t, lang } = useI18n();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const record = async () => {
    setLoading(true); setErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const proc = ctx.createScriptProcessor(4096, 1, 1);
      const chunks = [];
      proc.onaudioprocess = (e) => { chunks.push(Float32Array.from(e.inputBuffer.getChannelData(0))); };
      src.connect(proc); proc.connect(ctx.destination);
      await new Promise((r) => setTimeout(r, 2000));
      proc.disconnect(); src.disconnect(); stream.getTracks().forEach((tr) => tr.stop());
      let n = 0; for (const c of chunks) n += c.length;
      const samples = new Float32Array(n);
      let o = 0; for (const c of chunks) { samples.set(c, o); o += c.length; }
      setResult(preprocessAudio({ samples, sampleRate: ctx.sampleRate, locale: lang }));
      ctx.close();
    } catch (e) {
      setErr(e.message || t("dp.error"));
    } finally { setLoading(false); }
  };
  return (
    <ToolPageShell icon={Mic} titleKey="home.audio_title" introKey="home.audio_desc">
      <Button className="w-full" disabled={loading} onClick={record}>
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : t("dp.record")}
      </Button>
      {err && <p className="text-sm text-red-700">{err}</p>}
      {result?.ok && (
        <div className="bg-white border rounded-xl p-4 text-xs space-y-1">
          {(result.elevated_bands ?? []).map((b) => <p key={b}>{b}</p>)}
          <p className="text-slate-500">{result.note_he}</p>
        </div>
      )}
      {result && result.ok === false && <p className="text-sm">{result.reason}</p>}
    </ToolPageShell>
  );
}

export function ReferralsPage() {
  const { t, lang } = useI18n();
  const { session, patch, patchFeature, patient } = usePatientSession();
  const [mchat, setMchat] = useState("");
  const [ttg, setTtg] = useState(false);
  const [iga, setIga] = useState(false);
  const params = {
    features: {
      ...session.features,
      ttg_iga_done: ttg,
      total_iga_done: iga,
    },
    questionnaires: mchat === "" ? {} : { mchat_total: Number(mchat) },
    labs: [
      ...(ttg ? [{ analyte: "tTG-IgA", value: 1 }] : []),
      ...(iga ? [{ analyte: "total IgA", value: 1 }] : []),
    ],
    patient,
    father_cm: session.fatherCm === "" ? null : Number(session.fatherCm),
    mother_cm: session.motherCm === "" ? null : Number(session.motherCm),
  };
  const asd = evaluateAsdAdhdReferral(params);
  const cel = evaluateCeliacReferral(params);
  const gro = evaluateShortStatureReferral(params);
  const gates = [
    { id: "asd_adhd", ready: asd, tree: diagnosticTree("asd_adhd", lang) },
    { id: "celiac", ready: cel, tree: diagnosticTree("celiac", lang) },
    { id: "short_stature", ready: gro, tree: diagnosticTree("short_stature", lang) },
  ];
  return (
    <ToolPageShell icon={Bone} titleKey="home.referrals_title" introKey="home.referrals_desc">
      <PatientStrip />
      <div className="grid grid-cols-2 gap-2">
        <Input type="number" placeholder={t("dp.father")} value={session.fatherCm} onChange={(e) => patch({ fatherCm: e.target.value })} />
        <Input type="number" placeholder={t("dp.mother")} value={session.motherCm} onChange={(e) => patch({ motherCm: e.target.value })} />
        <Input type="number" placeholder={t("dp.mchat")} value={mchat} onChange={(e) => setMchat(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-3 text-xs">
        {["vision_tested", "hearing_tested", "gluten_containing_diet", "gluten_free_diet", "growth_plotted"].map((k) => (
          <label key={k} className="flex items-center gap-1">
            <input type="checkbox" checked={session.features[k] === true} onChange={(e) => patchFeature(k, e.target.checked)} />
            {t(`dp.feat.${k}`)}
          </label>
        ))}
        <label className="flex items-center gap-1"><input type="checkbox" checked={ttg} onChange={(e) => setTtg(e.target.checked)} />tTG-IgA</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={iga} onChange={(e) => setIga(e.target.checked)} />total IgA</label>
      </div>
      {gates.map((g) => {
        const gate = specialistAllowed(g.ready, lang);
        return (
          <div key={g.id} className={`rounded-xl border p-4 ${gate.allowed ? "bg-emerald-50" : "bg-amber-50 border-amber-200"}`}>
            <p className="text-sm font-semibold">{g.id}</p>
            <p className="text-xs mt-1">{gate.allowed ? t("dp.refer_ok") : gate.message_he}</p>
            {(g.ready.missing ?? []).map((m) => <p key={m.item} className="text-[11px]">• {m.item}</p>)}
            {(g.tree?.tiers ?? []).map((tier) => (
              <p key={tier.tier} className="text-[11px] text-slate-600 mt-1">T{tier.tier}: {(tier.items || []).join(", ")}</p>
            ))}
          </div>
        );
      })}
    </ToolPageShell>
  );
}
