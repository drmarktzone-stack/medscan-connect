import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Loader2, Database, ShieldCheck, FileWarning, Flag, ArrowLeft } from "lucide-react";
import ClinicHeader from "@/components/clinic/ClinicHeader";
import { loadKbStatus, KB_ENTITY_NAMES } from "@/lib/medscan/llmAdapter";
import PilotModeToggle from "@/components/PilotModeToggle";

/**
 * דשבורד כיסוי-ידע (verified / draft / flagged) לכל ישות.
 *
 * למה זה קריטי: לפי כללי-הבטיחות, רק פריט `verified` מגיע לפלט קליני.
 * צוואר-הבקבוק הוא קצב-האימות של רופא/ה — לא הייבוא. הדשבורד מראה
 * בדיוק היכן הפער, כדי לאמת באצוות במקום הנכון. הכל ספירה דטרמיניסטית
 * מהנתונים בפועל — אין כאן שום הערכה/LLM.
 */

const LABEL_HE = {
  KnowledgeTopic: "נושאי ידע",
  ClinicalRule: "כללים קליניים",
  LabPattern: "דפוסי מעבדה",
  Association: "אסוציאציות",
  RedFlag: "דגלים אדומים",
  Protocol: "פרוטוקולים",
  DoseRecord: "רשומות מינון",
};

export default function KnowledgeCoverage() {
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const status = await loadKbStatus();
        if (alive) setRows(status);
      } catch {
        if (alive) setRows([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const totals = (rows || []).reduce(
    (a, r) => ({
      total: a.total + r.total,
      verified: a.verified + r.verified,
      draft: a.draft + r.draft,
      flagged: a.flagged + r.flagged,
    }),
    { total: 0, verified: 0, draft: 0, flagged: 0 }
  );
  const pct = totals.total ? Math.round((totals.verified / totals.total) * 100) : 0;

  return (
    <div className="clinic-page">
      <ClinicHeader title="כיסוי ידע ואימות" icon={Database} tone="tool" />

      <div className="max-w-lg mx-auto px-5 py-6 space-y-5">
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-muted-foreground animate-spin" /></div>
        ) : (
          <>
            <div className="bg-white rounded-xl border border-teal-200 p-4">
              <div className="flex items-end justify-between mb-2">
                <div>
                  <p className="text-3xl font-extrabold text-teal-600">{pct}%</p>
                  <p className="text-xs text-muted-foreground">מאומת מתוך סה״כ הידע</p>
                </div>
                <div className="text-left text-[11px] text-muted-foreground">
                  <p><span className="font-bold text-emerald-600">{totals.verified}</span> מאומת</p>
                  <p><span className="font-bold text-amber-600">{totals.draft}</span> טיוטה</p>
                  {totals.flagged > 0 && <p><span className="font-bold text-red-600">{totals.flagged}</span> מסומן</p>}
                </div>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden flex">
                <div className="h-full bg-emerald-500" style={{ width: `${totals.total ? (totals.verified / totals.total) * 100 : 0}%` }} />
                <div className="h-full bg-amber-400" style={{ width: `${totals.total ? (totals.draft / totals.total) * 100 : 0}%` }} />
                <div className="h-full bg-red-400" style={{ width: `${totals.total ? (totals.flagged / totals.total) * 100 : 0}%` }} />
              </div>
              {totals.verified === 0 && totals.total > 0 && (
                <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                  <FileWarning className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    אין ולו פריט אחד מאומת. לפי כללי-הבטיחות, כמעט שום ידע אינו מגיע לפלט קליני עד שתאמת/י אותו.
                    זהו צוואר-הבקבוק המרכזי — לא הייבוא.
                  </p>
                </div>
              )}
            </div>

            <PilotModeToggle />

            <div className="space-y-2">
              {(rows || []).map((r) => {
                const vpct = r.total ? Math.round((r.verified / r.total) * 100) : 0;
                return (
                  <div key={r.entity} className="bg-white rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-sm font-bold">{LABEL_HE[r.entity] || r.entity}</p>
                      <span className="text-[11px] text-muted-foreground">{r.verified}/{r.total} ({vpct}%)</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden flex">
                      <div className="h-full bg-emerald-500" style={{ width: `${r.total ? (r.verified / r.total) * 100 : 0}%` }} />
                      <div className="h-full bg-amber-400" style={{ width: `${r.total ? (r.draft / r.total) * 100 : 0}%` }} />
                      <div className="h-full bg-red-400" style={{ width: `${r.total ? (r.flagged / r.total) * 100 : 0}%` }} />
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1"><ShieldCheck className="w-3 h-3 text-emerald-500" /> {r.verified}</span>
                      <span className="flex items-center gap-1"><FileWarning className="w-3 h-3 text-amber-500" /> {r.draft}</span>
                      {r.flagged > 0 && <span className="flex items-center gap-1"><Flag className="w-3 h-3 text-red-500" /> {r.flagged}</span>}
                    </div>
                  </div>
                );
              })}
            </div>

            <Link to="/verify" className="flex items-center justify-center gap-2 h-11 rounded-xl bg-teal-600 text-white text-sm font-semibold">
              <ShieldCheck className="w-4 h-4" /> עבור לאימות באצוות
              <ArrowLeft className="w-4 h-4" />
            </Link>

            <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
              ספירה דטרמיניסטית מהנתונים בפועל ({KB_ENTITY_NAMES.length} ישויות). רק `verified` משתתף בפלט קליני.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
