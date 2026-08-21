import React, { useState, useEffect, useRef } from "react";
import { Activity, Stethoscope, Clock, ScanLine, Heart, Download, Upload } from "lucide-react";
import { base44 } from "@/api/base44Client";
import SeverityBadge from "@/components/SeverityBadge";
import ClinicHeader from "@/components/clinic/ClinicHeader";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { listEncounters, exportLocalEncounters, mergeImportedEncounters } from "@/lib/supabase/encounters.js";
import { buildClinicBackup, parseClinicBackup } from "@/lib/clinic/backup.js";
import { loadClinicProfile, saveClinicProfile } from "@/lib/clinic/profile.js";
import { useClinicProfile } from "@/lib/clinic/profileContext";
import moment from "moment";

export default function History() {
  const { t } = useI18n();
  const { update } = useClinicProfile();
  const [analyses, setAnalyses] = useState([]);
  const [encounters, setEncounters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState(null);
  const fileRef = useRef(null);

  const refresh = () => {
    setLoading(true);
    Promise.all([
      base44.entities.Analysis.list("-created_date", 50).catch(() => []),
      listEncounters({ role: "clinician" }).then((r) => r.rows ?? []).catch(() => []),
    ]).then(([a, e]) => {
      setAnalyses(Array.isArray(a) ? a : []);
      setEncounters(Array.isArray(e) ? e : []);
    }).finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
  }, []);

  const typeLabel = (type) =>
    type === "ecg" ? t("history.type_ecg") : type === "skin" ? t("history.type_skin") : t("history.type_radiology");

  const empty = analyses.length === 0 && encounters.length === 0;

  const exportBackup = () => {
    const backup = buildClinicBackup({
      encounters: exportLocalEncounters(),
      profile: loadClinicProfile(),
    });
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `doctorpedai-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setNote(t("clinic.backup_ok"));
  };

  const importBackup = async (file) => {
    try {
      const text = await file.text();
      const parsed = parseClinicBackup(text);
      mergeImportedEncounters(parsed.encounters);
      const next = saveClinicProfile(parsed.profile || {});
      update(next);
      setNote(t("clinic.backup_ok"));
      refresh();
    } catch {
      setNote(t("clinic.backup_bad"));
    }
  };

  return (
    <div className="clinic-page">
      <ClinicHeader title={t("history.title")} icon={Clock} tone="tool" />

      <div className="max-w-lg mx-auto px-5 py-6 space-y-3">
        <div className="flex gap-2 no-print">
          <Button variant="outline" className="flex-1 h-10 rounded-xl text-xs" onClick={exportBackup}>
            <Download className="w-4 h-4" /> {t("clinic.export_backup")}
          </Button>
          <Button variant="outline" className="flex-1 h-10 rounded-xl text-xs" onClick={() => fileRef.current?.click()}>
            <Upload className="w-4 h-4" /> {t("clinic.import_backup")}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) importBackup(file);
              e.target.value = "";
            }}
          />
        </div>
        {note && <p className="text-[11px] text-slate-500">{note}</p>}

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-7 h-7 border-3 border-slate-200 border-t-primary rounded-full animate-spin" />
          </div>
        ) : empty ? (
          <div className="text-center py-20">
            <Clock className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">{t("history.empty")}</p>
          </div>
        ) : (
          <>
            {encounters.map((row) => (
              <div key={row.id} className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-cyan-50 flex items-center justify-center shrink-0">
                    <Heart className="w-5 h-5 text-cyan-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{row.encounter_type} · {row.triage_urgency || "—"}</p>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {row.output_summary?.parent_plan_he || row.rls_role}
                    </p>
                    <p className="text-[11px] text-muted-foreground/60 mt-2">
                      {row.created_at ? moment(row.created_at).format("DD/MM/YYYY HH:mm") : ""}
                    </p>
                  </div>
                </div>
              </div>
            ))}
            {analyses.map((a) => (
              <div key={a.id} className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${a.type === "ecg" ? "bg-blue-50" : a.type === "skin" ? "bg-teal-50" : "bg-indigo-50"}`}>
                    {a.type === "ecg" ? <Activity className="w-5 h-5 text-blue-500" /> : a.type === "skin" ? <Stethoscope className="w-5 h-5 text-teal-500" /> : <ScanLine className="w-5 h-5 text-indigo-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-sm font-semibold">{typeLabel(a.type)}</span>
                      {a.severity && <SeverityBadge severity={a.severity} />}
                    </div>
                    {a.summary && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.summary}</p>}
                    <p className="text-[11px] text-muted-foreground/60 mt-2">{moment(a.created_date).format("DD/MM/YYYY HH:mm")}</p>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
