import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Database, Loader2, CheckCircle2, AlertTriangle, Flag, Download,
  ChevronDown, ChevronUp, ShieldCheck, Trash2, BookUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import DisclaimerBanner from "@/components/DisclaimerBanner";
import ClinicHeader from "@/components/clinic/ClinicHeader";
import { listKbEntity, loadKbStatus, createKbRecord,
  verifyKbRecord, flagKbRecord, deleteKbRecord, currentUser,
} from "@/lib/medscan/llmAdapter";
import { seedToEntityRows, SEED_COUNT, SEED_PROVENANCE } from "@/lib/medscan/deterministic/referenceRangeSeed";

const ENTITY_LABEL = {
  KnowledgeTopic: "נושאי ידע",
  ClinicalRule: "כללים קליניים",
  LabPattern: "דפוסי מעבדה",
  RedFlag: "דגלים אדומים",
  Association: "אסוציאציות",
  Protocol: "פרוטוקולים",
  DoseRecord: "רשומות מינון",
  DrugInteraction: "אינטראקציות",
  ReferenceRange: "טווחי ייחוס",
};

const KEY_FIELD = {
  KnowledgeTopic: "topic_key", ClinicalRule: "rule_key", LabPattern: "pattern_key",
  RedFlag: "flag_key", Association: "assoc_key", Protocol: "protocol_key",
  DoseRecord: "drug_key", DrugInteraction: "interaction_key", ReferenceRange: "analyte",
};

const TITLE_FIELD = {
  KnowledgeTopic: "topic_title_he", ClinicalRule: "title_he", LabPattern: "title_he",
  RedFlag: "label_he", Association: "implies_he", Protocol: "title_he",
  DoseRecord: "drug_name_he", DrugInteraction: "effect_he", ReferenceRange: "label_he",
};

