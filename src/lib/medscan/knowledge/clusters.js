/**
 * MedScan — קיבוץ ידע לאשכולות אימות
 *
 * אימות פריט-אחר-פריט אינו מעשי בקנה מידה של אלפי פריטים, והוא גם
 * לא נכון קלינית: כלל, דגל ואסוציאציה שנגזרו מאותו נושא נבדקים יחד,
 * כי הם חולקים הקשר. אשכול = כל מה שנגזר מנושא אחד בנלסון.
 *
 * ## מה זה לא עושה
 * זה **אינו** מאשר דבר. הוא מסדר את החומר כך שרופא/ה יוכל/תוכל לקרוא
 * אשכול שלם על מסך אחד — כל טענה לצד הציטוט שממנו נגזרה — ולחתום.
 * החתימה נשארת אנושית; זו כל ההגנה שיש כאן.
 */

export const CLUSTER_ENTITIES = [
  'KnowledgeTopic', 'RedFlag', 'ClinicalRule', 'LabPattern', 'Association',
];

const KEY_FIELD = {
  KnowledgeTopic: 'topic_key', ClinicalRule: 'rule_key', LabPattern: 'pattern_key',
  RedFlag: 'flag_key', Association: 'assoc_key',
};

const TITLE_FIELD = {
  KnowledgeTopic: 'topic_title_he', ClinicalRule: 'title_he', LabPattern: 'title_he',
  RedFlag: 'label_he', Association: 'anchor_finding_he',
};

/** הטענה עצמה — מה שהמערכת תאמר בשם הפריט הזה. */
const CLAIM_FIELD = {
  KnowledgeTopic: 'summary_he',
  ClinicalRule: 'conclusion_he',
  LabPattern: 'direction_he',
  RedFlag: 'action_he',
  Association: 'implies_he',
};

/** סדר התצוגה: בטיחות קודם, ואז מהמחייב לפחות-מחייב. */
const ENTITY_ORDER = {
  RedFlag: 0, ClinicalRule: 1, LabPattern: 2, Association: 3, KnowledgeTopic: 4,
};

export const ENTITY_LABEL_HE = {
  KnowledgeTopic: 'נושא', RedFlag: 'דגל אדום', ClinicalRule: 'כלל',
  LabPattern: 'דפוס מעבדה', Association: 'אסוציאציה',
};

/** הציטוט נשמר ב-review_note_he בפורמט `ציטוט מקור: "…"`. */
export function extractQuote(note) {
  if (!note) return null;
  const m = /ציטוט מקור:\s*"?([\s\S]+?)"?\s*$/.exec(String(note));
  return m ? m[1].trim() : String(note).trim();
}

function anchorOf(entity, row) {
  return entity === 'KnowledgeTopic' ? row.topic_key : row.source_anchor;
}

/**
 * מקבץ רשומות מכל הישויות לאשכולות לפי העוגן.
 *
 * @param {Record<string, object[]>} byEntity  { EntityName: rows[] }
 * @returns {object[]} אשכולות ממוינים: הכי הרבה טיוטות קודם
 */
export function buildClusters(byEntity) {
  const clusters = new Map();

  for (const entity of CLUSTER_ENTITIES) {
    for (const row of byEntity?.[entity] ?? []) {
      const anchor = anchorOf(entity, row);
      if (!anchor) continue;

      if (!clusters.has(anchor)) {
        clusters.set(anchor, {
          anchor,
          title_he: null,
          items: [],
          counts: { total: 0, draft: 0, verified: 0, flagged: 0 },
        });
      }
      const cluster = clusters.get(anchor);

      // כותרת האשכול מגיעה מהנושא עצמו, אם הוא קיים
      if (entity === 'KnowledgeTopic') cluster.title_he = row.topic_title_he ?? null;

      const status = row.verification_status ?? 'draft_needs_verification';
      cluster.items.push({
        id: row.id,
        entity,
        key: row[KEY_FIELD[entity]],
        title_he: row[TITLE_FIELD[entity]] ?? row[KEY_FIELD[entity]],
        claim_he: row[CLAIM_FIELD[entity]] ?? null,
        reasoning_he: row.clinical_reasoning_he ?? row.mechanism_he ?? row.reason_he ?? null,
        quote_he: extractQuote(row.review_note_he),
        suspicion: row.suspicion ?? row.severity ?? null,
        status,
        verified_by: row.verified_by ?? null,
        verified_at: row.verified_at ?? null,
        order: ENTITY_ORDER[entity] ?? 9,
      });

      cluster.counts.total += 1;
      if (status === 'verified') cluster.counts.verified += 1;
      else if (status === 'flagged') cluster.counts.flagged += 1;
      else cluster.counts.draft += 1;
    }
  }

  const out = [...clusters.values()];
  for (const c of out) {
    c.items.sort((a, b) => a.order - b.order || String(a.key).localeCompare(String(b.key)));
    c.title_he = c.title_he ?? labelFromAnchor(c.anchor);
  }

  // אשכולות עם הכי הרבה טיוטות ראשונים — שם נמצא הערך של הזמן
  out.sort((a, b) => b.counts.draft - a.counts.draft
    || String(a.anchor).localeCompare(String(b.anchor)));
  return out;
}

/** תווית קריאה מעוגן, כשאין רשומת נושא. */
export function labelFromAnchor(anchor) {
  return String(anchor ?? '').replace(/^nelson\./, '').replace(/[._]/g, ' ');
}

export function clusterStats(clusters) {
  let draft = 0, verified = 0, flagged = 0;
  for (const c of clusters ?? []) {
    draft += c.counts.draft;
    verified += c.counts.verified;
    flagged += c.counts.flagged;
  }
  return { clusters: clusters?.length ?? 0, draft, verified, flagged };
}

/**
 * פריטים באשכול שממתינים לאימות.
 *
 * פריט flagged אינו חוזר לתור: מי שסימן אותו כשגוי קיבל החלטה,
 * וביטולה צריך להיות פעולה מפורשת ולא תופעת לוואי של "אשר הכל".
 */
export function pendingItems(cluster) {
  return (cluster?.items ?? []).filter((i) => i.status === 'draft_needs_verification');
}
