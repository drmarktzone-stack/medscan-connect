/**
 * MedScan — Anchor & Entity Guard
 * חיזוק מנגנון 1 (Grounding) ומנגנון 5 (Source Attribution)
 *
 * שני חורים שנותרו פתוחים אחרי `validators.js`, ושניהם מייצרים בדיוק
 * את סוג ההזיה המסוכן ביותר — כזו שנשמעת סמכותית:
 *
 * 1. **עוגן מומצא.** בדקנו ש-F# קיים, אך לא ש-`source_anchor` מצביע
 *    לנושא שקיים באמת. מודל שכותב `nelson.id.kawasaki` על נושא שלא
 *    יובא מייצר ציטוט מזויף — והציטוט הוא בדיוק מה שגורם לרופא/ה
 *    להאמין לטענה בלי לבדוק.
 *
 * 2. **ישות מומצאת.** שם תרופה, שם חיידק, שם קריטריון או שם סקאלה
 *    שאינו במקור. "לפי קריטריוני X" נשמע מבוסס לחלוטין גם כשקריטריוני X
 *    אינם קיימים או אינם רלוונטיים. numericGuard תופס מספרים; הוא אינו
 *    תופס שמות.
 */

import { collectProseStrings } from './numericGuard.js';
import { isLiteratureShapedAnchor, parseLiteratureCitation } from '../knowledge/approvedLiterature.js';

/* ═══════════════════════════════════════════════════════════════════════
 * 1. עוגנים — כל source_anchor חייב להיפתר לפריט שקיים
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * @param {object} output
 * @param {object} factBlock  תוצר buildFactBlock() — factBlock.anchors הוא הקבוצה המותרת
 * @param {Set<string>|string[]} [knownTopicKeys] topic_key מלא מ-KnowledgeTopic (אופציונלי, מרחיב)
 */
export function validateAnchors(output, factBlock, knownTopicKeys = null) {
  const allowed = new Set(factBlock?.anchors ?? []);
  // נושאים מוכרים מה-KB מותרים גם אם לא נכנסו ל-FACT BLOCK בריצה הזו,
  // אך רק אם הועברו במפורש. ברירת המחדל היא הקבוצה הסגורה — מחמירה יותר.
  if (knownTopicKeys) for (const k of knownTopicKeys) allowed.add(k);

  const violations = [];

  const check = (anchors, where) => {
    for (const a of anchors ?? []) {
      if (!a) continue;
      if (allowed.has(a)) continue;
      violations.push({
        code: 'fabricated_anchor',
        severity: 'block',
        anchor: a,
        path: where,
        message_he:
          `הפלט מייחס טענה למקור "${a}" ב-${where}, אך עוגן זה אינו קיים ` +
          `ב-Knowledge Base ולא סופק בהקשר. ציטוט מקור שאינו קיים מסוכן ` +
          `יותר מהיעדר ציטוט, כי הוא מונע בדיקה.`,
      });
    }
  };

  for (const c of output?.claims ?? []) check(c.source_anchors, `claims.${c.claim_id}`);
  for (const d of output?.directions ?? []) check(d.source_anchors, `directions.${d.direction_id}`);
  for (const d of output?.differential ?? []) check(d.source_anchors, `differential.${d.direction_id}`);
  for (const t of output?.recommended_tests ?? []) check([t.source_anchor], 'recommended_tests');
  for (const p of output?.patterns_detected ?? []) check([p.source_anchor], 'patterns_detected');
  for (const f of output?.red_flags ?? []) {
    // דגל שהמודל הציע כבר מסומן בנפרד; לא כופלים עליו הפרה
    if (f.unverified_model_flag) continue;
    check([f.source_anchor], 'red_flags');
  }
  check([output?.source_anchor], 'root');

  violations.push(...validateLiteratureAnchors(output, factBlock));

  return violations;
}

function collectAnchors(item) {
  if (!item || typeof item !== 'object') return [];
  const out = [];
  for (const a of item.source_anchors ?? []) if (a) out.push(a);
  if (item.source_anchor) out.push(item.source_anchor);
  return out;
}