export default function KnowledgeAdmin() {
  const [status, setStatus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [rows, setRows] = useState([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [user, setUser] = useState(null);
  const [busy, setBusy] = useState(null);
  const [seeding, setSeeding] = useState(false);
  const [msg, setMsg] = useState(null);

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    setStatus(await loadKbStatus());
    setLoading(false);
  }, []);

  useEffect(() => {
    refreshStatus();
    currentUser().then(setUser);
  }, [refreshStatus]);

  const openEntity = async (name) => {
    setSelected(name);
    setExpanded(null);
    setRowsLoading(true);
    setRows(await listKbEntity(name));
    setRowsLoading(false);
  };

  const signature = user?.full_name || user?.email || "לא מזוהה";

  const doVerify = async (row) => {
    setBusy(row.id);
    try {
      await verifyKbRecord(selected, row.id, signature);
      setRows((r) => r.map((x) => x.id === row.id
        ? { ...x, verification_status: "verified", verified_by: signature, verified_at: new Date().toISOString() }
        : x));
      refreshStatus();
    } finally { setBusy(null); }
  };

  const doFlag = async (row) => {
    const reason = window.prompt("מה שגוי ברשומה? (יישמר כהערת בקרה)");
    if (!reason) return;
    setBusy(row.id);
    try {
      await flagKbRecord(selected, row.id, reason, signature);
      setRows((r) => r.map((x) => x.id === row.id
        ? { ...x, verification_status: "flagged", review_note_he: reason } : x));
      refreshStatus();
    } finally { setBusy(null); }
  };

  const doDelete = async (row) => {
    if (!window.confirm("למחוק את הרשומה לצמיתות?")) return;
    setBusy(row.id);
    try {
      await deleteKbRecord(selected, row.id);
      setRows((r) => r.filter((x) => x.id !== row.id));
      refreshStatus();
    } finally { setBusy(null); }
  };

  const loadSeed = async () => {
    const labName = window.prompt(
      "שם המעבדה שאליה ישויכו הטווחים (ניתן לשנות אחר כך):",
      "טיוטה — טרם הוגדרה מעבדה"
    );
    if (labName === null) return;

    setSeeding(true);
    setMsg(null);
    try {
      const existing = new Set((await listKbEntity("ReferenceRange")).map((r) => r.analyte));
      const toAdd = seedToEntityRows(labName).filter((r) => !existing.has(r.analyte));
      let ok = 0;
      for (const row of toAdd) {
        try { await createKbRecord("ReferenceRange", row); ok += 1; } catch { /* דילוג על כשל בודד */ }
      }
      setMsg(
        `נטענו ${ok} טווחים כטיוטה. ${existing.size > 0 ? `${SEED_COUNT - toAdd.length} כבר היו קיימים ולא שוכתבו.` : ""} ` +
        `כל אחד מהם ממתין לאימות שלך מול גיליון המעבדה.`
      );
      refreshStatus();
      if (selected === "ReferenceRange") openEntity("ReferenceRange");
    } finally { setSeeding(false); }
  };

  const totalVerified = status.reduce((a, s) => a + s.verified, 0);
  const totalDraft = status.reduce((a, s) => a + s.draft, 0);

  return (
    <div className="clinic-page">
      <ClinicHeader title="ניהול ידע" icon={Database} tone="tool" />

      <div className="max-w-lg mx-auto px-5 py-6 space-y-5">
        {/* מצב הידע */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-bold">מצב בסיס הידע</h3>
            <Link to="/knowledge-coverage" className="text-[11px] font-semibold text-teal-600 flex items-center gap-1">
              <Database className="w-3.5 h-3.5" /> דשבורד כיסוי
            </Link>
          </div>
          <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">
            רק פריטים <strong>מאומתים</strong> משתתפים בפלט קליני. טיוטה נשמרת,
            מוצגת כאן, ואינה נכנסת לניתוח — עד שתאשר אותה.
          </p>

          {loading ? (
            <div className="flex items-center gap-2 text-xs text-slate-500 py-3">
              <Loader2 className="w-4 h-4 animate-spin" /> טוען…
            </div>
          ) : (
            <>
              <div className="flex gap-2 mb-3">
                <div className="flex-1 bg-emerald-50 border border-emerald-200 rounded-lg p-2 text-center">
                  <div className="text-lg font-bold text-emerald-700">{totalVerified}</div>
                  <div className="text-[10px] text-emerald-600">מאומת</div>
                </div>
                <div className="flex-1 bg-amber-50 border border-amber-200 rounded-lg p-2 text-center">
                  <div className="text-lg font-bold text-amber-700">{totalDraft}</div>
                  <div className="text-[10px] text-amber-600">טיוטה</div>
                </div>
              </div>

              {totalVerified === 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-3">
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    אין ולו פריט ידע מאומת אחד. <strong>כל המנועים יסרבו לענות</strong> —
                    וזו התנהגות נכונה, לא תקלה.
                  </p>
                </div>
              )}

              {/* אימות לפני ייבוא: כשיש טיוטות ממתינות, הן חוסמות את הכלים
                  ולכן הן הצעד הבא המשמעותי, לא ייבוא של עוד טיוטות. */}
              {totalDraft > 0 && (
                <Link to="/verify"
                  className="flex items-center justify-between gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2.5 mb-2">
                  <span className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-semibold text-emerald-800">אמת ידע לפי אשכולות</span>
                  </span>
                  <span className="text-[10px] bg-emerald-600 text-white px-1.5 py-0.5 rounded">
                    {totalDraft} ממתינים
                  </span>
                </Link>
              )}

              <Link to="/knowledge-import"
                className="flex items-center justify-center gap-2 rounded-lg border border-amber-300 bg-amber-50 py-2.5 mb-3">
                <BookUp className="w-4 h-4 text-amber-600" />
                <span className="text-xs font-semibold text-amber-800">ייבוא ידע מנלסון</span>
              </Link>

              <div className="space-y-1">
                {status.map((s) => (
                  <button
                    key={s.entity}
                    onClick={() => openEntity(s.entity)}
                    className={`w-full flex items-center justify-between rounded-lg border px-3 py-2 transition-colors ${
                      selected === s.entity ? "border-slate-400 bg-slate-50" : "border-slate-200"
                    }`}
                  >
                    <span className="text-xs font-medium">{ENTITY_LABEL[s.entity]}</span>
                    <span className="flex items-center gap-1.5 text-[10px]">
                      {s.verified > 0 && (
                        <span className="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">{s.verified} מאומת</span>
                      )}
                      {s.draft > 0 && (
                        <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">{s.draft} טיוטה</span>
                      )}
                      {s.flagged > 0 && (
                        <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded">{s.flagged} שגוי</span>
                      )}
                      {s.total === 0 && <span className="text-slate-400">ריק</span>}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* טעינת טווחי התחלה */}
        <div className="bg-white rounded-2xl border border-amber-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Download className="w-4 h-4 text-amber-600" />
            <h3 className="text-sm font-bold">טעינת טווחי ייחוס להתחלה</h3>
          </div>
          <p className="text-[11px] text-slate-600 leading-relaxed mb-2">
            {SEED_COUNT} מדדים עם מדרגות גיל, כנקודת פתיחה לעריכה.
          </p>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 mb-3">
            <p className="text-[11px] text-amber-900 leading-relaxed">
              ⚠ <strong>אלה אינם הטווחים של המעבדה שלך</strong> ואינם גיליון של קופת חולים.
              הם נכתבו מידע כללי — כלומר מהמקור שהמערכת הזו נבנתה לא לסמוך עליו.
              כולם נטענים כ<strong>טיוטה</strong>, וכל ערך שיסומן לפיהם יוצג עם אזהרה
              ולא יוכל לייצר חשד אדום — עד שתאמת מול גיליון המעבדה.
            </p>
          </div>
          <Button onClick={loadSeed} disabled={seeding}
            className="w-full h-10 rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-700">
            {seeding ? <Loader2 className="w-4 h-4 animate-spin" /> : "טען טווחים כטיוטה"}
          </Button>
          {msg && <p className="text-[11px] text-slate-600 mt-2 leading-relaxed">{msg}</p>}
        </div>

        {/* רשומות הישות שנבחרה */}
        {selected && (
          <div className="bg-white rounded-2xl border border-slate-100 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold">{ENTITY_LABEL[selected]}</h3>
              <span className="text-[10px] text-slate-400">{rows.length} רשומות</span>
            </div>

            {user && (
              <p className="text-[10px] text-slate-400 mb-2">
                אימות ייחתם על שם: <strong>{signature}</strong>
              </p>
            )}

            {rowsLoading ? (
              <div className="flex items-center gap-2 text-xs text-slate-500 py-3">
                <Loader2 className="w-4 h-4 animate-spin" /> טוען…
              </div>
            ) : rows.length === 0 ? (
              <p className="text-xs text-slate-500 py-2">
                אין רשומות. ניתן להוסיף דרך עורך הנתונים של Base44, או לטעון טווחים למעלה.
              </p>
            ) : (
              <div className="space-y-1.5">
                {rows.map((row) => {
                  const st = row.verification_status ?? "draft_needs_verification";
                  const isOpen = expanded === row.id;
                  return (
                    <div key={row.id} className={`rounded-lg border ${
                      st === "verified" ? "border-emerald-200 bg-emerald-50/40"
                        : st === "flagged" ? "border-red-200 bg-red-50/40"
                        : "border-amber-200 bg-amber-50/30"
                    }`}>
                      <button onClick={() => setExpanded(isOpen ? null : row.id)}
                        className="w-full text-right p-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-slate-800 truncate">
                              {row[TITLE_FIELD[selected]] || row[KEY_FIELD[selected]]}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono truncate">
                              {row[KEY_FIELD[selected]]}
                            </div>
                          </div>
                          <span className="flex items-center gap-1 shrink-0">
                            {st === "verified" && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                            {st === "flagged" && <Flag className="w-3.5 h-3.5 text-red-600" />}
                            {st === "draft_needs_verification" && <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />}
                            {isOpen ? <ChevronUp className="w-3 h-3 text-slate-400" /> : <ChevronDown className="w-3 h-3 text-slate-400" />}
                          </span>
                        </div>
                      </button>

                      {isOpen && (
                        <div className="border-t border-slate-100 p-2.5 space-y-2">
                          {row.review_note_he && (
                            <p className="text-[11px] text-slate-600 leading-relaxed bg-white rounded p-2">
                              {row.review_note_he}
                            </p>
                          )}

                          {selected === "ReferenceRange" && row.bands?.length > 0 && (
                            <div className="bg-white rounded p-2 overflow-x-auto">
                              <table className="w-full text-[10px]">
                                <thead>
                                  <tr className="text-slate-400 text-right">
                                    <th className="font-medium pb-1">גיל (ימים)</th>
                                    <th className="font-medium pb-1">מ</th>
                                    <th className="font-medium pb-1">עד</th>
                                    <th className="font-medium pb-1">מין</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {row.bands.map((bd, i) => (
                                    <tr key={i} className="border-t border-slate-50">
                                      <td className="py-0.5">{bd.age_min_days}–{bd.age_max_days}</td>
                                      <td className="py-0.5">{bd.low ?? "—"}</td>
                                      <td className="py-0.5">{bd.high ?? "—"}</td>
                                      <td className="py-0.5 text-slate-400">{bd.sex ?? "any"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              <p className="text-[10px] text-slate-400 mt-1">יחידה: {row.unit || "—"}</p>
                            </div>
                          )}

                          {row.verified_by && (
                            <p className="text-[10px] text-slate-500">
                              אומת ע"י {row.verified_by}
                              {row.verified_at && ` · ${new Date(row.verified_at).toLocaleDateString("he-IL")}`}
                            </p>
                          )}

                          <div className="flex gap-1.5">
                            {st !== "verified" && (
                              <button onClick={() => doVerify(row)} disabled={busy === row.id}
                                className="flex-1 flex items-center justify-center gap-1 text-[11px] font-medium bg-emerald-600 text-white rounded-md py-1.5 disabled:opacity-50">
                                <ShieldCheck className="w-3 h-3" /> אשר כמאומת
                              </button>
                            )}
                            {st !== "flagged" && (
                              <button onClick={() => doFlag(row)} disabled={busy === row.id}
                                className="flex-1 flex items-center justify-center gap-1 text-[11px] font-medium border border-red-300 text-red-700 rounded-md py-1.5 disabled:opacity-50">
                                <Flag className="w-3 h-3" /> סמן כשגוי
                              </button>
                            )}
                            <button onClick={() => doDelete(row)} disabled={busy === row.id}
                              className="px-2 border border-slate-200 text-slate-400 rounded-md disabled:opacity-50">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>

                          {st === "verified" && (
                            <p className="text-[10px] text-emerald-700 leading-relaxed">
                              רשומה זו משתתפת בפלט קליני. האחריות על תוכנה היא של המאמת/ת.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <p className="text-[10px] text-slate-400 leading-relaxed">
          {SEED_PROVENANCE}
        </p>

        <DisclaimerBanner />
      </div>
    </div>
  );
}
