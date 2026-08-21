import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  ShieldCheck, Loader2, AlertTriangle, Flag, CheckCircle2, Quote,
  ChevronLeft, BookOpen, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import ClinicHeader from "@/components/clinic/ClinicHeader";
import DisclaimerBanner from "@/components/DisclaimerBanner";
import {
  listKbEntity, verifyKbRecord, flagKbRecord, currentUser,
} from "@/lib/medscan/llmAdapter";
import {
  CLUSTER_ENTITIES, buildClusters, clusterStats, pendingItems, ENTITY_LABEL_HE,
} from "@/lib/medscan/knowledge/clusters";

/**
 * מסך אימות לפי אשכולות.
 *
 * ## שתי החלטות עיצוב שאינן קוסמטיות
 *
 * **1. הכל פתוח, שום דבר מקופל.** כל טענה מוצגת במלואה לצד הציטוט
 * שממנו נגזרה. אישור-בכמות שמסתיר את מה שמאשרים הוא בדיוק המנגנון
 * שהופך חתימה לחותמת גומי — וזו ההגנה היחידה שיש למערכת הזו.
 *
 * **2. "אשר הכל" מופיע בתחתית האשכול, לא בראשו.** כדי להגיע אליו
 * צריך לגלול דרך כל הטענות. זה איטי בכוונה.
 */
export default function VerifyKnowledge() {
  const [byEntity, setByEntity] = useState(null);
  const [user, setUser] = useState(null);
  const [openCluster, setOpenCluster] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    const entries = await Promise.all(
      CLUSTER_ENTITIES.map(async (e) => [e, await listKbEntity(e)]),
    );
    setByEntity(Object.fromEntries(entries));
  }, []);

  useEffect(() => {
    load();
    currentUser().then(setUser);
  }, [load]);

  const clusters = useMemo(() => (byEntity ? buildClusters(byEntity) : []), [byEntity]);
  const stats = useMemo(() => clusterStats(clusters), [clusters]);

  const signature = user?.full_name || user?.email || null;

  const patch = (entity, id, changes) =>
    setByEntity((prev) => ({
      ...prev,
      [entity]: prev[entity].map((r) => (r.id === id ? { ...r, ...changes } : r)),
    }));

  const verifyOne = async (item) => {
    if (!signature) return;
    setBusy(item.id);
    try {
      await verifyKbRecord(item.entity, item.id, signature);
      patch(item.entity, item.id, {
        verification_status: "verified",
        verified_by: signature,
        verified_at: new Date().toISOString(),
      });
    } finally { setBusy(null); }
  };

  const flagOne = async (item) => {
    const reason = window.prompt("מה שגוי בטענה הזו? (יישמר כהערת בקרה)");
    if (!reason) return;
    setBusy(item.id);
    try {
      await flagKbRecord(item.entity, item.id, reason, signature ?? "לא מזוהה");
      patch(item.entity, item.id, { verification_status: "flagged", review_note_he: reason });
    } finally { setBusy(null); }
  };

  const verifyCluster = async (cluster) => {
    const pending = pendingItems(cluster);
    if (!pending.length || !signature) return;
    const ok = window.confirm(
      `אתה חותם על ${pending.length} טענות באשכול "${cluster.title_he}".\n\n` +
      `מרגע זה הן משתתפות בפלט קליני, והאחריות על תוכנן היא שלך.\n\n` +
      `לאשר?`
    );
    if (!ok) return;

    setBusy(cluster.anchor);
    try {
      for (const item of pending) {
        await verifyKbRecord(item.entity, item.id, signature);
        patch(item.entity, item.id, {
          verification_status: "verified",
          verified_by: signature,
          verified_at: new Date().toISOString(),
        });
      }
    } finally { setBusy(null); }
  };

  return (
    <div className="clinic-page">
      <ClinicHeader title="אימות ידע" icon={ShieldCheck} tone="tool" />

      <div className="max-w-lg mx-auto px-5 py-6 space-y-4">
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
          <p className="text-xs text-slate-600 leading-relaxed">
            כל טענה מוצגת לצד <strong>הציטוט מהספר שממנו נגזרה</strong>. זה מה
            שמאפשר לך לאשר בלי לפתוח את המקור — ולזהות מיד טענה שנוסחה רחב מדי.
          </p>
          <p className="text-[11px] text-slate-500 leading-relaxed mt-1.5">
            אישור הוא חתימה. מרגע האישור הטענה משתתפת בפלט הקליני,
            והאחריות על תוכנה עוברת אליך.
          </p>
        </div>

        {!signature && byEntity && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-900 leading-relaxed">
              לא זוהה משתמש מחובר. אימות דורש חתימה מזוהה ולכן מושבת —
              חתימה אנונימית אינה אימות.
            </p>
          </div>
        )}

        {byEntity === null ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 text-slate-300 animate-spin" />
          </div>
        ) : clusters.length === 0 ? (
          <div className="text-center py-14">
            <p className="text-sm font-semibold text-slate-700">אין ידע לאימות</p>
            <p className="text-xs text-slate-500 mt-1.5">
              ייבא ידע מנלסון כדי שיהיה מה לאמת.
            </p>
            <Link to="/knowledge-import">
              <Button className="mt-4 h-10 rounded-xl text-xs">ייבוא ידע</Button>
            </Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              {[
                ["ממתין", stats.draft, "bg-amber-50 text-amber-700 border-amber-200"],
                ["מאומת", stats.verified, "bg-emerald-50 text-emerald-700 border-emerald-200"],
                ["שגוי", stats.flagged, "bg-red-50 text-red-700 border-red-200"],
              ].map(([label, n, cls]) => (
                <div key={label} className={`rounded-xl border p-2.5 text-center ${cls}`}>
                  <div className="text-lg font-bold">{n}</div>
                  <div className="text-[10px]">{label}</div>
                </div>
              ))}
            </div>

            <p className="text-[11px] text-slate-500 px-1">
              {stats.clusters} אשכולות · הכי הרבה טיוטות ראשון
            </p>

            <div className="space-y-2">
              {clusters.map((c) => (
                <Cluster
                  key={c.anchor}
                  cluster={c}
                  open={openCluster === c.anchor}
                  onToggle={() => setOpenCluster(openCluster === c.anchor ? null : c.anchor)}
                  onVerify={verifyOne}
                  onFlag={flagOne}
                  onVerifyAll={() => verifyCluster(c)}
                  busy={busy}
                  canSign={Boolean(signature)}
                  signature={signature}
                />
              ))}
            </div>
          </>
        )}

        <DisclaimerBanner />
      </div>
    </div>
  );
}

