import React from "react";
import { AlertTriangle, ListChecks, FlaskConical } from "lucide-react";
import { useI18n } from "@/lib/i18n";

function items(result) {
  const inst = result?.instrument && typeof result.instrument === "object" ? result.instrument : result;
  return inst || {};
}

export default function EngineResultPanel({ result }) {
  const { t } = useI18n();
  if (!result) return null;
  const body = items(result);
  if (body.ok === false && !body.red_flags?.length) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
        {body.message_he || body.reason || t("dp.error")}
      </div>
    );
  }

  const flags = body.red_flags ?? result.red_flags ?? [];
  const ddx = (result.hides_mg ? [] : (body.differential ?? result.differential ?? []));
  const tests = result.hides_mg ? [] : (body.recommended_tests ?? result.recommended_tests ?? []);
  const patterns = body.matched_patterns ?? [];
  const emergency = Boolean(result.emergency || body.emergency);

  return (
    <div className="space-y-3">
      {emergency && (
        <div className="bg-red-600 text-white rounded-2xl p-4">
          <p className="font-extrabold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> {t("dp.parent_ed")}
          </p>
        </div>
      )}
      {(body.pecarn_action || body.pecarn?.pecarn_action) && (
        <p className="text-sm bg-white border rounded-xl p-3">PECARN: <strong>{body.pecarn_action || body.pecarn.pecarn_action}</strong></p>
      )}
      {(body.tbsa_pct != null || body.burn?.tbsa_pct != null) && (
        <p className="text-sm bg-white border rounded-xl p-3">TBSA: <strong>{body.tbsa_pct ?? body.burn.tbsa_pct}%</strong></p>
      )}
      {body.volume?.ok && (
        <p className="text-sm bg-white border rounded-xl p-3">
          {body.volume.daily_ml} mL/{t("dp.days")} · {body.volume.per_feed_ml} mL/{t("dp.feed")}
          <span className="block text-[11px] text-slate-500 mt-1">{t("dp.heuristic")}</span>
        </p>
      )}
      {body.formula && (
        <p className="text-sm bg-white border rounded-xl p-3">{t("dp.formula")}: {body.formula.type || body.formula}</p>
      )}
      {patterns.length > 0 && (
        <div className="bg-white border rounded-xl p-4 text-xs space-y-1">
          {patterns.map((p) => <p key={p}>{p}</p>)}
        </div>
      )}
      {flags.length > 0 && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-4 space-y-1">
          <p className="text-sm font-semibold">{t("dp.red_flags")}</p>
          {flags.slice(0, 10).map((f, i) => (
            <p key={f.flag_key || i} className="text-xs">{f.action_he || f.label_he || f.flag_key}</p>
          ))}
        </div>
      )}
      {ddx.length > 0 && (
        <div className="clinic-card p-4 space-y-1">
          <p className="text-sm font-semibold flex items-center gap-2"><ListChecks className="w-4 h-4" />{t("dp.ddx")}</p>
          <p className="text-[10px] text-slate-500">{t("dp.draft_badge")}</p>
          {ddx.slice(0, 10).map((d, i) => (
            <p key={d.direction_id || i} className="text-xs">
              {d.must_not_miss ? "⚠ " : ""}{d.diagnosis_direction_he}
              {d.probability_note_he ? <span className="block text-[10px] text-slate-500">{d.probability_note_he}</span> : null}
            </p>
          ))}
        </div>
      )}
      {tests.length > 0 && (
        <div className="bg-white border rounded-xl p-4 space-y-1">
          <p className="text-sm font-semibold flex items-center gap-2"><FlaskConical className="w-4 h-4" />{t("dp.tests")}</p>
          {tests.slice(0, 10).map((x, i) => (
            <p key={i} className="text-xs">{x.test_he || x.label_he || JSON.stringify(x)}</p>
          ))}
        </div>
      )}
      {(body.notes_he || result.notes_he) && (
        <p className="text-[11px] text-slate-500">
          {Array.isArray(body.notes_he || result.notes_he)
            ? (body.notes_he || result.notes_he).join(" ")
            : (body.notes_he || result.notes_he)}
        </p>
      )}
    </div>
  );
}
