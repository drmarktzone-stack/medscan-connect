/**
 * MedScan — חוזה הפלט המחייב (response_json_schema)
 *
 * כל קריאת-LLM קלינית ב-MedScan חייבת לעבור דרך אחת מהסכמות כאן.
 * הסכמות אינן "עיצוב פלט" — הן **מנגנון אנטי-הזיה**: הן כופות על המודל
 * להצהיר על מקור לכל טענה, לפרק את החשיבה לשלבים, ולתייג את סוג הטענה.
 * מה שלא ניתן לתייג ולעגן — לא יכול לעבור את הסכמה, ולכן לא יגיע למשתמש.
 *
 * מזהי-עוגן:
 *   F#  — פריט ידע מאומת מה-FACT BLOCK (נלסון / KB)
 *   D#  — ערך שחושב בקוד דטרמיניסטי (מינון, נוזלים, GFR, percentile)
 *   P#  — ערך מדידה של המטופל (תוצאת מעבדה / ממצא שהוזן)
 *   L#  — מאמר שנשלף בפועל מ-PubMed
 *
 * המודל מפנה ל-L# בלבד. הוא לעולם אינו כותב PMID או DOI —
 * הקוד מרחיב את ההפניה לציטוט מלא, מתוך מה שנשלף בפועל.
 */

/** תיוג סוג הטענה. */
export const CLAIM_TYPES = ['FACT', 'ANALYSIS', 'DIRECTION', 'RECOMMENDATION', 'UNKNOWN'];

/** רמות חשד. `insufficient` אינה "ירוק" — היא היעדר ראיה. */
export const SUSPICION_LEVELS = ['green', 'yellow', 'red', 'insufficient'];

export const DISCLAIMER_HE =
  'MedScan הוא כלי תמיכה בהחלטות בלבד. אינו מהווה אבחנה או תחליף לשיקול דעת רפואי. ' +
  'כל החלטה טעונה אימות ע"י רופא/ה מוסמך/ת.';

/** דפוס מזהה-עוגן תקין. נאכף גם בסכמה וגם בוולידטור. */
const REF_PATTERN = '^[FDPL][0-9]+$';

const refArray = (description, minItems = 0) => ({
  type: 'array',
  description,
  minItems,
  items: { type: 'string', pattern: REF_PATTERN },
});

/**
 * שרשרת חשיבה כפויה — מנגנון 3.
 * חייבים לפחות שלושה שלבים, ולפחות אחד מכל סוג: ממצאים → קשרים → מסקנה אפשרית.
 * (אכיפת "אחד מכל סוג" נעשית בוולידטור; JSON Schema לבדה אינה יכולה לבטא זאת.)
 */
export const REASONING_CHAIN_SCHEMA = {
  type: 'array',
  description:
    'שרשרת החשיבה, מפורקת לשלבים. חובה: ממצאים → קשרים → מסקנה אפשרית. ' +
    'כל שלב מצהיר על מה הוא נשען (fact_refs).',
  minItems: 3,
  items: {
    type: 'object',
    properties: {
      step: { type: 'integer', minimum: 1 },
      stage: {
        type: 'string',
        enum: ['findings', 'links', 'candidate_conclusion'],
        description: 'findings=מה רואים · links=מה מתקשר למה · candidate_conclusion=לאן זה מוביל',
      },
      statement_he: { type: 'string', minLength: 3 },
      fact_refs: refArray('מזהי העוגנים שעליהם נשען השלב (F#/D#/P#)'),
    },
    required: ['step', 'stage', 'statement_he', 'fact_refs'],
  },
};

/**
 * טענה מתויגת — מנגנון 1 (grounding) + 5 (source attribution) + 6 (UNKNOWN לגיטימי).
 * `claim_id` מאפשר למנגנון 7 (Multi-Check) להצביע על טענה ספציפית ולפסול אותה.
 */
