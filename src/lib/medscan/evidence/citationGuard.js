/**
 * MedScan — Citation Guard
 *
 * ## הבעיה
 * ההזיה הנפוצה והמסוכנת ביותר בציטוטים אינה מזהה שבור. זה היה קל לתפוס.
 * היא **מזהה אמיתי שנפתח יפה, עם כותרת שאינה שייכת לו**. הרופא/ה לוחץ/ת,
 * רואה שהקישור עובד, ומניח/ה שהציטוט תקין. הבדיקה "האם ה-DOI נפתח"
 * נכשלת כאן לחלוטין.
 *
 * ## הפתרון כאן — היפוך הסדר
 * במקום לתת למודל לייצר ציטוט ואז לאמת אותו, אנחנו **שולפים קודם**
 * ונותנים למודל רק להפנות:
 *
 *   שליפה → L# ב-FACT BLOCK → המודל מפנה ל-L# → הקוד מרחיב ל-PMID/DOI
 *
 * המודל אף פעם לא כותב PMID או DOI. הוא כותב "L2". הקוד יודע מה זה L2,
 * כי הוא זה ששלף אותו.
 *
 * זה הופך ציטוט מומצא מ**ניתן-לגילוי** ל**בלתי-אפשרי**. וזה ההבדל
 * המהותי בין הכלי הזה לכלי שאומר "אמת מול מקורות מוסמכים" ולא מספק אותם.
 *
 * ## מה עדיין נבדק כאן
 * גם עם ההיפוך, המודל עלול לכתוב מזהה מתוך זיכרון ההכשרה שלו בתוך
 * טקסט חופשי. הבדיקה הזו חוסמת בדיוק את זה.
 */

import { collectProseStrings } from '../antihallucination/numericGuard.js';

/** דפוסי מזהי-ציטוט שעלולים להופיע בטקסט חופשי. */
const CITATION_PATTERNS = [
  { re: /\bPMID:?\s*(\d{6,9})\b/gi, kind: 'pmid', extract: (m) => m[1] },
  { re: /\bPMC(\d{6,9})\b/gi, kind: 'pmcid', extract: (m) => `PMC${m[1]}` },
  { re: /\b(10\.\d{4,9}\/[^\s,;)\]]+)/g, kind: 'doi', extract: (m) => m[1].replace(/[.,;]$/, '') },
  { re: /\barXiv:\s*(\d{4}\.\d{4,5})/gi, kind: 'arxiv', extract: (m) => m[1] },
];

/**
 * הבדיקה.
 *
 * @param {object} output
 * @param {object} factBlock  תוצר buildFactBlock() — factBlock.citations היא הקבוצה המותרת
 * @returns {{ok: boolean, violations: object[], blocked: object[]}}
 */
export function citationGuard(output, factBlock) {
  const allowed = new Set();
  for (const c of factBlock?.citations ?? []) allowed.add(String(c).toLowerCase());

  const violations = [];
  const seen = new Set();

  for (const { path, text } of collectProseStrings(output)) {
    for (const { re, kind, extract } of CITATION_PATTERNS) {
      const pattern = new RegExp(re.source, re.flags);
      let m;
      while ((m = pattern.exec(text)) !== null) {
        const id = String(extract(m)).toLowerCase();
        if (allowed.has(id)) continue;

        const dedupeKey = `${kind}|${id}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        violations.push({
          code: 'fabricated_citation',
          severity: 'block',
          kind,
          identifier: extract(m),
          path,
          message_he:
            `הפלט מכיל מזהה ציטוט (${kind.toUpperCase()}: ${extract(m)}) שלא נשלף ע"י המערכת. ` +
            'המודל אינו רשאי לכתוב מזהי ציטוט — הוא רשאי רק להפנות ל-L# שנשלף בפועל. ' +
            'מזהה שנכתב מהזיכרון הוא הזיה גם אם הוא במקרה קיים.',
        });

        if (pattern.lastIndex === m.index) pattern.lastIndex += 1;
      }
    }
  }

  const blocked = violations.filter((v) => v.severity === 'block');
  return { ok: blocked.length === 0, violations, blocked };
}

/**
 * מרחיב הפניות L# לציטוט מלא ובר-לחיצה.
 *
 * זה מה שהרופא/ה רואה בסוף: לא "L2" אלא הפניה מלאה עם קישור.
 * ההרחבה נעשית **בקוד** מתוך מה שנשלף — ולכן היא נכונה בהגדרה.
 */
export function expandCitations({ output, factBlock }) {
  const used = new Map();

  const collectRefs = (refs) => {
    for (const r of refs ?? []) {
      if (!String(r).startsWith('L')) continue;
      const fact = factBlock?.index?.get(r);
      if (fact && fact.kind === 'literature') used.set(r, fact);
    }
  };

  for (const c of output?.claims ?? []) collectRefs(c.fact_refs);
  for (const d of [...(output?.directions ?? []), ...(output?.differential ?? [])]) {
    collectRefs(d.fact_refs);
    for (const s of d.reasoning_chain ?? []) collectRefs(s.fact_refs);
  }
  for (const t of output?.recommended_tests ?? []) collectRefs(t.fact_refs);
  for (const a of output?.alerts ?? []) collectRefs(a.fact_refs);

  const references = [...used.entries()]
    .sort((a, b) => Number(a[0].slice(1)) - Number(b[0].slice(1)))
    .map(([ref, f]) => ({
      ref,
      pmid: f.pmid,
      doi: f.doi,
      title: extractTitle(f.text),
      url: f.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${f.pmid}/` : null,
      doi_url: f.doi ? `https://doi.org/${f.doi}` : null,
      year: f.year,
      // מוצג במפורש: מה שנשלף הוא מקור אמיתי, אך לא עבר אימות רפואי
      // כפריט KB. שני הדברים שונים ואסור לבלבל ביניהם.
      status_he: 'נשלף מ-PubMed. אינו מהווה תחליף לאימות רפואי של הטענה.',
    }));

  return references;
}

function extractTitle(text) {
  const m = /^"([^"]+)"/.exec(String(text ?? ''));
  return m ? m[1] : String(text ?? '').split(' — ')[0];
}

/**
 * ספרות שנשלפה אך לא נוצלה — מידע לרופא/ה.
 * אם המערכת מצאה סקירה שיטתית רלוונטית והמודל התעלם ממנה, כדאי לדעת.
 */
export function unusedLiterature({ output, factBlock }) {
  const usedRefs = new Set(expandCitations({ output, factBlock }).map((r) => r.ref));
  return (factBlock?.facts ?? [])
    .filter((f) => f.kind === 'literature' && !usedRefs.has(f.id))
    .map((f) => ({
      ref: f.id,
      pmid: f.pmid,
      title: extractTitle(f.text),
      url: f.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${f.pmid}/` : null,
    }));
}
