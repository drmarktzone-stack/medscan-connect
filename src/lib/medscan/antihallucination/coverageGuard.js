/**
 * MedScan — Coverage / Omission Guard
 *
 * הפער שכל שאר השכבות אינן סוגרות: הן חוסמות **המצאה**, לא **השמטה**.
 *
 * מודל שנותן שלושה כיוונים נכונים ומעוגנים היטב, ומשמיט את הרביעי —
 * זה שהמנוע הדטרמיניסטי סימן כאדום — יעבור את כל הבדיקות שבנינו.
 * הפלט יהיה מדויק, מעוגן, מכויל, וחסר את הדבר החשוב ביותר.
 *
 * ברפואת ילדים זה מסוכן יותר מהמצאה: המצאה הרופא/ה מזהה כי היא נראית
 * מוזרה; השמטה נראית בדיוק כמו תשובה שלמה.
 *
 * העיקרון: המנוע הדטרמיניסטי כבר מצא מה רלוונטי — לפני שהמודל דיבר.
 * אם פריט KB בחשד גבוה הופעל ואף כיוון בפלט אינו מתייחס אליו,
 * זו השמטה שניתן להוכיח, לא לנחש.
 */

/** דירוג חומרה לפי רמת החשד של הפריט שהושמט. */
const SEVERITY_BY_SUSPICION = {
  red: 'block',
  yellow: 'warn_high',
  green: 'warn',
};

/**
 * אילו מזהי-עובדה (F#) הפלט "נגע" בהם בפועל.
 * נאסף מכל מקום שבו הפלט מצהיר על עיגון.
 */
function collectTouchedRefs(output) {
  const touched = new Set();
  const add = (refs) => { for (const r of refs ?? []) touched.add(r); };

  for (const c of output?.claims ?? []) add(c.fact_refs);
  for (const d of [...(output?.directions ?? []), ...(output?.differential ?? [])]) {
    add(d.fact_refs);
    for (const s of d.reasoning_chain ?? []) add(s.fact_refs);
  }
  for (const t of output?.recommended_tests ?? []) add(t.fact_refs);
  for (const m of output?.monitoring ?? []) add(m.fact_refs);
  for (const a of output?.alerts ?? []) add(a.fact_refs);
  for (const r of output?.dynamic_recommendations ?? []) { add(r.fact_refs); add(r.deterministic_refs); }
  for (const c of output?.contradictions ?? []) add(c.involved_refs);

  return touched;
}

/** אילו pattern_key הפלט הזכיר. */
function collectTouchedPatterns(output) {
  const touched = new Set();
  for (const p of output?.patterns_detected ?? []) {
    if (p.pattern_key) touched.add(p.pattern_key);
  }
  for (const d of [...(output?.directions ?? []), ...(output?.differential ?? [])]) {
    for (const k of d.based_on_patterns ?? []) touched.add(k);
  }
  return touched;
}

/**
 * הבדיקה המרכזית.
 *
 * @param {object} params
 * @param {object} params.output
 * @param {object} params.factBlock
 * @param {object} params.grounding תוצר runRulesEngine()
 * @returns {{violations: object[], blocking: object[], ok: boolean, omitted: object[]}}
 */
