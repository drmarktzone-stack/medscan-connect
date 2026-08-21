/**
 * MedScan — Deterministic Output Validators
 * מנגנון 1 (Grounding) · מנגנון 3 (Forced Reasoning Chain) · מנגנון 5 (Source Attribution)
 * ואכיפת גבול-המנדט (לעולם לא אבחנה סופית).
 *
 * כל הוולידטורים כאן דטרמיניסטיים. הם אינם שואלים את המודל אם הוא צודק —
 * הם בודקים תכונות מבניות שניתן להוכיח.
 *
 * חומרה:
 *   block      — הפלט לא יוצג כפי שהוא
 *   warn_high  — מוצג עם סימון בולט
 *   warn       — נרשם ליומן בקרה
 */

const V = (code, severity, message_he, extra = {}) => ({ code, severity, message_he, ...extra });

/** ─────────────────────────────────────────────────────────────────────────
 * 1. עיגון: כל מזהה שהמודל מצטט חייב להתקיים ב-FACT BLOCK.
 * ציטוט של F7 כשיש רק 5 עובדות הוא הזיה — והוא נפוץ.
 * ──────────────────────────────────────────────────────────────────────── */
export function validateReferences(output, factBlock) {
  const violations = [];
  const known = factBlock?.index ?? new Map();

  const checkRefs = (refs, where) => {
    for (const r of refs ?? []) {
      if (!known.has(r)) {
        violations.push(
          V('dangling_reference', 'block',
            `הפלט מצטט את המזהה ${r} ב-${where}, אך מזהה זה אינו קיים ב-FACT BLOCK.`,
            { ref: r, path: where })
        );
      }
    }
  };

  for (const c of output?.claims ?? []) checkRefs(c.fact_refs, `claims.${c.claim_id}`);
  for (const d of output?.directions ?? []) {
    checkRefs(d.fact_refs, `directions.${d.direction_id}`);
    (d.reasoning_chain ?? []).forEach((s, i) =>
      checkRefs(s.fact_refs, `directions.${d.direction_id}.reasoning_chain[${i}]`)
    );
  }
  for (const d of output?.differential ?? []) {
    checkRefs(d.fact_refs, `differential.${d.direction_id}`);
  }
  for (const t of output?.recommended_tests ?? []) checkRefs(t.fact_refs, 'recommended_tests');
  for (const m of output?.monitoring ?? []) checkRefs(m.fact_refs, 'monitoring');
  for (const a of output?.alerts ?? []) checkRefs(a.fact_refs, 'alerts');
  for (const r of output?.dynamic_recommendations ?? []) {
    checkRefs(r.fact_refs, 'dynamic_recommendations');
    checkRefs(r.deterministic_refs, 'dynamic_recommendations.deterministic');
  }
  checkRefs(output?.current_step?.deterministic_refs, 'current_step');

  return violations;
}

/** ─────────────────────────────────────────────────────────────────────────
 * 2. תיוג טענות: FACT ללא עוגן אינו FACT.
 * ANALYSIS חייב להצהיר על מה הוא נשען, אחרת אין דרך לבדוק אותו.
 * ──────────────────────────────────────────────────────────────────────── */
