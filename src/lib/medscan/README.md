# medscan/ — שכבת האנטי-הזיה וה-Knowledge Base

> **השער היחיד לכל קריאת-LLM קלינית חדשה ב-MedScan.**
> מקור-האמת: חבילת `medscan` בפרויקט המקומי. 90 בדיקות עוברות.

## למה זה קיים

פרומפט שאומר למודל "אל תמציא" אינו מנגנון אנטי-הזיה — הוא בקשה.
מנגנון הוא בדיקה דטרמיניסטית שאינה תלויה בשיתוף-פעולה של המודל,
ושפועלת גם כשהמודל משוכנע לחלוטין שהוא צודק.

## מבנה

```
medscan/
├── llmAdapter.js              ← גשר ל-base44.integrations.Core.InvokeLLM
├── gate/groundedInvoke.js     ← השער. כל קריאה קלינית עוברת דרכו.
├── schemas/output.schemas.js  ← חוזה הפלט המחייב
├── antihallucination/
│   ├── factBlock.js       [1] Grounding — רשימה ממוספרת סגורה
│   ├── validators.js      [1][3][5] עוגן · שרשרת · מנדט
│   ├── numericGuard.js    [·] אף מספר ללא מקור
│   ├── contradiction.js   [4] סתירות
│   ├── calibration.js     [2] תקרת ביטחון — המודל רק יורד
│   ├── selfCheck.js       [7] מאמת-נגדי
│   ├── envelope.js        [6] סירוב כפלט מלא
│   ├── anchorGuard.js     [A] ציטוט מזויף · שם מומצא
│   ├── coverageGuard.js   [O] השמטה
│   ├── inputSanitizer.js  [S] קלט הוא מידע, לא הוראות
│   └── consistency.js     [C] טענה שאינה יציבה
├── deterministic/
│   ├── refRanges.js       טווחי ייחוס — ריק בכוונה, ראה למטה
│   ├── labNormalize.js    "לא יודע" ≠ "תקין"
│   └── calculators.js     נוסחאות בלבד; מינון מסרב בלי טבלה מאומתת
└── rules/rulesEngine.js       RedFlags → Patterns → Rules → Associations
```

## שלושה כללים שאסור להפר

**1. אין קריאה ישירה ל-`InvokeLLM` במנועים חדשים.**
ברגע שקיימת עקיפה אחת, כל השכבה מבטלת את עצמה.

**2. `verification_status` אינו שדה קוסמטי.**
כל עוד פריטי ה-KB בסטטוס `draft_needs_verification`, המערכת תסרב
לענות תשובות קליניות. זו התנהגות נכונה. העקיפה המפתה — "נעביר הכל
ל-verified כדי שנראה שזה עובד" — מבטלת את כל מה שנבנה כאן.

**3. `refRanges` ריק בכוונה.**
טווחי ייחוס ספציפיים למעבדה המבצעת (שיטת מדידה, מכשור, אוכלוסיית
ייחוס). טווח מספר לימוד שיושם על תוצאה ממעבדה אחרת יסמן "תקין"
מה שחריג. נטען מישות `ReferenceRange` שמולאה מגיליון המעבדה.

## מזהי דגמים

`aiConfig.js` מחזיק מזהי **Base44**, לא מזהי Anthropic API.
הזמינים כאן: `claude_opus_4_8` / `4_7` / `4_6`, `claude_sonnet_4_6`.
`claude_opus_4_8` הוא העליון הזמין. מזהה שאינו מסופק ע"י ה-workspace
גורם לכשל בכל קריאת AI — אין לשנות בלי לאמת זמינות.
