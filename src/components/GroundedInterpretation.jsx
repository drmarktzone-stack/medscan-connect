import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, ShieldAlert, ChevronDown, ChevronUp, Eye, Anchor,
  HelpCircle, GitBranch, Info, ShieldCheck, Repeat, BookOpen, ExternalLink,
} from "lucide-react";

/**
 * תצוגת הפלט של שכבת האנטי-הזיה.
 *
 * שלושה עקרונות תצוגה שאינם קוסמטיים:
 *
 * 1. **דגלים אדומים ראשונים, ולא ניתנים לקיפול.** אם יש דגל, הוא הדבר
 *    הראשון על המסך.
 * 2. **"אין לי מידע מספיק" אינו שגיאה.** הוא מוצג כתשובה קלינית לגיטימית.
 *    הצגתו ככשל טכני תדחוף משתמשים להתעלם ממנה — וזה בדיוק ההפך מהמטרה.
 * 3. **ציון ביטחון לעולם לא בלי ההסבר שלו.** ציון עירום הוא "תיאטרון
 *    סמכות" — בדיוק מה שהשכבה נבנתה למנוע.
 */

const SUSPICION = {
  red: { label: "חשד גבוה", cls: "bg-red-50 text-red-700 border-red-200", dot: "bg-red-500" },
  yellow: { label: "דורש בירור", cls: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500" },
  green: { label: "סיכון נמוך", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  insufficient: { label: "אין ראיה מספקת", cls: "bg-slate-50 text-slate-600 border-slate-200", dot: "bg-slate-400" },
};

function SuspicionBadge({ level }) {
  const s = SUSPICION[level] || SUSPICION.insufficient;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${s.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

function Section({ icon: Icon, title, children, tone = "slate" }) {
  const tones = {
    slate: "border-slate-200 bg-white",
    amber: "border-amber-200 bg-amber-50/50",
    red: "border-red-200 bg-red-50/50",
  };
  return (
    <div className={`rounded-xl border p-4 ${tones[tone]}`}>
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-slate-500" />
        <h4 className="text-sm font-bold text-slate-800">{title}</h4>
      </div>
      {children}
    </div>
  );
}

/** דגלים אדומים — תמיד ראשונים, אף פעם לא מקופלים. */
function RedFlags({ flags }) {
  if (!flags?.length) return null;
  return (
    <div className="rounded-xl border-2 border-red-300 bg-red-50 p-4">
      <div className="flex items-center gap-2 mb-3">
        <ShieldAlert className="w-5 h-5 text-red-600" />
        <h4 className="text-sm font-bold text-red-800">דגלים אדומים — קדימות מוחלטת</h4>
      </div>
      <div className="space-y-3">
        {flags.map((f, i) => (
          <div key={i} className="border-r-4 border-red-500 pr-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm text-red-900">{f.label_he}</span>
              {f.severity === "critical" && (
                <span className="text-[10px] font-bold bg-red-600 text-white px-1.5 py-0.5 rounded">מסכן חיים</span>
              )}
              {f.unverified_model_flag && (
                <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">הצעת מנוע — לא דגל מערכת</span>
              )}
            </div>
            {f.reason_he && <p className="text-xs text-red-800/80 mt-1">{f.reason_he}</p>}
            <p className="text-xs font-semibold text-red-900 mt-1">← {f.action_he}</p>
            {f.draft_notice_he && (
              <p className="text-[11px] text-amber-700 mt-1">⚠ {f.draft_notice_he}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** מעטפת "אין מידע מספיק" — תשובה, לא שגיאה. */
function InsufficientPanel({ data }) {
  return (
    <div className="rounded-xl border border-slate-300 bg-slate-50 p-4">
      <div className="flex items-center gap-2 mb-2">
        <Info className="w-5 h-5 text-slate-500" />
        <h4 className="text-sm font-bold text-slate-800">{data.message_he}</h4>
      </div>
      <p className="text-xs text-slate-600 mb-3">
        זו תשובה תקינה של המערכת, לא תקלה. הכלי מסרב לענות במקום להשלים מידע שאין לו.
      </p>

      {data.reasons_he?.length > 0 && (
        <div className="mb-3">
          <p className="text-[11px] font-semibold text-slate-500 mb-1">הסיבה</p>
          <ul className="space-y-1">
            {data.reasons_he.map((r, i) => (
              <li key={i} className="text-xs text-slate-700 leading-relaxed">· {r}</li>
            ))}
          </ul>
        </div>
      )}

      {data.what_would_help_he?.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 p-3">
          <p className="text-[11px] font-semibold text-slate-500 mb-1">מה יאפשר תשובה</p>
          <ul className="space-y-1">
            {data.what_would_help_he.map((w, i) => (
              <li key={i} className="text-xs text-slate-700 leading-relaxed">← {w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** כיוון אבחוני יחיד — עם שרשרת החשיבה ומה ששולל אותו. */
function DirectionCard({ d }) {
  const [open, setOpen] = useState(false);
  const c = d.confidence || {};

  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      <div className="p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            {d.must_not_miss && (
              <span className="text-[10px] font-bold bg-red-600 text-white px-1.5 py-0.5 rounded">
                אסור לפספס
              </span>
            )}
            <span className="font-semibold text-sm text-slate-900">{d.diagnosis_direction_he}</span>
          </div>
          <SuspicionBadge level={c.level} />
        </div>

        {/* ציון ביטחון לעולם לא בלי ההסבר שלו */}
        {c.confidence_reason_he && (
          <p className="text-xs text-slate-600 leading-relaxed">{c.confidence_reason_he}</p>
        )}

        {c.calibrated && (
          <div className="mt-2 flex items-start gap-1.5 bg-indigo-50 border border-indigo-200 rounded-lg px-2 py-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5" />
            <p className="text-[11px] text-indigo-800 leading-snug">
              הציון כויל אוטומטית מ־"{SUSPICION[c.proposed_by_model]?.label || c.proposed_by_model}"
              ל־"{SUSPICION[c.level]?.label || c.level}" ע"י הבדיקה הדטרמיניסטית.
            </p>
          </div>
        )}

        {d.consistency && d.consistency.ratio < 1 && (
          <div className="mt-2 flex items-start gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
            <Repeat className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-800 leading-snug">
              הופיע ב-{d.consistency.appeared_in} מתוך {d.consistency.of_samples} הרצות עצמאיות.
              {d.consistency.safety_protected && " נשמר למרות זאת בשל דגל בטיחותי — זהירות מוגברת."}
            </p>
          </div>
        )}

        <button
          onClick={() => setOpen(!open)}
          className="mt-2 flex items-center gap-1 text-[11px] font-medium text-indigo-600"
        >
          {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {open ? "הסתר" : "שרשרת החשיבה, תומך ושולל"}
        </button>
      </div>

      {open && (
        <div className="border-t border-slate-100 bg-slate-50/50 p-3 space-y-3">
          {d.reasoning_chain?.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-slate-500 mb-1.5">שרשרת חשיבה</p>
              <ol className="space-y-1.5">
                {d.reasoning_chain.map((s, i) => (
                  <li key={i} className="text-xs text-slate-700 leading-relaxed">
                    <span className="font-semibold text-slate-500">
                      {{ findings: "ממצאים", links: "קשרים", candidate_conclusion: "מסקנה אפשרית" }[s.stage] || s.stage}:
                    </span>{" "}
                    {s.statement_he}
                    {s.fact_refs?.length > 0 && (
                      <span className="text-[10px] text-slate-400 mr-1">[{s.fact_refs.join(", ")}]</span>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* תומך ושולל במשקל ויזואלי שווה — בכוונה */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-emerald-50 rounded-lg p-2">
              <p className="text-[11px] font-semibold text-emerald-700 mb-1">מה תומך</p>
              <ul className="space-y-0.5">
                {(d.supports_he || []).map((s, i) => (
                  <li key={i} className="text-[11px] text-emerald-900 leading-snug">· {s}</li>
                ))}
              </ul>
            </div>
            <div className="bg-rose-50 rounded-lg p-2">
              <p className="text-[11px] font-semibold text-rose-700 mb-1">מה ישלול</p>
              <ul className="space-y-0.5">
                {(d.refutes_he || []).map((s, i) => (
                  <li key={i} className="text-[11px] text-rose-900 leading-snug">· {s}</li>
                ))}
              </ul>
            </div>
          </div>

          {d.discriminating_test_he?.length > 0 && (
            <div className="bg-indigo-50 rounded-lg p-2">
              <p className="text-[11px] font-semibold text-indigo-700 mb-1">מה יכריע</p>
              <ul className="space-y-0.5">
                {d.discriminating_test_he.map((s, i) => (
                  <li key={i} className="text-[11px] text-indigo-900 leading-snug">← {s}</li>
                ))}
              </ul>
            </div>
          )}

          {d.source_anchors?.length > 0 && (
            <div className="text-[10px] text-slate-400 flex items-center gap-1 flex-wrap">
              <Anchor className="w-3 h-3 shrink-0" />
              <span>מקור:</span>
              {d.source_anchors.map((a, i) => (
                <React.Fragment key={a}>
                  {i > 0 && <span>·</span>}
                  <SourceAnchorLink anchor={a} />
                </React.Fragment>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * עוגן שניתן ללחוץ עליו ולקרוא את המקור.
 *
 * זה מה שהופך ציטוט לניתן-לבדיקה בפועל ולא רק להצהרה. anchorGuard כבר
 * חסם עוגן שאינו קיים; כאן הרופא/ה יכול/ה לראות בעיניים מה כתוב שם.
 * עוגנים שאינם של נלסון (מקור אחר) מוצגים כטקסט — אין לאן להוביל.
 */
function SourceAnchorLink({ anchor }) {
  const label = String(anchor).replace(/^nelson\./, "").replace(/[._]/g, " ");
  if (!String(anchor).startsWith("nelson.")) {
    return <span>{anchor}</span>;
  }
  return (
    <Link
      to={`/book?topic=${encodeURIComponent(anchor)}`}
      className="text-indigo-500 hover:text-indigo-700 underline decoration-dotted"
      title="פתח בספר"
    >
      {label}
    </Link>
  );
}

export default function GroundedInterpretation({ data }) {
  const [showRemoved, setShowRemoved] = useState(false);
  if (!data) return null;

  const isInsufficient = data.status === "insufficient";
  const directions = data.differential || data.directions || [];

  // "אסור לפספס" תמיד בראש — גם אם ה-rank נמוך.
  // זו הנקודה שבה מיון לפי סבירות הופך למסוכן.
  const sorted = [...directions].sort((a, b) => {
    if (a.must_not_miss !== b.must_not_miss) return a.must_not_miss ? -1 : 1;
    return (a.rank ?? 99) - (b.rank ?? 99);
  });

  return (
    <div className="space-y-4">
      {/* 1. בטיחות — תמיד ראשונה */}
      <RedFlags flags={data.red_flags} />

      {/* 2. סטטוס */}
      {isInsufficient ? (
        <InsufficientPanel data={data} />
      ) : (
        data.status === "degraded" && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <p className="text-xs font-semibold text-amber-800">
                חלק מהתוכן הוסר או הוחלש ע"י שכבת האימות
              </p>
            </div>
            {data.integrity?.removed_count > 0 && (
              <>
                <button
                  onClick={() => setShowRemoved(!showRemoved)}
                  className="text-[11px] text-amber-700 underline mt-1"
                >
                  {showRemoved ? "הסתר" : `הצג מה הוסר (${data.integrity.removed_count})`}
                </button>
                {showRemoved && (
                  <ul className="mt-2 space-y-1">
                    {data.integrity.removed_claims.map((r, i) => (
                      <li key={i} className="text-[11px] text-amber-900 bg-white/60 rounded px-2 py-1">
                        {r.text_he}
                        {r.reason_he && <span className="text-amber-700"> — {r.reason_he}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        )
      )}

      {/* 3. כיוונים */}
      {sorted.length > 0 && (
        <Section icon={GitBranch} title="כיוונים אבחוניים מעוגנים">
          <div className="space-y-2">
            {sorted.map((d, i) => <DirectionCard key={d.direction_id || i} d={d} />)}
          </div>
        </Section>
      )}

      {/* 4. סתירות — בולט, לא בתחתית */}
      {data.contradictions?.length > 0 && (
        <Section icon={AlertTriangle} title="סתירות שזוהו" tone="amber">
          <ul className="space-y-2">
            {data.contradictions.map((c, i) => (
              <li key={i} className="text-xs text-amber-900 leading-relaxed">
                · {c.description_he}
                {c.resolution_he && (
                  <span className="block text-[11px] text-amber-700 mt-0.5">{c.resolution_he}</span>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* 5. הממצאים הנצפים — מסומנים בבירור כלא-מעוגנים */}
      {data.observations?.length > 0 && (
        <Section icon={Eye} title="ממצאים שנצפו (קריאה ויזואלית)">
          <p className="text-[11px] text-slate-500 mb-2 leading-relaxed">
            {data.observation_note_he}
          </p>
          <ul className="space-y-1">
            {data.observations.map((o, i) => (
              <li key={i} className="text-xs text-slate-700 leading-relaxed">
                · {o.finding_he}
                {o.location_he && <span className="text-slate-500"> @ {o.location_he}</span>}
                {o.characteristics_he && <span className="text-slate-500"> — {o.characteristics_he}</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* 5ב. ספרות — ציטוטים ברי-לחיצה שנשלפו בפועל */}
      {(data.references?.length > 0 || data.evidence_meta) && (
        <Section icon={BookOpen} title="ספרות תומכת">
          {data.evidence_meta?.note_he && (
            <p className="text-[11px] text-slate-500 mb-2 leading-relaxed">
              {data.evidence_meta.note_he}
            </p>
          )}

          {data.references?.length > 0 ? (
            <ol className="space-y-2">
              {data.references.map((r) => (
                <li key={r.ref} className="text-xs leading-relaxed">
                  <span className="text-[10px] font-mono text-slate-400 ml-1">[{r.ref}]</span>
                  <span className="text-slate-800">{r.title}</span>
                  {r.year && <span className="text-slate-500"> ({r.year})</span>}
                  <span className="flex items-center gap-3 mt-0.5">
                    {r.url && (
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-indigo-600"
                      >
                        <ExternalLink className="w-3 h-3" /> PubMed
                      </a>
                    )}
                    {r.doi_url && (
                      <a
                        href={r.doi_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-indigo-600"
                      >
                        <ExternalLink className="w-3 h-3" /> DOI
                      </a>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-xs text-slate-500">לא שולבה ספרות בפלט זה.</p>
          )}

          {data.unused_literature?.items?.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              <p className="text-[11px] text-slate-500 mb-1">
                {data.unused_literature.note_he}
              </p>
              <ul className="space-y-1">
                {data.unused_literature.items.map((u) => (
                  <li key={u.ref} className="text-[11px] text-slate-600">
                    ·{" "}
                    {u.url ? (
                      <a href={u.url} target="_blank" rel="noopener noreferrer" className="text-indigo-600">
                        {u.title}
                      </a>
                    ) : u.title}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-[10px] text-slate-400 mt-3 leading-relaxed">
            המקורות נשלפו מ-PubMed ע"י המערכת ולא נכתבו ע"י מנוע הנימוק.
            שליפה אינה אימות רפואי של הטענה — יש לקרוא את המקור ולשקול את התאמתו למקרה.
          </p>
        </Section>
      )}

      {/* 6. מה לא ידוע — מוצג תמיד */}
      {data.unknowns_he?.length > 0 && !isInsufficient && (
        <Section icon={HelpCircle} title="מה לא ידוע / לא נכלל">
          <ul className="space-y-1">
            {data.unknowns_he.map((u, i) => (
              <li key={i} className="text-xs text-slate-600 leading-relaxed">· {u}</li>
            ))}
          </ul>
        </Section>
      )}

      {/* 7. השמטות שדווחו */}
      {data.coverage?.omitted?.length > 0 && (
        <Section icon={Info} title="הופעל על-ידי המנוע ולא נדון בפלט" tone="amber">
          <p className="text-[11px] text-amber-700 mb-2">{data.coverage.note_he}</p>
          <ul className="space-y-1">
            {data.coverage.omitted.map((o, i) => (
              <li key={i} className="text-xs text-amber-900">· {o.label_he} (חשד {o.suspicion})</li>
            ))}
          </ul>
        </Section>
      )}

      <p className="text-[11px] text-slate-400 leading-relaxed border-t border-slate-100 pt-3">
        {data.disclaimer_he}
      </p>
    </div>
  );
}