export function checkCoverage({ output, factBlock, grounding = {} }) {
  const touchedRefs = collectTouchedPatternsSafe(output);
  const violations = [];
  const omitted = [];

  // מיפוי הפוך: entity_key → F#
  const factByEntity = new Map();
  for (const f of factBlock?.facts ?? []) {
    if (f.kind === 'kb' && f.entity_key) factByEntity.set(f.entity_key, f);
  }

  /** פריט KB נחשב "מכוסה" אם הפלט הצביע על ה-F# שלו או על ה-key שלו. */
  const isCovered = (entityKey) => {
    if (!entityKey) return true; // בלי מזהה אין מה לבדוק
    if (touchedRefs.patterns.has(entityKey)) return true;
    const fact = factByEntity.get(entityKey);
    return Boolean(fact && touchedRefs.refs.has(fact.id));
  };

  const inspect = (items, kind, labelOf, keyOf) => {
    for (const item of items ?? []) {
      const key = keyOf(item);
      if (isCovered(key)) continue;

      const suspicion = item.suspicion ?? 'yellow';
      const severity = SEVERITY_BY_SUSPICION[suspicion] ?? 'warn';

      const record = {
        code: 'omitted_grounding',
        severity,
        kind,
        entity_key: key,
        suspicion,
        label_he: labelOf(item),
        source_anchor: item.source_anchor ?? null,
        message_he:
          `המנוע הדטרמיניסטי הפעיל ${kind} בחשד "${suspicion}" — ` +
          `"${labelOf(item)}" — אך אף כיוון בפלט אינו מתייחס אליו. ` +
          (severity === 'block'
            ? 'השמטה של ממצא בחשד אדום חמורה מהמצאה: היא נראית כמו תשובה שלמה.'
            : 'ייתכן שההשמטה מוצדקת, אך היא חייבת להיאמר במפורש ולא להיעלם.'),
      };

      violations.push(record);
      omitted.push(record);
    }
  };

  inspect(
    grounding.matchedPatterns, 'דפוס מעבדה',
    (p) => p.title_he ?? p.pattern_key, (p) => p.pattern_key
  );
  inspect(
    grounding.firedRules, 'כלל קליני',
    (r) => r.title_he ?? r.rule_key, (r) => r.rule_key
  );
  inspect(
    grounding.associations, 'אסוציאציה',
    (a) => `${a.anchor_finding_he} → ${a.implies_he}`, (a) => a.assoc_key
  );

  // ── כללים ש"כמעט התקיימו" בחשד אדום ────────────────────────────────────
  // אלה לא הופעלו, ולכן אינם השמטה של ממצא. אבל אם כלל אדום היה קרוב
  // להתקיים ואיש לא הזכיר אותו — הרופא/ה צריך/ה לדעת מה חסר כדי להכריע.
  for (const nm of grounding.nearMissRules ?? []) {
    if (nm.suspicion !== 'red') continue;
    const mentioned = mentionsText(output, nm.title_he) ||
      (output?.unknowns_he ?? []).some((u) => overlaps(u, nm.title_he));
    if (mentioned) continue;

    violations.push({
      code: 'omitted_near_miss',
      severity: 'warn_high',
      kind: 'כלל שכמעט התקיים',
      entity_key: nm.rule_key,
      suspicion: 'red',
      label_he: nm.title_he,
      message_he:
        `"${nm.title_he}" — ${nm.matched_count} מתוך ${nm.total_conditions} תנאים ` +
        `התקיימו, בחשד אדום, והפלט אינו מזכיר זאת. חסר: ${(nm.unmet ?? []).join(', ')}. ` +
        'קריטריון שכמעט מתקיים הוא מידע קליני, לא רעש.',
    });
  }

  // ── מדדים שלא היה להם טווח ייחוס ───────────────────────────────────────
  // אם ערכים לא נורמלו והפלט לא מצהיר על כך, נוצר רושם של כיסוי מלא.
  const missing = grounding.missingRanges ?? [];
  if (missing.length) {
    const declared = (output?.unknowns_he ?? []).some(
      (u) => missing.some((a) => String(u).includes(a))
    );
    if (!declared) {
      violations.push({
        code: 'undeclared_data_gap',
        severity: 'warn_high',
        kind: 'פער נתונים',
        label_he: missing.join(', '),
        message_he:
          `המדדים ${missing.join(', ')} לא נורמלו (אין טווח ייחוס מאומת) ולא השתתפו ` +
          'בניתוח, אך הפלט אינו מצהיר על כך. פער שלא הוצהר נקרא ככיסוי מלא.',
        auto_fix: {
          field: 'unknowns_he',
          append: `המדדים הבאים לא נכללו בניתוח מכיוון שלא נטען עבורם טווח ייחוס מאומת: ${missing.join(', ')}.`,
        },
      });
    }
  }

  return {
    violations,
    blocking: violations.filter((v) => v.severity === 'block'),
    omitted,
    ok: !violations.some((v) => v.severity === 'block'),
  };
}

function collectTouchedPatternsSafe(output) {
  return {
    refs: collectTouchedRefs(output),
    patterns: collectTouchedPatterns(output),
  };
}

/** האם הפלט מזכיר טקסט מסוים בכלל (התאמה גסה בכוונה). */
function mentionsText(output, needle) {
  if (!needle) return true;
  const hay = JSON.stringify(output ?? {});
  return overlaps(hay, needle);
}

function overlaps(haystack, needle) {
  const n = String(needle ?? '').trim();
  if (n.length < 3) return false;
  if (String(haystack).includes(n)) return true;
  // התאמה חלקית: לפחות שתי מילים משמעותיות מהכותרת
  const words = n.split(/\s+/).filter((w) => w.length >= 3);
  const hits = words.filter((w) => String(haystack).includes(w)).length;
  return words.length > 0 && hits >= Math.min(2, words.length);
}

/**
 * מחיל את התיקונים האוטומטיים הבטוחים.
 * רק **הוספת הצהרות** — לעולם לא הסרה ולא הרגעה.
 */
export function applyCoverageAutoFixes(output, coverage) {
  const clone = structuredClone(output);
  for (const v of coverage.violations ?? []) {
    if (v.auto_fix?.field === 'unknowns_he' && v.auto_fix.append) {
      clone.unknowns_he = [...(clone.unknowns_he ?? []), v.auto_fix.append];
    }
  }

  // כל השמטה שאינה חוסמת מוצהרת בפלט — הרופא/ה רואה מה לא כוסה
  const softOmissions = (coverage.omitted ?? []).filter((o) => o.severity !== 'block');
  if (softOmissions.length) {
    clone.unknowns_he = [
      ...(clone.unknowns_he ?? []),
      ...softOmissions.map(
        (o) => `לא נדון בפלט למרות שהופעל ע"י המנוע: ${o.label_he} (חשד ${o.suspicion}).`
      ),
    ];
  }

  return clone;
}