function isMeasurementOnlyClaim(claim, factBlock) {
  if (claim?.claim_type !== 'FACT') return false;
  const refs = claim.fact_refs ?? [];
  if (!refs.length) return false;
  return refs.every((r) => {
    const f = factBlock?.index?.get(r);
    return f && (f.kind === 'patient' || f.kind === 'deterministic');
  });
}

/**
 * כל כיוון דיאגנוסטי / המלצה טיפולית / המלצת מעבדה חייב עוגן
 * נלסון (פרק+סעיף) או חוזר משרד הבריאות. פלט ללא עיגון — נחסם.
 */
export function validateLiteratureAnchors(output, factBlock) {
  const violations = [];

  const requireLiterature = (anchors, where, { allowMeasurementFact = false } = {}) => {
    const list = (anchors ?? []).filter(Boolean);
    if (!list.length) {
      if (allowMeasurementFact) return;
      violations.push({
        code: 'missing_literature_anchor',
        severity: 'block',
        path: where,
        message_he:
          `הפלט ב-${where} אינו מעוגן לפרק/סעיף במקור מאושר ` +
          `(Nelson Textbook, חוזר משרד הבריאות, AES, ILAE, OMIM, Orphanet, ACR, DSM-5-TR, AAP, ICHD-3, Rome IV, WHO או CDC). ` +
          `פלט דיאגנוסטי או המלצה ללא עיגון נחסם.`,
      });
      return;
    }
    const shaped = list.filter(isLiteratureShapedAnchor);
    if (!shaped.length) {
      violations.push({
        code: 'unapproved_literature_corpus',
        severity: 'block',
        path: where,
        anchors: list,
        message_he:
          `העוגנים ב-${where} אינם ממקור מאושר (Nelson / חוזר משרד הבריאות / AES / ILAE / OMIM / Orphanet / ACR / DSM / AAP / ICHD / Rome / WHO / CDC) ` +
          `(${list.join(', ')}). ציטוט ממקור אחר אינו מחליף עיגון מאושר.`,
      });
      return;
    }
    for (const a of shaped) {
      const citation = parseLiteratureCitation(a);
      if (!citation || !citation.chapter || !citation.section) {
        violations.push({
          code: 'incomplete_literature_locator',
          severity: 'block',
          path: where,
          anchor: a,
          message_he:
            `העוגן "${a}" ב-${where} אינו מצביע על פרק וסעיף ספציפיים.`,
        });
      }
    }
  };

  for (const d of output?.directions ?? []) {
    requireLiterature(collectAnchors(d), `directions.${d.direction_id}`);
  }
  for (const d of output?.differential ?? []) {
    requireLiterature(collectAnchors(d), `differential.${d.direction_id}`);
  }
  for (const t of output?.recommended_tests ?? []) {
    requireLiterature(collectAnchors(t), 'recommended_tests');
  }
  for (const r of output?.dynamic_recommendations ?? []) {
    requireLiterature(collectAnchors(r), 'dynamic_recommendations');
  }
  for (const m of output?.monitoring ?? []) {
    if (m?.recommendation_he || m?.action_he) {
      requireLiterature(collectAnchors(m), 'monitoring');
    }
  }
  for (const c of output?.claims ?? []) {
    if (!c?.claim_type || c.claim_type === 'UNKNOWN') continue;
    if (c.claim_type === 'FACT' || c.claim_type === 'ANALYSIS' || c.claim_type === 'RECOMMENDATION') {
      requireLiterature(collectAnchors(c), `claims.${c.claim_id}`, {
        allowMeasurementFact: isMeasurementOnlyClaim(c, factBlock),
      });
    }
  }

  return violations;
}

/* ═══════════════════════════════════════════════════════════════════════
 * 2. ישויות — שמות שלא הופיעו במקור
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * מונחי מערכת ומונחים גנריים שמותרים תמיד.
 * שמור בכוונה קצר — כל תוספת כאן היא הרחבה של משטח-ההזיה.
 */