export const CLAIM_SCHEMA = {
  type: 'object',
  properties: {
    claim_id: { type: 'string', description: 'מזהה ייחודי בתוך התשובה, למשל C1' },
    claim_type: { type: 'string', enum: CLAIM_TYPES },
    text_he: { type: 'string', minLength: 3 },
    fact_refs: refArray('חובה ל-FACT. ANALYSIS חייב להצביע על העובדות שמתחתיו.'),
    source_anchors: {
      type: 'array',
      description: 'topic_key בנלסון, למשל nelson.id.kawasaki. חובה ל-FACT.',
      items: { type: 'string' },
    },
  },
  required: ['claim_id', 'claim_type', 'text_he', 'fact_refs'],
};

/**
 * ציון ביטחון מוצהר — מנגנון 2.
 * המודל **מציע**; הקוד הדטרמיניסטי (calibration.js) מחשב תקרה ויכול רק להוריד.
 * `confidence_reason_he` חובה: ציון בלי הסבר הוא ציון חסר-ערך.
 */
export const CONFIDENCE_SCHEMA = {
  type: 'object',
  properties: {
    level: { type: 'string', enum: SUSPICION_LEVELS },
    confidence_reason_he: {
      type: 'string',
      minLength: 10,
      description: 'למה דווקא ציון זה — על סמך אילו ראיות, ומה מחליש אותן',
    },
    evidence_strength: {
      type: 'string',
      enum: ['strong', 'moderate', 'weak', 'none'],
      description: 'חוזק הראיה כפי שהמודל מעריך אותה (לפני כיול דטרמיניסטי)',
    },
  },
  required: ['level', 'confidence_reason_he', 'evidence_strength'],
};

/** כיוון אבחוני — לעולם לא אבחנה. חובה: מה מאשש ומה שולל. */
export const DIRECTION_SCHEMA = {
  type: 'object',
  properties: {
    direction_id: { type: 'string' },
    diagnosis_direction_he: { type: 'string', minLength: 2 },
    confidence: CONFIDENCE_SCHEMA,
    reasoning_chain: REASONING_CHAIN_SCHEMA,
    supports_he: {
      type: 'array',
      minItems: 1,
      description: 'ממצאים בקלט שמחזקים את הכיוון',
      items: { type: 'string' },
    },
    refutes_he: {
      type: 'array',
      minItems: 1,
      description: 'מה ישלול/יחליש את הכיוון. רשימה ריקה אסורה — כיוון שאין מה שישלול אותו אינו כיוון.',
      items: { type: 'string' },
    },
    discriminating_test_he: {
      type: 'array',
      description: 'הבדיקה/הממצא שישנה את התמונה בפועל',
      items: { type: 'string' },
    },
    fact_refs: refArray('העוגנים שעליהם נשען הכיוון', 1),
    source_anchors: { type: 'array', items: { type: 'string' } },
    based_on_patterns: {
      type: 'array',
      description: 'pattern_key מתוך matched_patterns בלבד. אסור להמציא דפוס.',
      items: { type: 'string' },
    },
  },
  required: [
    'direction_id',
    'diagnosis_direction_he',
    'confidence',
    'reasoning_chain',
    'supports_he',
    'refutes_he',
    'fact_refs',
  ],
};

/** סתירה שזוהתה — מנגנון 4. המודל מדווח; הקוד מזהה בנפרד ומשלב. */
export const CONTRADICTION_SCHEMA = {
  type: 'object',
  properties: {
    contradiction_id: { type: 'string' },
    kind: {
      type: 'string',
      enum: ['finding_vs_finding', 'finding_vs_source', 'source_vs_source', 'direction_vs_direction'],
    },
    description_he: { type: 'string', minLength: 10 },
    involved_refs: refArray('העוגנים/הממצאים המעורבים בסתירה'),
    resolution_he: {
      type: 'string',
      description: 'איך מיישבים — או הצהרה מפורשת שלא ניתן ליישב מהמידע הקיים',
    },
  },
  required: ['contradiction_id', 'kind', 'description_he'],
};