export function validateClaimTagging(output) {
  const violations = [];
  const seenIds = new Set();

  for (const c of output?.claims ?? []) {
    if (seenIds.has(c.claim_id)) {
      violations.push(V('duplicate_claim_id', 'warn',
        `מזהה טענה כפול: ${c.claim_id}.`, { claim_id: c.claim_id }));
    }
    seenIds.add(c.claim_id);

    const refs = c.fact_refs ?? [];

    if (c.claim_type === 'FACT') {
      if (!refs.length) {
        violations.push(V('fact_without_anchor', 'block',
          `טענה מסוג FACT ללא עוגן: "${truncate(c.text_he)}". עובדה ללא מקור אינה עובדה.`,
          { claim_id: c.claim_id }));
      }
      if (!(c.source_anchors ?? []).length) {
        violations.push(V('fact_without_source_attribution', 'warn_high',
          `טענת FACT ללא ייחוס מקור מפורש (source_anchor): "${truncate(c.text_he)}".`,
          { claim_id: c.claim_id }));
      }
    }

    if (c.claim_type === 'ANALYSIS' && !refs.length) {
      violations.push(V('analysis_without_basis', 'block',
        `הסקה (ANALYSIS) שאינה מצהירה על אילו עובדות היא נשענת: "${truncate(c.text_he)}".`,
        { claim_id: c.claim_id }));
    }

    if (c.claim_type === 'UNKNOWN' && refs.length) {
      violations.push(V('unknown_with_refs', 'warn',
        `טענת UNKNOWN שמצטטת מקורות — סתירה פנימית.`, { claim_id: c.claim_id }));
    }
  }

  return violations;
}

/** ─────────────────────────────────────────────────────────────────────────
 * 3. שרשרת חשיבה כפויה (מנגנון 3).
 * חייבת לכלול את שלושת השלבים, בסדר, ולהיות מעוגנת.
 * ──────────────────────────────────────────────────────────────────────── */
export function validateReasoningChain(output) {
  const violations = [];
  const REQUIRED = ['findings', 'links', 'candidate_conclusion'];

  const check = (dir, listName) => {
    const chain = dir?.reasoning_chain ?? [];
    const id = dir?.direction_id ?? '?';

    if (chain.length < 3) {
      violations.push(V('reasoning_chain_too_short', 'block',
        `שרשרת החשיבה של "${dir?.diagnosis_direction_he}" קצרה מ-3 שלבים. ` +
        `מסקנה ללא שרשרת חשיבה גלויה אינה ניתנת לביקורת.`,
        { direction_id: id, list: listName }));
      return;
    }

    const stages = chain.map((s) => s.stage);
    for (const req of REQUIRED) {
      if (!stages.includes(req)) {
        violations.push(V('reasoning_chain_missing_stage', 'block',
          `שרשרת החשיבה של "${dir?.diagnosis_direction_he}" חסרה את השלב "${req}".`,
          { direction_id: id, missing: req }));
      }
    }

    // סדר: ממצאים לפני קשרים לפני מסקנה
    const firstIdx = (stage) => stages.indexOf(stage);
    if (firstIdx('findings') > firstIdx('links') && firstIdx('links') !== -1) {
      violations.push(V('reasoning_chain_out_of_order', 'warn_high',
        `שרשרת החשיבה של "${dir?.diagnosis_direction_he}" מציגה קשרים לפני ממצאים.`,
        { direction_id: id }));
    }
    if (firstIdx('candidate_conclusion') < firstIdx('links')) {
      violations.push(V('reasoning_chain_out_of_order', 'warn_high',
        `שרשרת החשיבה של "${dir?.diagnosis_direction_he}" מגיעה למסקנה לפני שהציגה קשרים.`,
        { direction_id: id }));
    }

    const unanchored = chain.filter((s) => !(s.fact_refs ?? []).length);
    if (unanchored.length === chain.length) {
      violations.push(V('reasoning_chain_unanchored', 'block',
        `אף שלב בשרשרת החשיבה של "${dir?.diagnosis_direction_he}" אינו מעוגן במקור.`,
        { direction_id: id }));
    }
  };

  for (const d of output?.directions ?? []) check(d, 'directions');
  for (const d of output?.differential ?? []) check(d, 'differential');

  return violations;
}

/** ─────────────────────────────────────────────────────────────────────────
 * 4. כיוון חייב להיות ניתן להפרכה.
 * כיוון בלי "מה ישלול אותו" הוא אמונה, לא כיוון אבחוני.
 * ──────────────────────────────────────────────────────────────────────── */
