/**
 * MedScan — Ingestion Runner
 *
 * מריץ חילוץ ידע על ספר הטבלאות, פרק-אחר-פרק.
 *
 * ## עקרונות ההרצה
 * 1. **מצטבר.** כל קטע נשמר מיד עם סיומו. ריצה שנעצרה באמצע לא
 *    מאבדת את מה שכבר הושג — וגם לא את מה ששילמת עליו.
 * 2. **ניתן לעצירה.** `shouldStop` נבדק בין קטעים.
 * 3. **דילוג על מה שכבר יובא.** הרצה חוזרת אינה משכפלת.
 * 4. **כשל בקטע אינו מפיל את הפרק.** נרשם וממשיכים.
 */

import { chunksForChapter, bookToChunks, topicKeyFor } from './bookParser.js';
import {
  chunkText, detectSeams, validateExtraction, extractFromChunk, CHUNK_CHARS,
} from './extractionCore.js';
import { saveExtraction, NATURAL_KEY } from './knowledgeIngestion.js';
import { createInvokeLLM, listKbEntity } from '../llmAdapter.js';

/**
 * בונה אינדקס של כל המפתחות הקיימות ב-KB, פעם אחת להרצה.
 * בלעדיו כל שמירה היתה דורשת שאילתה נפרדת.
 */
async function loadExistingKeys() {
  const keys = new Set();
  for (const [entity, field] of Object.entries(NATURAL_KEY)) {
    for (const row of await listKbEntity(entity)) {
      if (row?.[field]) keys.add(`${entity}:${row[field]}`);
    }
  }
  return keys;
}

/**
 * מקבץ קטעים לפי נושא, ומפצל נושא ארוך לקטעי-חילוץ.
 * הקיבוץ לפי נושא חשוב: הוא נותן למחלץ הקשר מספיק כדי לזהות
 * שהתאים שייכים לאותו מצב קליני, בלי לערבב בין נושאים.
 */
export function buildExtractionUnits(chunks) {
  const byTopic = new Map();
  for (const c of chunks) {
    const key = `${c.chapter}||${c.topic}`;
    if (!byTopic.has(key)) byTopic.set(key, []);
    byTopic.get(key).push(c);
  }

  const units = [];
  for (const [, group] of byTopic) {
    const { chapter, topic, chapter_no } = group[0];
    const pages = [...new Set(group.map((c) => c.page).filter(Boolean))];

    // כותרת-הסעיף נשמרת בטקסט — היא ההקשר של התא
    const body = group
      .map((c) => (c.section ? `[${c.section}]\n${c.text}` : c.text))
      .join('\n\n');

    for (const [i, part] of chunkText(body, CHUNK_CHARS).entries()) {
      units.push({
        chapter, chapter_no, topic,
        topic_key: topicKeyFor(chapter, topic),
        pages,
        part: i + 1,
        text: part,
        hint: `נלסון · ${chapter} › ${topic}${pages.length ? ` (עמ׳ ${pages.join(', ')})` : ''}`,
      });
    }
  }
  return units;
}

/** אומדן לפני הרצה — כמה קריאות ומה הן מכסות. */
export function estimateRun(book, chapterNo = null) {
  const chunks = chapterNo ? chunksForChapter(book, chapterNo) : bookToChunks(book);
  const units = buildExtractionUnits(chunks);
  return {
    chunks: chunks.length,
    units: units.length,
    llm_calls: units.length,
    chars: units.reduce((a, u) => a + u.text.length, 0),
    topics: new Set(units.map((u) => u.topic_key)).size,
  };
}

/**
 * מריץ חילוץ.
 *
 * @param {object} p
 * @param {object} p.book
 * @param {number|null} p.chapterNo  null = כל הספר
 * @param {function} p.onProgress    ({done,total,unit,result}) => void
 * @param {function} p.shouldStop    () => boolean
 * @param {boolean} p.dryRun         חילוץ בלי שמירה — לבדיקת איכות
 */