/** בלוק בטיחות — Red Flags תמיד ראשונים בפלט. */
export const RED_FLAG_OUT_SCHEMA = {
  type: 'object',
  properties: {
    flag_key: { type: 'string' },
    label_he: { type: 'string' },
    reason_he: { type: 'string' },
    action_he: { type: 'string' },
    severity: { type: 'string', enum: ['red', 'critical'] },
    source_anchor: { type: 'string' },
  },
  required: ['label_he', 'action_he', 'severity'],
};

/** מעטפת חובה שמשותפת לכל מנוע. */
const ENVELOPE_PROPERTIES = {
  red_flags: { type: 'array', items: RED_FLAG_OUT_SCHEMA },
  claims: { type: 'array', items: CLAIM_SCHEMA },
  contradictions: { type: 'array', items: CONTRADICTION_SCHEMA },
  unknowns_he: {
    type: 'array',
    description:
      'מה שהמודל אינו יודע ואינו נמצא במקור. מנגנון 6 — רשימה ריקה בקלט מורכב היא סימן אזהרה בפני עצמו.',
    items: { type: 'string' },
  },
  literature_support: {
    type: 'array',
    description:
      'קישור בין טענות לספרות שנשלפה. הפנה אך ורק ל-L# — אל תכתוב PMID/DOI.',
    items: {
      type: 'object',
      properties: {
        claim_or_direction_id: { type: 'string' },
        literature_refs: {
          type: 'array',
          items: { type: 'string', pattern: '^L[0-9]+$' },
          minItems: 1,
        },
        relevance_he: {
          type: 'string',
          description: 'מה במאמר רלוונטי, ובמה הוא שונה מהמקרה שלפנינו',
        },
      },
      required: ['literature_refs', 'relevance_he'],
    },
  },
  overall_suspicion: { type: 'string', enum: SUSPICION_LEVELS },
  uncertainty_note_he: { type: 'string' },
  disclaimer_he: { type: 'string' },
};

const ENVELOPE_REQUIRED = ['claims', 'unknowns_he', 'overall_suspicion', 'disclaimer_he'];

/** Lab Interpreter — P0 */
export const LAB_INTERPRETER_SCHEMA = {
  type: 'object',
  properties: {
    ...ENVELOPE_PROPERTIES,
    patterns_detected: {
      type: 'array',
      description: 'רק דפוסים שסופקו ב-matched_patterns. אסור להוסיף.',
      items: {
        type: 'object',
        properties: {
          pattern_key: { type: 'string' },
          contributing_labs: { type: 'array', items: { type: 'string' } },
          source_anchor: { type: 'string' },
        },
        required: ['pattern_key', 'contributing_labs'],
      },
    },
    directions: { type: 'array', items: DIRECTION_SCHEMA },
  },
  required: [...ENVELOPE_REQUIRED, 'directions'],
};

/** Patient Context Engine — P0 */
export const PATIENT_CONTEXT_SCHEMA = {
  type: 'object',
  properties: {
    ...ENVELOPE_PROPERTIES,
    recommended_tests: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          test_he: { type: 'string' },
          reason_he: { type: 'string' },
          fact_refs: refArray('העוגן שמצדיק את הבדיקה', 1),
          source_anchor: { type: 'string' },
        },
        required: ['test_he', 'reason_he', 'fact_refs'],
      },
    },
    monitoring: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          what_he: { type: 'string' },
          interval_he: { type: 'string' },
          reason_he: { type: 'string' },
          fact_refs: refArray('העוגן שקובע את התדירות', 1),
        },
        required: ['what_he', 'fact_refs'],
      },
    },
    alerts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['green', 'yellow', 'red'] },
          label_he: { type: 'string' },
          detail_he: { type: 'string' },
          origin: {
            type: 'string',
            enum: ['interaction', 'context_rule', 'deterministic', 'red_flag'],
            description: 'מקור ההתראה. אסור להמציא אינטראקציה שלא סופקה בקלט.',
          },
          fact_refs: refArray('העוגן/הערך שממנו נובעת ההתראה', 1),
        },
        required: ['severity', 'label_he', 'origin', 'fact_refs'],
      },
    },
    dynamic_recommendations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          trigger_he: { type: 'string' },
          recommendation_he: { type: 'string' },
          confidence: CONFIDENCE_SCHEMA,
          deterministic_refs: refArray('D# — כל מספר בהמלצה חייב להגיע מכאן'),
          fact_refs: refArray('העוגן הקליני', 1),
        },
        required: ['trigger_he', 'recommendation_he', 'confidence', 'fact_refs'],
      },
    },
  },
  required: [...ENVELOPE_REQUIRED, 'recommended_tests', 'alerts'],
};

