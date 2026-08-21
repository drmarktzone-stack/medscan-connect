import React, { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  BookUp, Loader2, Upload, Play, Square, AlertTriangle, CheckCircle2,
  ChevronDown, ChevronUp, FileWarning, Pill, Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import DisclaimerBanner from "@/components/DisclaimerBanner";
import ClinicHeader from "@/components/clinic/ClinicHeader";
import { extractBookSource, summarizeBook } from "@/lib/medscan/ingestion/bookParser";
import { parseJsLiteral } from "@/lib/medscan/ingestion/jsLiteral";
import { estimateRun, runIngestion } from "@/lib/medscan/ingestion/runIngestion";
import { saveBookToApp, loadBook, bookStats } from "@/lib/medscan/knowledge/bookStore";

/**
 * מקבץ שגיאות לפי הודעה.
 *
 * רשימה של מאות שגיאות זהות נראית כמו הרבה מידע ואינה מלמדת
 * דבר. השאלה היחידה שחשובה היא אם מדובר בכשל אחד שחוזר
 * על עצמו — שאז יש לתקן דבר אחד — או במגוון תקלות.
 */
function groupErrors(errors) {
  const byMessage = new Map();
  for (const e of errors ?? []) {
    const message = String(e.error ?? 'שגיאה ללא הודעה').slice(0, 300);
    if (!byMessage.has(message)) {
      byMessage.set(message, { message, count: 0, sample: e.topic ?? e.entity ?? '—' });
    }
    byMessage.get(message).count += 1;
  }
  return [...byMessage.values()].sort((a, b) => b.count - a.count);
}

export default function KnowledgeImport() {
  const [book, setBook] = useState(null);
  const [summary, setSummary] = useState(null);
  const [fileError, setFileError] = useState(null);
  const [loading, setLoading] = useState(false);

  const [chapterNo, setChapterNo] = useState(null);
  const [estimate, setEstimate] = useState(null);
  const [dryRun, setDryRun] = useState(true);

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [openSection, setOpenSection] = useState(null);
  const stopRef = useRef(false);

  // שמירת הספר עצמו באפליקציה — צעד נפרד מהחילוץ, ומקדים לו
  const [inApp, setInApp] = useState(null);
  const [saving, setSaving] = useState(null);
  const [saveResult, setSaveResult] = useState(null);

  useEffect(() => {
    loadBook()
      .then((rows) => setInApp(bookStats(rows)))
      .catch(() => setInApp({ chapters: 0, topics: 0, cells: 0 }));
  }, []);

  const saveBook = async () => {
    setSaveResult(null);
    setSaving({ done: 0, total: 0, title: null });
    try {
      const s = await saveBookToApp(book, { onProgress: setSaving });
      setSaveResult(s);
      const rows = await loadBook();
      setInApp(bookStats(rows));
    } catch (e) {
      setSaveResult({ fatal: e?.message || String(e) });
    } finally {
      setSaving(null);
    }
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setFileError(null);
    setBook(null); setSummary(null); setResult(null); setEstimate(null);
    try {
      const html = await file.text();
      const { source, error } = extractBookSource(html);
      if (error) throw new Error(
        error === "BOOK_not_found"
          ? "לא נמצא מבנה BOOK בקובץ. ודא שזה קובץ אפליקציית הטבלאות."
          : "מבנה BOOK בקובץ אינו שלם."
      );
      const parsed = parseJsLiteral(source);
      setBook(parsed);
      setSummary(summarizeBook(parsed));
    } catch (err) {
      setFileError(err.message || "לא ניתן לקרוא את הקובץ.");
    } finally {
      setLoading(false);
    }
  };

  const pickChapter = (no) => {
    setChapterNo(no);
    setResult(null);
    setEstimate(estimateRun(book, no));
  };

  const start = async () => {
    stopRef.current = false;
    setRunning(true);
    setResult(null);
    setProgress({ done: 0, total: estimate.units, topic: null });
    try {
      const s = await runIngestion({
        book,
        chapterNo,
        dryRun,
        shouldStop: () => stopRef.current,
        onProgress: ({ done, total, unit }) =>
          setProgress({ done, total, topic: unit?.topic ?? null }),
      });
      setResult(s);
    } catch (e) {
      setResult({ fatal: e.message || String(e) });
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

  const savedTotal = result?.saved
    ? Object.values(result.saved).reduce((a, b) => a + b, 0)
    : 0;

  const Section = ({ id, icon: Icon, title, count, tone = "slate", children }) => {
    const open = openSection === id;
    const tones = {
      slate: "border-slate-200", amber: "border-amber-300 bg-amber-50/40",
      red: "border-red-300 bg-red-50/40",
    };
    return (
      <div className={`rounded-lg border ${tones[tone]}`}>
        <button onClick={() => setOpenSection(open ? null : id)}
          className="w-full flex items-center justify-between p-2.5">
          <span className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-semibold">{title}</span>
            <span className="text-[10px] text-slate-400">({count})</span>
          </span>
          {open ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
        </button>
        {open && <div className="border-t border-slate-100 p-2.5 max-h-72 overflow-y-auto">{children}</div>}
      </div>
    );
  };

  return (
    <div className="clinic-page">
      <ClinicHeader title="ייבוא ידע מנלסון" icon={BookUp} tone="tool" />

      <div className="max-w-lg mx-auto px-5 py-6 space-y-5">
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
          <p className="text-xs text-slate-600 leading-relaxed">
            זהו <strong>הרגע היחיד שבו תוכן קליני נכנס למערכת</strong>. כל שאר
            השכבות מגינות על הפלט — אם ייכנס כאן ידע שגוי, הוא יעבור את כולן,
            כי הוא ייראה כמו ידע מאומת.
          </p>
          <p className="text-xs text-slate-600 leading-relaxed mt-1.5">
            לכן: כל פריט נכנס כ<strong>טיוטה</strong> עם ציטוט-מקור, ואינו משתתף
            בפלט קליני עד שתאשר אותו ב"ניהול ידע".
          </p>
        </div>

        {/* העלאה */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <h3 className="text-sm font-bold mb-2">1. קובץ המקור</h3>
          <label className="flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl py-6 cursor-pointer hover:border-amber-300 transition-colors">
            <Upload className="w-4 h-4 text-slate-400" />
            <span className="text-xs text-slate-500">
              {book ? "החלף קובץ" : "בחר את nelson-tables-app.html"}
            </span>
            <input type="file" accept=".html,.htm" onChange={handleFile} className="hidden" />
          </label>

          {loading && (
            <div className="flex items-center gap-2 text-xs text-slate-500 mt-2">
              <Loader2 className="w-4 h-4 animate-spin" /> קורא…
            </div>
          )}
          {fileError && (
            <div className="mt-2 bg-red-50 border border-red-200 rounded-lg p-2.5">
              <p className="text-xs text-red-700">{fileError}</p>
            </div>
          )}
          {summary && (
            <div className="mt-3 grid grid-cols-4 gap-2 text-center">
              {[
                ["פרקים", summary.chapters], ["נושאים", summary.topics],
                ["טבלאות", summary.tables], ["תאים", summary.cells],
              ].map(([label, n]) => (
                <div key={label} className="bg-slate-50 rounded-lg py-2">
                  <div className="text-sm font-bold text-slate-700">{n.toLocaleString()}</div>
                  <div className="text-[10px] text-slate-500">{label}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* שמירת הספר באפליקציה */}
        {(summary || inApp?.chapters > 0) && (
          <div className="bg-white rounded-2xl border border-slate-100 p-4">
            <h3 className="text-sm font-bold mb-1">2. שמור את הספר באפליקציה</h3>
            <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">
              פעולה חד-פעמית. מרגע זה הספר נמצא במאגר ולא תצטרך את הקובץ שוב —
              גם לקריאה, וגם כיעד לכל ציטוט שהכלים מפנים אליו.
            </p>

            {inApp?.chapters > 0 && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 mb-3">
                <p className="text-xs text-emerald-900">
                  הספר באפליקציה: <strong>{inApp.chapters}</strong> פרקים ·{" "}
                  {inApp.topics} נושאים · {inApp.cells.toLocaleString()} פריטים.
                </p>
                <Link to="/book"
                  className="text-[11px] text-emerald-700 underline mt-1 inline-block">
                  פתח את הספר
                </Link>
              </div>
            )}

            {summary && (
              <Button onClick={saveBook} disabled={!!saving}
                className="w-full h-11 rounded-xl text-sm font-semibold bg-slate-800 hover:bg-slate-900">
                {saving
                  ? <><Loader2 className="w-4 h-4 ml-1.5 animate-spin" /> שומר {saving.title ?? "…"}</>
                  : <><Save className="w-4 h-4 ml-1.5" /> {inApp?.chapters > 0 ? "עדכן מהקובץ" : "שמור את הספר"}</>}
              </Button>
            )}

            {saving?.total > 0 && (
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mt-2">
                <div className="h-full bg-slate-700 transition-all"
                  style={{ width: `${(saving.done / saving.total) * 100}%` }} />
              </div>
            )}

            {saveResult?.fatal && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5 mt-2">
                {saveResult.fatal}
              </p>
            )}
            {saveResult && !saveResult.fatal && (
              <p className="text-xs text-slate-600 mt-2">
                {saveResult.created} פרקים נוספו · {saveResult.updated} עודכנו
                {saveResult.failed > 0 && <span className="text-red-600"> · {saveResult.failed} נכשלו</span>}
              </p>
            )}

            <p className="text-[10px] text-slate-400 mt-3 leading-relaxed">
              נשמרים תאי הטבלאות בלבד. בלוקי הפסקאות שבקובץ הם טקסט משובש
              מחילוץ ה-PDF (רסיסי משפטים מעמודות שונות) ואינם נכנסים.
            </p>
          </div>
        )}

        {/* בחירת פרק */}
        {summary && (
          <div className="bg-white rounded-2xl border border-slate-100 p-4">
            <h3 className="text-sm font-bold mb-1">3. מה לחלץ לידע מובנה</h3>
            <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">
              מומלץ פרק-אחר-פרק. ריצה נעצרת אינה מאבדת את מה שכבר יובא,
              והרצה חוזרת מדלגת על נושאים קיימים.
            </p>

            <button onClick={() => pickChapter(null)}
              className={`w-full text-right rounded-lg border px-3 py-2 mb-2 ${
                chapterNo === null && estimate ? "border-amber-400 bg-amber-50" : "border-slate-200"
              }`}>
              <span className="text-xs font-semibold">כל הספר</span>
              <span className="text-[10px] text-slate-400 block">
                {summary.topics} נושאים · הרצה ארוכה
              </span>
            </button>

            <div className="space-y-1 max-h-64 overflow-y-auto">
              {summary.chapter_list.map((c) => (
                <button key={c.no} onClick={() => pickChapter(c.no)}
                  className={`w-full flex items-center justify-between rounded-lg border px-3 py-2 ${
                    chapterNo === c.no ? "border-amber-400 bg-amber-50" : "border-slate-200"
                  }`}>
                  <span className="text-xs">{c.no}. {c.title}</span>
                  <span className="text-[10px] text-slate-400">{c.topics} נושאים</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* הרצה */}
        {estimate && (
          <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3">
            <h3 className="text-sm font-bold">4. הרצה</h3>

            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs text-slate-700">
                <strong>{estimate.llm_calls}</strong> קריאות · {estimate.topics} נושאים ·{" "}
                {(estimate.chars / 1000).toFixed(0)}K תווים
              </p>
              <p className="text-[10px] text-slate-500 mt-1">
                כל קריאה מחלצת נושא אחד. העלות נצברת לפי מספר הקריאות.
              </p>
            </div>

            <label className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)}
                className="mt-0.5" />
              <span className="text-xs text-slate-700 leading-snug">
                <strong>הרצת ניסיון</strong> — מחלץ ומציג, בלי לשמור.
                <span className="block text-[10px] text-slate-500">
                  מומלץ בפעם הראשונה: תראה מה יוצא לפני שזה נכנס ל-KB.
                </span>
              </span>
            </label>

            {!running ? (
              <Button onClick={start}
                className="w-full h-11 rounded-xl text-sm font-semibold bg-amber-600 hover:bg-amber-700">
                <Play className="w-4 h-4 ml-1" />
                {dryRun ? "הרץ ניסיון" : "הרץ ושמור כטיוטות"}
              </Button>
            ) : (
              <Button onClick={() => { stopRef.current = true; }}
                className="w-full h-11 rounded-xl text-sm font-semibold bg-slate-600 hover:bg-slate-700">
                <Square className="w-4 h-4 ml-1" /> עצור
              </Button>
            )}

            {progress && (
              <div>
                <div className="flex justify-between text-[11px] text-slate-500 mb-1">
                  <span className="truncate">{progress.topic ?? "מתחיל…"}</span>
                  <span className="shrink-0 mr-2">{progress.done} / {progress.total}</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 transition-all"
                    style={{ width: `${(progress.done / progress.total) * 100}%` }} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* תוצאה */}
        {result && (
          <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3">
            <div className="flex items-center gap-2">
              {result.fatal ? <AlertTriangle className="w-5 h-5 text-red-500" />
                            : <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
              <h3 className="text-sm font-bold">
                {result.fatal ? "הריצה נכשלה" : result.stopped ? "נעצר" : "הסתיים"}
              </h3>
            </div>

            {result.fatal ? (
              <p className="text-xs text-red-700">{result.fatal}</p>
            ) : (
              <>
                {/* שתי סיבות הדילוג מוצגות בנפרד: אחת אומרת "כבר יש לנו"
                    והשנייה אומרת "הטקסט משובש ולא ניתן לחילוץ". מספר מאוחד
                    הסתיר את ההבדל — והשנייה היא חור אמיתי בכיסוי. */}
                <div className="grid grid-cols-4 gap-2 text-center">
                  {[
                    ["חולצו", result.done, "text-emerald-700 bg-emerald-50"],
                    ["כבר קיים", result.skipped, "text-slate-600 bg-slate-50"],
                    ["טקסט משובש", result.seam_blocked, "text-amber-700 bg-amber-50"],
                    ["נכשלו", result.failed, "text-red-700 bg-red-50"],
                  ].map(([l, n, cls]) => (
                    <div key={l} className={`rounded-lg py-2 ${cls}`}>
                      <div className="text-base font-bold">{n}</div>
                      <div className="text-[10px] leading-tight">{l}</div>
                    </div>
                  ))}
                </div>

                {/* כיסוי שלא הושג — מוצג במפורש. נושא שדולג נראה
                    כמו נושא שטופל, וזו הטעות המסוכנת יותר. */}
                {result.skipped_topics?.length > 0 && (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                    <p className="text-xs text-slate-800 font-semibold">
                      {result.skipped_topics.length} נושאים לא חולצו — כבר קיימים ב-KB
                    </p>
                    <p className="text-[10px] text-slate-600 mt-1 leading-relaxed">
                      הדילוג הוא על הנושא השלם. אם הנושא נוצר ידנית מתא בודד,
                      שאר התוכן שלו <strong>לא חולץ</strong>. כדי להשלים אותו יש
                      למחוק את הנושא ולהריץ שוב.
                    </p>
                    <details className="mt-1.5">
                      <summary className="text-[10px] text-slate-700 cursor-pointer underline">הצג רשימה</summary>
                      <ul className="mt-1 space-y-0.5">
                        {result.skipped_topics.map((k) => (
                          <li key={k} className="text-[10px] text-slate-600 font-mono">{k}</li>
                        ))}
                      </ul>
                    </details>
                  </div>
                )}

                {result.duplicates_prevented?.length > 0 && (
                  <p className="text-[10px] text-slate-600">
                    {result.duplicates_prevented.length} רשומות לא נשמרו שוב — מפתח זהה כבר קיים.
                  </p>
                )}

                {dryRun ? (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5 leading-relaxed">
                    הרצת ניסיון — <strong>שום דבר לא נשמר</strong>. בטל את הסימון
                    והרץ שוב כדי לשמור כטיוטות.
                  </p>
                ) : (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
                    <p className="text-xs text-emerald-900 leading-relaxed">
                      נשמרו <strong>{savedTotal}</strong> פריטים כטיוטה:{" "}
                      {result.saved.topics} נושאים · {result.saved.lab_patterns} דפוסים ·{" "}
                      {result.saved.red_flags} דגלים · {result.saved.clinical_rules} כללים ·{" "}
                      {result.saved.associations} אסוציאציות.
                    </p>
                    <p className="text-[10px] text-emerald-700 mt-1">
                      אף אחד מהם אינו משתתף בפלט קליני עד שתאשר אותו ב"ניהול ידע".
                    </p>
                  </div>
                )}

                {result.gaps?.length > 0 && (
                  <Section id="gaps" icon={FileWarning} title="פערים שהוצהרו" count={result.gaps.length}>
                    <ul className="space-y-1">
                      {result.gaps.slice(0, 60).map((g, i) => (
                        <li key={i} className="text-[11px] text-slate-600 leading-snug">
                          <span className="text-slate-400">{g.topic}:</span> {g.gap}
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}

                {result.dosing_mentions?.length > 0 && (
                  <Section id="dosing" icon={Pill} title="מינונים שזוהו ולא יובאו"
                    count={result.dosing_mentions.length} tone="amber">
                    <p className="text-[10px] text-amber-700 mb-2 leading-relaxed">
                      מינונים אינם נכנסים לכללים. אם תרצה בהם — צור רשומת
                      DoseRecord ואמת אותה מול הפרוטוקול המחלקתי.
                    </p>
                    <ul className="space-y-1">
                      {result.dosing_mentions.slice(0, 60).map((d, i) => (
                        <li key={i} className="text-[11px] text-slate-700 leading-snug">
                          <span className="text-slate-400">{d.topic}:</span> {d.mention}
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}

                {result.problems?.length > 0 && (
                  <Section id="problems" icon={AlertTriangle} title="פריטים שנפסלו או סומנו"
                    count={result.problems.length} tone="amber">
                    <ul className="space-y-1">
                      {result.problems.slice(0, 60).map((p, i) => (
                        <li key={i} className="text-[11px] text-slate-700 leading-snug">
                          <span className="text-slate-400">{p.topic}:</span> {p.why_he}
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}

                {result.errors?.length > 0 && (
                  <Section id="errors" icon={AlertTriangle} title="שגיאות" count={result.errors.length} tone="red">
                    {/* מקובץ לפי הודעה: 947 שורות זהות אינן מלמדות כלום,
                        ומסתירות את השאלה היחידה שחשובה: אחת או רבות? */}
                    <p className="text-[10px] text-slate-500 mb-2">
                      מקובץ לפי סוג השגיאה. סוג אחד שחוזר על עצמו = כשל שיטתי,
                      לא תקלות נקודתיות.
                    </p>
                    <ul className="space-y-2">
                      {groupErrors(result.errors).map((g, i) => (
                        <li key={i} className="bg-white rounded-lg border border-red-200 p-2">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-[11px] text-red-800 leading-snug font-mono break-all">
                              {g.message}
                            </p>
                            <span className="text-[10px] bg-red-600 text-white px-1.5 py-0.5 rounded shrink-0">
                              ×{g.count}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-1">
                            למשל: {g.sample}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}
              </>
            )}
          </div>
        )}

        <DisclaimerBanner />
      </div>
    </div>
  );
}