export function validateFalsifiability(output) {
  const violations = [];
  const check = (d) => {
    if (!(d?.refutes_he ?? []).length) {
      violations.push(V('direction_not_falsifiable', 'block',
        `הכיוון "${d?.diagnosis_direction_he}" אינו מציין מה ישלול או יחליש אותו.`,
        { direction_id: d?.direction_id }));
    }
    if (!(d?.supports_he ?? []).length) {
      violations.push(V('direction_without_support', 'block',
        `הכיוון "${d?.diagnosis_direction_he}" אינו מציין אילו ממצאים תומכים בו.`,
        { direction_id: d?.direction_id }));
    }
  };
  for (const d of output?.directions ?? []) check(d);
  for (const d of output?.differential ?? []) check(d);
  return violations;
}

/** ─────────────────────────────────────────────────────────────────────────
 * 5. גבול המנדט: אסור ניסוח של אבחנה סופית או הוראת-טיפול חד-משמעית.
 * MedScan נותן כיוונים. הרגע שבו הניסוח הופך ל"האבחנה היא" הוא הרגע
 * שבו הרופא/ה מפסיק/ה לבקר את הפלט.
 *
 * ⚠ אין להשתמש כאן ב-`\b`: ב-JavaScript גבול-מילה מוגדר על ASCII בלבד,
 * ולכן דפוס כמו /ללא\s+ספק\b/ אינו נורה על טקסט עברי — הבדיקה נראית
 * קיימת אך שקטה. הגבול הנכון הוא מודע-יוניקוד: (?<!\p{L}) … (?!\p{L}) עם דגל u.
 * ──────────────────────────────────────────────────────────────────────── */
const HEB_B_OPEN = '(?<!\\p{L})';
const HEB_B_CLOSE = '(?!\\p{L})';
const heb = (source) => new RegExp(`${HEB_B_OPEN}(?:${source})${HEB_B_CLOSE}`, 'u');

const FORBIDDEN_PHRASINGS = [
  { re: heb('האבחנה\\s+היא'), why: 'ניסוח אבחנה סופית' },
  { re: heb('האבחנה\\s+הסופית'), why: 'ניסוח אבחנה סופית' },
  { re: heb('מאובחן(?:ת)?\\s+(?:עם|ב)'), why: 'ניסוח אבחנה סופית' },
  { re: heb('מדובר\\s+בוודאות'), why: 'ודאות שאינה נתמכת' },
  { re: heb('בוודאות\\s+(?:מדובר|זה)'), why: 'ודאות שאינה נתמכת' },
  { re: heb('ללא\\s+ספק'), why: 'ודאות שאינה נתמכת' },
  { re: heb('אין\\s+ספק'), why: 'ודאות שאינה נתמכת' },
  { re: heb('אין\\s+צורך\\s+ב(?:בירור|בדיקה|הערכה|מעקב)'), why: 'שלילת בירור — מחוץ למנדט' },
  { re: heb('ניתן\\s+לשחרר'), why: 'החלטת דיספוזיציה — מחוץ למנדט' },
  { re: heb('אפשר\\s+לשחרר'), why: 'החלטת דיספוזיציה — מחוץ למנדט' },
  { re: heb('אין\\s+צורך\\s+באשפוז'), why: 'החלטת דיספוזיציה — מחוץ למנדט' },
  { re: heb('תן\\s+ל(?:ילד|מטופל|תינוק)'), why: 'הוראת מתן ישירה — מחוץ למנדט' },
  { re: heb('יש\\s+לתת\\s+מיד'), why: 'הוראת מתן ישירה — מחוץ למנדט' },
  { re: heb('נשלל\\s+לחלוטין'), why: 'שלילה מוחלטת שאינה אפשרית' },
  { re: /definitive\s+diagnosis/iu, why: 'ניסוח אבחנה סופית' },
  { re: /rule[sd]?\s+out\s+completely/iu, why: 'שלילה מוחלטת שאינה אפשרית' },
];

