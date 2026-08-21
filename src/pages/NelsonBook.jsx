import React, { useState, useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import {
  BookOpen, Loader2, Search, ChevronLeft, ChevronDown, ChevronUp,
  FileText, Info, BookUp,
} from "lucide-react";
import { Link } from "react-router-dom";
import ClinicHeader from "@/components/clinic/ClinicHeader";
import DisclaimerBanner from "@/components/DisclaimerBanner";
import { Button } from "@/components/ui/button";
import { loadBook, searchBook, bookStats, BOOK_SOURCE_NOTE_HE } from "@/lib/medscan/knowledge/bookStore";

/**
 * דפדוף בספר.
 *
 * הספר פתוח לקריאה תמיד — גם כשהידע המובנה שנגזר ממנו עדיין בטיוטה.
 * זו הפרדה מכוונת: קריאה במקור אינה טענה קלינית של המערכת, ולכן אינה
 * כפופה למחסום האימות. מה שכפוף לו הוא רק מה שהמערכת אומרת בשם עצמה.
 */
export default function NelsonBook() {
  const { search } = useLocation();
  const anchorParam = new URLSearchParams(search).get("topic");

  const [chapters, setChapters] = useState(null);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [openChapter, setOpenChapter] = useState(null);
  const [openTopic, setOpenTopic] = useState(anchorParam);

  useEffect(() => {
    loadBook()
      .then(setChapters)
      .catch((e) => setError(e?.message || String(e)));
  }, []);

  // עוגן שהגיע מהפלט הקליני — פותח את הפרק הנכון ומגלגל אליו
  useEffect(() => {
    if (!anchorParam || !chapters) return;
    const ch = chapters.find((c) => c.topics?.some((t) => t.k === anchorParam));
    if (!ch) return;
    setOpenChapter(ch.chapter_no);
    setOpenTopic(anchorParam);
    requestAnimationFrame(() => {
      document.getElementById(`t-${anchorParam}`)?.scrollIntoView({ block: "center" });
    });
  }, [anchorParam, chapters]);

  const stats = useMemo(() => bookStats(chapters), [chapters]);
  const hits = useMemo(
    () => (query.trim().length >= 2 ? searchBook(chapters, query) : []),
    [chapters, query],
  );

  if (error) {
    return (
      <Shell>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-xs text-red-700">{error}</p>
        </div>
      </Shell>
    );
  }

  if (!chapters) {
    return (
      <Shell>
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 text-slate-300 animate-spin" />
        </div>
      </Shell>
    );
  }

  if (chapters.length === 0) {
    return (
      <Shell>
        <div className="text-center py-14">
          <BookOpen className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-700">הספר עדיין לא באפליקציה</p>
          <p className="text-xs text-slate-500 mt-1.5 leading-relaxed max-w-xs mx-auto">
            טעינה אחת — ומכאן הוא נשאר. לא תצטרך את הקובץ שוב.
          </p>
          <Link to="/knowledge-import">
            <Button className="mt-5 h-11 rounded-xl text-sm font-semibold bg-amber-600 hover:bg-amber-700">
              <BookUp className="w-4 h-4 ml-1.5" /> טען את הספר
            </Button>
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <p className="text-[11px] text-slate-500">
            {stats.chapters} פרקים · {stats.topics} נושאים · {stats.cells.toLocaleString()} פריטים
          </p>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חפש בספר — מחלה, ממצא, בדיקה…"
            className="w-full h-11 pr-10 pl-3 rounded-xl border border-slate-200 text-sm bg-white
                       focus:outline-none focus:border-slate-400"
          />
        </div>

        {query.trim().length >= 2 ? (
          <div className="space-y-2">
            <p className="text-[11px] text-slate-500 px-1">
              {hits.length === 0 ? "לא נמצא" : `${hits.length} תוצאות`}
            </p>
            {hits.map((h, i) => (
              <div key={i} className="bg-white rounded-xl border border-slate-100 p-3">
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mb-1.5 flex-wrap">
                  <span>{h.chapter}</span>
                  <ChevronLeft className="w-3 h-3" />
                  <span className="text-slate-500">{h.topic}</span>
                  {h.page && <span className="text-slate-300">· עמ׳ {h.page}</span>}
                </div>
                <p className="text-xs text-slate-700 leading-relaxed">
                  <Mark text={h.text} q={query} />
                </p>

                {/* שאר השורה — בטבלה תא לבדו חסר פשר. «71 מ"ג/ד"ל» של מה? */}
                {h.row?.length > 1 && (
                  <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed border-t border-slate-50 pt-1.5">
                    {h.row.filter((c) => c !== h.text).join(" · ")}
                  </p>
                )}

                <button
                  onClick={() => { setQuery(""); setOpenChapter(h.chapter_no); setOpenTopic(h.topic_key); }}
                  className="text-[10px] text-indigo-600 mt-1.5"
                >
                  פתח בהקשר המלא
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {chapters.map((ch) => (
              <Chapter
                key={ch.chapter_no}
                ch={ch}
                open={openChapter === ch.chapter_no}
                onToggle={() =>
                  setOpenChapter(openChapter === ch.chapter_no ? null : ch.chapter_no)
                }
                openTopic={openTopic}
                setOpenTopic={setOpenTopic}
              />
            ))}
          </div>
        )}

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex gap-2">
          <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
          <p className="text-[10px] text-slate-500 leading-relaxed">{BOOK_SOURCE_NOTE_HE}</p>
        </div>

        <DisclaimerBanner />
      </div>
    </Shell>
  );
}

function Chapter({ ch, open, onToggle, openTopic, setOpenTopic }) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center justify-between px-3.5 py-3">
        <span className="flex items-center gap-2.5 min-w-0">
          <span className="w-6 h-6 rounded-lg bg-slate-100 text-slate-500 text-[10px]
                           font-bold flex items-center justify-center shrink-0">
            {ch.chapter_no}
          </span>
          <span className="text-sm font-semibold text-slate-800 truncate">{ch.title_he}</span>
        </span>
        <span className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-slate-400">{ch.topic_count}</span>
          {open ? <ChevronUp className="w-4 h-4 text-slate-300" />
                : <ChevronDown className="w-4 h-4 text-slate-300" />}
        </span>
      </button>

      {open && (
        <div className="border-t border-slate-100">
          {ch.topics.map((tp) => (
            <Topic
              key={tp.k}
              tp={tp}
              open={openTopic === tp.k}
              onToggle={() => setOpenTopic(openTopic === tp.k ? null : tp.k)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Topic({ tp, open, onToggle }) {
  return (
    <div id={`t-${tp.k}`} className="border-b border-slate-50 last:border-0">
      <button onClick={onToggle} className="w-full flex items-center justify-between px-3.5 py-2.5">
        <span className="flex items-center gap-2 min-w-0">
          <FileText className="w-3.5 h-3.5 text-slate-300 shrink-0" />
          <span className="text-xs text-slate-700 truncate">{tp.t}</span>
        </span>
        {tp.pg && <span className="text-[10px] text-slate-300 shrink-0">עמ׳ {tp.pg}</span>}
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3">
          {tp.tb.map((tbl, i) => (
            <BookTable key={i} table={tbl} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * הטבלה כפי שהיא במקור.
 *
 * השורה הראשונה מודגשת ככותרת ויזואלית בלבד — לא מסוננת ולא
 * מפורשת. בחלק מהטבלאות השורה הראשונה היא כבר תוכן, ולכן היא
 * נשארת קריאה בכל מקרה. גלילה אופקית על הטבלה עצמה — הדף לא זז.
 */
function BookTable({ table }) {
  const [head, ...body] = table.r;
  const cols = Math.max(...table.r.map((r) => r.length));

  return (
    <div>
      {table.p && (
        <p className="text-[10px] text-slate-300 mb-1">עמ׳ {table.p}</p>
      )}
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full border-collapse text-xs" style={{ minWidth: cols > 2 ? 420 : 0 }}>
          <tbody>
            <tr>
              {head.map((c, i) => (
                <td key={i}
                  className="align-top border border-slate-100 bg-slate-50 px-2 py-1.5
                             font-semibold text-slate-600 leading-relaxed">
                  {c}
                </td>
              ))}
            </tr>
            {body.map((row, r) => (
              <tr key={r}>
                {Array.from({ length: cols }, (_, c) => (
                  <td key={c}
                    className="align-top border border-slate-100 px-2 py-1.5
                               text-slate-700 leading-relaxed">
                    {row[c] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** הדגשת מונח החיפוש. split במקום innerHTML — הטקסט מגיע מקובץ חיצוני. */
function Mark({ text, q }) {
  const needle = q.trim();
  const idx = text.toLowerCase().indexOf(needle.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-amber-100 text-slate-900 rounded px-0.5">
        {text.slice(idx, idx + needle.length)}
      </mark>
      {text.slice(idx + needle.length)}
    </>
  );
}

function Shell({ children }) {
  return (
    <div className="clinic-page">
      <ClinicHeader
        title="נלסון — הספר"
        icon={BookOpen}
        tone="tool"
        extra={
          <Link to="/knowledge-import" title="טעינה מחדש" className="text-white/80 hover:text-white">
            <BookUp className="w-4 h-4" />
          </Link>
        }
      />
      <div className="max-w-lg mx-auto px-5 py-5">{children}</div>
    </div>
  );
}