const ALLOWED_TERMS = new Set([
  'medscan', 'nelson', 'json', 'llm',
]);

/**
 * הקשרים שהופכים ישות מומצאת מאזהרה לחסימה.
 * שם שמופיע בהקשר של מתן טיפול או קריטריון אבחוני הוא הסיכון האמיתי.
 */
const CRITICAL_ENTITY_CONTEXT = [
  /לפי\s+קריטריוני/, /קריטריוני\s+/, /criteria/i,
  /סקאלת|סקור|score\b/i, /לפי\s+מדד/,
  /טיפול\s+ב|לשקול\s+מתן|אנטיביוטיק|antibiotic/i,
  /תרופ|drug|medication/i,
  /לפי\s+הנחיות|guideline/i,
];

/**
 * מחלץ אסימוני-שם בכתב לטיני. שמות תרופות, חיידקים, קריטריונים
 * וסקאלות נכתבים כמעט תמיד בלטינית גם בתוך טקסט עברי — וזה מה
 * שהופך את הבדיקה הזו לישימה למרות שהפלט עברי.
 */
function extractLatinTerms(text) {
  const out = [];
  const re = /[A-Za-z][A-Za-z'-]{3,}/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push({ term: m[0], index: m.index });
  }
  return out;
}

function buildAllowedTermSet(factBlock, extraTerms = []) {
  const allowed = new Set(ALLOWED_TERMS);

  const harvest = (text) => {
    for (const { term } of extractLatinTerms(String(text ?? ''))) {
      allowed.add(term.toLowerCase());
    }
  };

  for (const f of factBlock?.facts ?? []) {
    harvest(f.text);
    if (f.source_anchor) harvest(f.source_anchor);
    if (f.entity_key) harvest(f.entity_key);
  }
  for (const t of extraTerms) harvest(t);

  return allowed;
}

/**
 * @param {object} output
 * @param {object} factBlock
 * @param {object} [opts]
 * @param {string[]} [opts.extraTerms] מונחים נוספים מותרים — למשל שמות
 *        תרופות מ-DoseRecord מאומתות שסופקו לריצה
 */
export function entityGuard(output, factBlock, opts = {}) {
  const allowed = buildAllowedTermSet(factBlock, opts.extraTerms ?? []);
  const violations = [];
  const seen = new Set();

  for (const { path, text } of collectProseStrings(output)) {
    for (const { term, index } of extractLatinTerms(text)) {
      const key = term.toLowerCase();
      if (allowed.has(key)) continue;

      const dedupeKey = `${key}|${path}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const start = Math.max(0, index - 40);
      const context = text.slice(start, Math.min(text.length, index + term.length + 40));
      const critical = CRITICAL_ENTITY_CONTEXT.some((re) => re.test(context));

      violations.push({
        code: 'unsourced_entity',
        severity: critical ? 'block' : 'warn_high',
        term,
        path,
        context: context.trim(),
        message_he:
          `השם "${term}" מופיע בפלט אך אינו מופיע באף מקור שסופק. ` +
          (critical
            ? 'ההקשר הוא טיפולי/אבחוני — שם מומצא בהקשר זה נשמע מבוסס ולכן מסוכן במיוחד.'
            : 'ייתכן שזהו מונח לגיטימי, אך הוא אינו מעוגן.'),
      });
    }
  }

  const blocked = violations.filter((v) => v.severity === 'block');
  return { ok: blocked.length === 0, violations, blocked };
}

/** הרצה משולבת. */
export function runAnchorGuards({ output, factBlock, knownTopicKeys = null, extraTerms = [] }) {
  const anchorViolations = validateAnchors(output, factBlock, knownTopicKeys);
  const entity = entityGuard(output, factBlock, { extraTerms });

  const violations = [...anchorViolations, ...entity.violations];
  return {
    violations,
    blocking: violations.filter((v) => v.severity === 'block'),
    ok: !violations.some((v) => v.severity === 'block'),
  };
}
