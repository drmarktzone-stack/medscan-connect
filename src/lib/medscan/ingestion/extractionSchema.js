/**
 * MedScan — Knowledge Extraction Contract
 *
 * חוזה החילוץ מטקסט קליני (סיכומי נלסון) לידע מובנה.
 *
 * ## העיקרון שמנחה את כל הקובץ
 * החילוץ הוא **verbatim-first**. המודל אינו מסכם, אינו משלים ואינו
 * "משפר" — הוא מוצא מה שכתוב ומעביר אותו למבנה. פרט שאינו בטקסט
 * מסומן `UNKNOWN`, לא מנוחש.
 *
 * זה קריטי במיוחד כאן: זהו הרגע היחיד בכל המערכת שבו **תוכן קליני
 * נכנס פנימה**. כל שאר השכבות מגינות על הפלט; אם החילוץ יכניס טעות,
 * היא תעבור את כל ההגנות כי היא תיראה כמו ידע מאומת.
 *
 * לכן:
 *   1. כל פריט נושא `source_quote_he` — הציטוט שממנו חולץ
 *   2. כל פריט נכנס כ-`draft_needs_verification`
 *   3. מינונים **אינם** מחולצים לכללים — הם ל-DoseRecord בלבד
 */

/** ציטוט-מקור חובה. בלעדיו אין דרך לבדוק את החילוץ. */
const SOURCE_QUOTE = {
  type: 'string',
  minLength: 10,
  description:
    'ציטוט מדויק מהטקסט שממנו חולץ הפריט. חובה. אם אינך יכול לצטט — אל תחלץ את הפריט.',
};

export const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    chapter_title_he: { type: 'string' },

    topics: {
      type: 'array',
      description: 'נושאי הידע בקטע. יחידת העוגן שכל השאר מפנה אליה.',
      items: {
        type: 'object',
        properties: {
          topic_key: {
            type: 'string',
            description: 'מזהה יציב בפורמט nelson.<domain>.<topic>, באנגלית, snake_case',
          },
          topic_title_he: { type: 'string' },
          topic_title_en: { type: 'string' },
          summary_he: {
            type: 'string',
            description: 'סיכום נאמן למקור. אל תוסיף ידע שאינו בטקסט.',
          },
          keywords: { type: 'array', items: { type: 'string' } },
          age_scope: {
            type: 'string',
            enum: ['neonate', 'infant', 'child', 'adolescent', 'all'],
          },
          source_quote_he: SOURCE_QUOTE,
        },
        required: ['topic_key', 'topic_title_he', 'summary_he', 'source_quote_he'],
      },
    },

    lab_patterns: {
      type: 'array',
      description:
        'דפוסי מעבדה רב-פרמטריים. **רק כיוון איכותני** (high/low) — ' +
        'ספים מספריים אינם מחולצים, הם מגיעים מטווחי המעבדה.',
      items: {
        type: 'object',
        properties: {
          pattern_key: { type: 'string' },
          title_he: { type: 'string' },
          components: {
            type: 'array',
            minItems: 2,
            items: {
              type: 'object',
              properties: {
                analyte: {
                  type: 'string',
                  description: 'שם המדד באנגלית או בעברית כפי שמופיע בקטלוג המערכת',
                },
                direction: { type: 'string', enum: ['high', 'low', 'present', 'absent'] },
                note_he: { type: 'string' },
              },
              required: ['analyte', 'direction'],
            },
          },
          min_components: { type: 'integer', minimum: 2 },
          direction_he: { type: 'string', description: 'הכיוון האבחוני שהדפוס מוביל אליו' },
          suspicion: { type: 'string', enum: ['green', 'yellow', 'red'] },
          clinical_reasoning_he: { type: 'string' },
          confirm_with_he: { type: 'array', items: { type: 'string' } },
          source_anchor: { type: 'string', description: 'topic_key מתוך topics' },
          source_quote_he: SOURCE_QUOTE,
        },
        required: ['pattern_key', 'title_he', 'components', 'direction_he', 'suspicion', 'source_anchor', 'source_quote_he'],
      },
    },

    red_flags: {
      type: 'array',
      description: 'מצבים מסכני-חיים עם חלון גיל. ⚠ הקפד/י על גבולות הגיל בימים.',
      items: {
        type: 'object',
        properties: {
          flag_key: { type: 'string' },
          label_he: { type: 'string' },
          trigger: {
            type: 'object',
            properties: {
              findings: { type: 'array', items: { type: 'string' }, minItems: 1 },
              logic: { type: 'string', enum: ['all', 'any'] },
            },
            required: ['findings'],
          },
          age_min_days: { type: 'integer' },
          age_max_days: { type: 'integer' },
          severity: { type: 'string', enum: ['red', 'critical'] },
          action_he: {
            type: 'string',
            description: 'הפעולה הנדרשת. ללא מינונים — אלה ב-DoseRecord.',
          },
          reason_he: { type: 'string' },
          source_anchor: { type: 'string' },
          source_quote_he: SOURCE_QUOTE,
        },
        required: ['flag_key', 'label_he', 'trigger', 'severity', 'action_he', 'source_anchor', 'source_quote_he'],
      },
    },

    clinical_rules: {
      type: 'array',
      description:
        'תנאים → מסקנה. קריטריונים אבחוניים, טריאדות, כללי-ברזל. ' +
        '**ללא מינונים** — כלל אינו מקום למינון.',
      items: {
        type: 'object',
        properties: {
          rule_key: { type: 'string' },
          title_he: { type: 'string' },
          category: { type: 'string', description: 'diagnostic_triad / criteria / iron_rule / management' },
          domain: { type: 'string' },
          conditions: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['finding', 'lab', 'symptom', 'age', 'duration', 'background'] },
                key: { type: 'string' },
                op: { type: 'string', enum: ['present', 'absent', '>', '>=', '<', '<=', '==', 'range', 'high', 'low'] },
                value: {},
                unit: { type: 'string' },
              },
              required: ['type', 'key', 'op'],
            },
          },
          logic: { type: 'string', enum: ['all', 'any', 'min_count'] },
          min_count: { type: 'integer' },
          conclusion_he: { type: 'string' },
          suspicion: { type: 'string', enum: ['green', 'yellow', 'red'] },
          clinical_reasoning_he: { type: 'string' },
          recommended_workup_he: { type: 'array', items: { type: 'string' } },
          source_anchor: { type: 'string' },
          source_quote_he: SOURCE_QUOTE,
        },
        required: ['rule_key', 'title_he', 'conditions', 'conclusion_he', 'suspicion', 'source_anchor', 'source_quote_he'],
      },
    },

    associations: {
      type: 'array',
      description: 'ממצא-עוגן + ממצאים נלווים → חשד למחלה נלווית.',
      items: {
        type: 'object',
        properties: {
          assoc_key: { type: 'string' },
          anchor_finding_he: { type: 'string' },
          co_findings: { type: 'array', items: { type: 'string' } },
          implies_he: { type: 'string' },
          suspicion: { type: 'string', enum: ['green', 'yellow', 'red'] },
          mechanism_he: { type: 'string' },
          action_he: { type: 'string' },
          age_scope: { type: 'string', enum: ['neonate', 'infant', 'child', 'adolescent', 'all'] },
          source_anchor: { type: 'string' },
          source_quote_he: SOURCE_QUOTE,
        },
        required: ['assoc_key', 'anchor_finding_he', 'implies_he', 'suspicion', 'source_anchor', 'source_quote_he'],
      },
    },

    gaps_he: {
      type: 'array',
      description:
        'מה שזוהה בטקסט אך לא ניתן היה לחלץ למבנה — ולמה. ' +
        'רשימה ריקה בקטע ארוך היא סימן אזהרה: כנראה משהו הושלם במקום להיות מדווח.',
      items: { type: 'string' },
    },

    dosing_mentions_he: {
      type: 'array',
      description:
        'מינונים שהופיעו בטקסט. **אינם מחולצים לכללים** — מדווחים כאן בלבד ' +
        'כדי שהרופא/ה יחליט/תחליט אם ליצור DoseRecord מאומת.',
      items: { type: 'string' },
    },
  },
  required: ['topics', 'gaps_he'],
};