/** Protocol Execution Engine — P0 */
export const PROTOCOL_RUNNER_SCHEMA = {
  type: 'object',
  properties: {
    ...ENVELOPE_PROPERTIES,
    protocol_key: { type: 'string' },
    current_step: {
      type: 'object',
      properties: {
        step_id: { type: 'string' },
        title_he: { type: 'string' },
        explanation_he: {
          type: 'string',
          description: 'הסבר בעברית לשלב הקיים. אסור להוסיף פעולה שאינה בפרוטוקול.',
        },
        actions_he: { type: 'array', items: { type: 'string' } },
        deterministic_refs: refArray('D# — מינונים/נוזלים שחושבו בקוד'),
      },
      required: ['step_id', 'title_he', 'explanation_he'],
    },
    branch_options: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          condition_he: { type: 'string' },
          next_step_id: { type: 'string' },
        },
        required: ['condition_he', 'next_step_id'],
      },
    },
    source_anchor: { type: 'string' },
  },
  required: [...ENVELOPE_REQUIRED, 'protocol_key', 'current_step'],
};

/** Differential Diagnosis Builder — P1 */
export const DIFFERENTIAL_SCHEMA = {
  type: 'object',
  properties: {
    ...ENVELOPE_PROPERTIES,
    differential: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ...DIRECTION_SCHEMA.properties,
          rank: { type: 'integer', minimum: 1 },
          must_not_miss: {
            type: 'boolean',
            description: 'האם זו אבחנה מסכנת-חיים שאסור לפספס גם אם סבירותה נמוכה',
          },
        },
        required: [...DIRECTION_SCHEMA.required, 'rank', 'must_not_miss'],
      },
    },
  },
  required: [...ENVELOPE_REQUIRED, 'differential'],
};

/** מנגנון 7 — סכמת המאמת-הנגדי (קריאה שנייה, יריבותית). */
export const SELF_CHECK_SCHEMA = {
  type: 'object',
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          claim_id: { type: 'string' },
          verdict: {
            type: 'string',
            enum: ['supported', 'overstated', 'unsupported', 'contradicted_by_source'],
          },
          why_he: { type: 'string', minLength: 5 },
        },
        required: ['claim_id', 'verdict', 'why_he'],
      },
    },
    fabricated_specifics: {
      type: 'array',
      description: 'מספרים/מינונים/שמות/ספים שמופיעים בפלט ואינם במקור',
      items: { type: 'string' },
    },
    missing_contradictions_he: {
      type: 'array',
      description: 'סתירות שהפלט המקורי החליק ולא הציג',
      items: { type: 'string' },
    },
    overall: { type: 'string', enum: ['pass', 'pass_with_edits', 'fail'] },
  },
  required: ['verdicts', 'overall'],
};

export const SCHEMAS_BY_ENGINE = {
  lab_interpreter: LAB_INTERPRETER_SCHEMA,
  patient_context: PATIENT_CONTEXT_SCHEMA,
  protocol_runner: PROTOCOL_RUNNER_SCHEMA,
  differential: DIFFERENTIAL_SCHEMA,
};