function Cluster({ cluster, open, onToggle, onVerify, onFlag, onVerifyAll, busy, canSign, signature }) {
  const { counts } = cluster;
  const done = counts.draft === 0;

  return (
    <div className={`bg-white rounded-2xl border overflow-hidden ${
      done ? "border-emerald-200" : "border-slate-200"
    }`}>
      <button onClick={onToggle} className="w-full text-right p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-800">{cluster.title_he}</h3>
            <p className="text-[10px] text-slate-400 font-mono truncate mt-0.5">{cluster.anchor}</p>
          </div>
          <span className="flex items-center gap-1.5 shrink-0 text-[10px]">
            {counts.draft > 0 && (
              <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">{counts.draft}</span>
            )}
            {counts.verified > 0 && (
              <span className="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">{counts.verified}</span>
            )}
            {counts.flagged > 0 && (
              <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded">{counts.flagged}</span>
            )}
            <ChevronLeft className={`w-4 h-4 text-slate-300 transition-transform ${open ? "-rotate-90" : ""}`} />
          </span>
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-100 p-3 space-y-2.5 bg-slate-50/50">
          <Link to={`/book?topic=${encodeURIComponent(cluster.anchor)}`}
            className="inline-flex items-center gap-1.5 text-[11px] text-indigo-600">
            <BookOpen className="w-3.5 h-3.5" /> פתח את הנושא בספר
          </Link>

          {cluster.items.map((item) => (
            <Claim key={item.id} item={item} onVerify={onVerify} onFlag={onFlag}
              busy={busy} canSign={canSign} />
          ))}

          {counts.draft > 0 && (
            <div className="pt-1">
              <Button
                onClick={onVerifyAll}
                disabled={!canSign || busy === cluster.anchor}
                className="w-full h-11 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
              >
                {busy === cluster.anchor
                  ? <><Loader2 className="w-4 h-4 ml-1.5 animate-spin" /> חותם…</>
                  : <><ShieldCheck className="w-4 h-4 ml-1.5" /> אשר את כל {counts.draft} הטענות</>}
              </Button>
              {canSign && (
                <p className="text-[10px] text-slate-400 text-center mt-1.5">
                  ייחתם על שם {signature}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const SUSPICION_CLS = {
  red: "bg-red-100 text-red-700", critical: "bg-red-600 text-white",
  yellow: "bg-amber-100 text-amber-700", green: "bg-emerald-100 text-emerald-700",
};

function Claim({ item, onVerify, onFlag, busy, canSign }) {
  const isDraft = item.status === "draft_needs_verification";
  const isFlagged = item.status === "flagged";

  return (
    <div className={`rounded-xl border p-3 ${
      isFlagged ? "border-red-200 bg-red-50/50"
        : isDraft ? "border-slate-200 bg-white"
        : "border-emerald-200 bg-emerald-50/40"
    }`}>
      <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
        <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
          {ENTITY_LABEL_HE[item.entity]}
        </span>
        {item.suspicion && SUSPICION_CLS[item.suspicion] && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${SUSPICION_CLS[item.suspicion]}`}>
            {item.suspicion === "critical" ? "מסכן חיים" : item.suspicion}
          </span>
        )}
        {!isDraft && (
          <span className="flex items-center gap-1 text-[10px] text-slate-500">
            {isFlagged ? <Flag className="w-3 h-3 text-red-600" />
                       : <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
            {isFlagged ? "סומן שגוי" : `אומת ע"י ${item.verified_by}`}
          </span>
        )}
      </div>

      <p className="text-xs font-semibold text-slate-800 leading-snug">{item.title_he}</p>

      {item.claim_he && (
        <p className="text-xs text-slate-700 leading-relaxed mt-1">{item.claim_he}</p>
      )}

      {item.reasoning_he && (
        <p className="text-[11px] text-slate-500 leading-relaxed mt-1.5">{item.reasoning_he}</p>
      )}

      {/* הציטוט — מה שהופך את האימות לאפשרי בלי לפתוח את הספר */}
      {item.quote_he ? (
        <div className="mt-2 border-r-2 border-indigo-200 bg-indigo-50/50 rounded-l px-2.5 py-1.5">
          <div className="flex items-start gap-1.5">
            <Quote className="w-3 h-3 text-indigo-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-slate-600 leading-relaxed">{item.quote_he}</p>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex items-start gap-1.5 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
          <Info className="w-3 h-3 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-800 leading-snug">
            אין ציטוט-מקור. אין דרך לבדוק את הטענה מול הספר — שקול לסמן כשגויה.
          </p>
        </div>
      )}

      {isDraft && (
        <div className="flex gap-1.5 mt-2.5">
          <button onClick={() => onVerify(item)} disabled={!canSign || busy === item.id}
            className="flex-1 flex items-center justify-center gap-1 text-[11px] font-medium
                       bg-emerald-600 text-white rounded-lg py-1.5 disabled:opacity-40">
            <ShieldCheck className="w-3 h-3" /> אשר
          </button>
          <button onClick={() => onFlag(item)} disabled={busy === item.id}
            className="flex-1 flex items-center justify-center gap-1 text-[11px] font-medium
                       border border-red-300 text-red-700 rounded-lg py-1.5 disabled:opacity-40">
            <Flag className="w-3 h-3" /> שגוי
          </button>
        </div>
      )}
    </div>
  );
}