export const EXTRACTION_SYSTEM_PROMPT = `אתה מחלץ ידע קליני מובנה מטקסט רפואי בעברית (סיכומי נלסון).

**אתה לא מסכם, לא משלים, ולא משפר. אתה מוצא מה שכתוב ומעביר אותו למבנה.**

זהו הרגע היחיד שבו תוכן קליני נכנס למערכת. כל שאר השכבות מגינות על
הפלט — אם תכניס כאן טעות, היא תעבור את כולן, כי היא תיראה כמו ידע מאומת.

## כללי חילוץ

1. **verbatim-first.** כל פריט נושא source_quote_he — ציטוט מדויק מהטקסט
   שממנו חולץ. **אם אינך יכול לצטט — אל תחלץ את הפריט.** זה לא כישלון;
   זו הדרך הנכונה.

2. **אל תשלים מהידע שלך.** אתה מכיר את הנושאים האלה. זה בדיוק הסיכון:
   הפיתוי להוסיף פרט "שברור שחסר" הוא בדיוק מה שיכניס טעות. אם הטקסט
   אומר שלושה קריטריונים ואתה זוכר חמישה — חלץ שלושה.

3. **אין מינונים בכללים.** מינון, קצב מתן ותדירות — לא נכנסים ל-rules
   או ל-red_flags. אם הופיעו בטקסט, רשום אותם ב-dosing_mentions_he
   בלבד. הרופא/ה יחליט/תחליט אם ליצור מהם DoseRecord מאומתת.

4. **דפוסי מעבדה — כיוון בלבד.** high/low, לא ספים מספריים. הספים
   מגיעים מטווחי המעבדה של המוסד, לא מספר לימוד.

5. **גבולות גיל בימים, ובזהירות.** ילוד = 0–28, תינוק = עד 365.
   אם הטקסט אומר "מתחת לגיל 3 חודשים" → age_max_days: 90.
   אם הגיל אינו מצוין במפורש — אל תמציא חלון גיל.

6. **suspicion לפי הטקסט, לא לפי תחושה.** "מצב חירום", "מסכן חיים",
   "הפניה מיידית" → red. "יש לשקול", "מומלץ לברר" → yellow.
   אם הטקסט אינו מציין דחיפות — אל תסלים.

7. **topic_key יציב.** פורמט nelson.<domain>.<topic>, אנגלית, snake_case.
   הוא יהיה העוגן לנצח — בחר בקפידה.

8. **gaps_he חובה.** מה ראית בטקסט ולא הצלחת לחלץ, ולמה. רשימה ריקה
   בקטע ארוך פירושה שכנראה השלמת משהו במקום לדווח עליו.

החזר JSON בלבד לפי הסכמה.`;