export function validateScope(output) {
  const violations = [];
  const strings = collectStrings(output);

  for (const { path, text } of strings) {
    for (const f of FORBIDDEN_PHRASINGS) {
      if (f.re.test(text)) {
        violations.push(V('out_of_mandate_phrasing', 'block',
          `ניסוח החורג ממנדט הכלי (${f.why}) בשדה ${path}: "${truncate(text)}".`,
          { path, why: f.why }));
      }
    }
  }
  return violations;
}

/** ─────────────────────────────────────────────────────────────────────────
 * 6. פרוטוקול אי-ודאות (מנגנון 6).
 * קלט מורכב שמייצר אפס UNKNOWN הוא חשוד: המודל "ידע הכל".
 * ──────────────────────────────────────────────────────────────────────── */
export function validateUncertaintyDeclaration(output, factBlock) {
  const violations = [];
  const unknowns = output?.unknowns_he ?? [];
  const directions = [
    ...(output?.directions ?? []),
    ...(output?.differential ?? []),
  ];

  if (!unknowns.length && directions.length >= 2) {
    violations.push(V('no_uncertainty_declared', 'warn_high',
      'הפלט מציג מספר כיוונים אך אינו מצהיר על שום פער ידע. ' +
      'היעדר מוחלט של אי-ודאות בקלט קליני מורכב הוא סימן אזהרה.'));
  }

  if (factBlock?.isEmpty && directions.length) {
    violations.push(V('directions_without_facts', 'block',
      'הופקו כיוונים אבחוניים למרות ש-FACT BLOCK ריק. אין בסיס ידע לכיוונים אלה.'));
  }

  if (!factBlock?.hasVerifiedClinicalContent && directions.some(
    (d) => d?.confidence?.level === 'red'
  )) {
    violations.push(V('red_on_unverified_knowledge', 'block',
      'הופק חשד ברמה אדומה ללא ולו פריט ידע קליני מאומת אחד. ' +
      'חשד אדום מחייב עיגון מאומת (או דגל אדום בטיחותי).'));
  }

  return violations;
}

/** ─────────────────────────────────────────────────────────────────────────
 * 7. דיסקליימר חובה.
 * ──────────────────────────────────────────────────────────────────────── */
export function validateDisclaimer(output, expected) {
  if (!output?.disclaimer_he || output.disclaimer_he.trim().length < 20) {
    return [V('missing_disclaimer', 'block', 'הפלט אינו כולל דיסקליימר.',
      { auto_fix: { field: 'disclaimer_he', value: expected } })];
  }
  return [];
}

/** הרצת כל הוולידטורים הדטרמיניסטיים. */
export function runValidators({ output, factBlock, disclaimer }) {
  const violations = [
    ...validateReferences(output, factBlock),
    ...validateClaimTagging(output),
    ...validateReasoningChain(output),
    ...validateFalsifiability(output),
    ...validateScope(output),
    ...validateUncertaintyDeclaration(output, factBlock),
    ...validateDisclaimer(output, disclaimer),
  ];

  return {
    violations,
    blocking: violations.filter((v) => v.severity === 'block'),
    ok: !violations.some((v) => v.severity === 'block'),
  };
}

// ── עזרים ─────────────────────────────────────────────────────────────────
const SKIP_KEYS = new Set([
  'fact_refs', 'source_anchors', 'source_anchor', 'deterministic_refs',
  'based_on_patterns', 'involved_refs', 'claim_id', 'direction_id', 'step_id',
]);

function collectStrings(node, path = '', out = []) {
  if (node == null) return out;
  if (typeof node === 'string') { out.push({ path, text: node }); return out; }
  if (Array.isArray(node)) {
    node.forEach((v, i) => collectStrings(v, `${path}[${i}]`, out));
    return out;
  }
  if (typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (SKIP_KEYS.has(k)) continue;
      collectStrings(v, path ? `${path}.${k}` : k, out);
    }
  }
  return out;
}

function truncate(s, n = 90) {
  const t = String(s ?? '');
  return t.length > n ? `${t.slice(0, n)}…` : t;
}