export async function runIngestion({
  book, chapterNo = null, onProgress, shouldStop = () => false, dryRun = false,
}) {
  const invokeLLM = createInvokeLLM();
  const chunks = chapterNo ? chunksForChapter(book, chapterNo) : bookToChunks(book);
  const units = buildExtractionUnits(chunks);

  // אינדקס מלא של מה שכבר קיים — בכל חמש הישויות, לא רק בנושאים.
  const existingKeys = await loadExistingKeys();
  const existingTopics = new Set(
    [...existingKeys].filter((k) => k.startsWith('KnowledgeTopic:')).map((k) => k.slice(15))
  );

  const summary = {
    total: units.length, done: 0, skipped: 0, failed: 0,
    seam_blocked: 0, stopped: false,
    saved: { topics: 0, lab_patterns: 0, red_flags: 0, clinical_rules: 0, associations: 0 },
    problems: [], gaps: [], dosing_mentions: [], errors: [],
    skipped_topics: [], duplicates_prevented: [],
  };

  for (const unit of units) {
    if (shouldStop()) { summary.stopped = true; break; }

    // ⚠ הדילוג חל על **כל** החלקים של נושא קיים.
    // הגרסה הראשונה דילגה רק על part === 1, ולכן בנושא שנחתך
    // לשלושה חלקים היא דילגה על הראשון וחילצה מחדש את השניים —
    // כלומר יצרה כפילות חלקית בכל הרצה חוזרת, בלי שום אינדיקציה.
    if (existingTopics.has(unit.topic_key)) {
      summary.skipped += 1;
      if (unit.part === 1) summary.skipped_topics.push(unit.topic_key);
      onProgress?.({ done: summary.done + summary.skipped, total: units.length, unit, skipped: true });
      continue;
    }

    // קטע משובש אינו מחולץ — עדיף לאבד קטע מאשר לערבב שתי מחלות
    const seams = detectSeams(unit.text);
    if (seams.verdict === 'corrupt') {
      summary.seam_blocked += 1;
      summary.problems.push({
        topic: unit.topic, severity: 'warn',
        why_he: `קטע דולג: סימני תפר ב-${Math.round(seams.score * 100)}% מהשורות.`,
      });
      onProgress?.({ done: summary.done + summary.skipped, total: units.length, unit, seamBlocked: true });
      continue;
    }

    try {
      const { extraction, error } = await extractFromChunk({
        text: unit.text, chapterHint: unit.hint, invokeLLM,
      });

      if (error || !extraction) {
        summary.failed += 1;
        summary.errors.push({ topic: unit.topic, part: unit.part, error: error ?? 'no_extraction' });
      } else {
        const { kept, problems } = validateExtraction(extraction);

        // כופים את מפתח הנושא ואת העוגן — כדי שהשיוך יהיה למקור האמיתי
        // ולא למה שהמודל בחר לקרוא לו
        for (const t of kept.topics) t.topic_key = unit.topic_key;
        for (const list of ['lab_patterns', 'red_flags', 'clinical_rules', 'associations']) {
          for (const item of kept[list]) item.source_anchor = unit.topic_key;
        }

        if (!dryRun) {
          const { saved, skipped, failed } = await saveExtraction(kept, existingKeys);
          for (const k of Object.keys(summary.saved)) summary.saved[k] += saved[k] ?? 0;
          if (failed.length) summary.errors.push(...failed);
          if (skipped.length) summary.duplicates_prevented.push(...skipped);
        }

        summary.problems.push(...problems.map((p) => ({ ...p, topic: unit.topic })));
        summary.gaps.push(...(extraction.gaps_he ?? []).map((g) => ({ topic: unit.topic, gap: g })));
        summary.dosing_mentions.push(
          ...(extraction.dosing_mentions_he ?? []).map((d) => ({ topic: unit.topic, mention: d }))
        );
        summary.done += 1;
      }
    } catch (e) {
      summary.failed += 1;
      summary.errors.push({ topic: unit.topic, part: unit.part, error: String(e?.message ?? e) });
    }

    onProgress?.({ done: summary.done + summary.skipped, total: units.length, unit, summary });
  }

  return summary;
}
