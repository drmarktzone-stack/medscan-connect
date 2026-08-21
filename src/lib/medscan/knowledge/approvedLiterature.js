/**
 * DoctorPedAI — עוגני ספרות מאושרת
 *
 * פלט דיאגנוסטי / המלצה חייב להצביע על פרק וסעיף במקור מאושר:
 * Nelson, חוזר משרד הבריאות, AES, ILAE, OMIM, Orphanet, ACR,
 * DSM-5-TR, AAP, ICHD-3, Rome IV, WHO או CDC.
 * אין כאן תוכן מועתק — רק מזהי עוגן + פירוק לפרק/סעיף.
 */

export const APPROVED_LITERATURE_PREFIXES = Object.freeze([
  'nelson.',
  'nelson22.',
  'moh.',
  'aes.',
  'ilae.',
  'omim.',
  'orphanet.',
  'acr.',
  'dsm.',
  'aap.',
  'ichd.',
  'rome.',
  'who.',
  'cdc.',
]);

/** טיוטות שצורתן ספרותית אך טרם אומתו מול המקור. */
export const DRAFT_LITERATURE_PREFIXES = Object.freeze(
  APPROVED_LITERATURE_PREFIXES.map((p) => `needs_verification.${p}`),
);

const DRAFT_HEAD = 'needs_verification.';

/** ארוך-לפני-קצר כדי ש-nelson22 לא ייבלע ב-nelson. */
const CORPORA = Object.freeze([
  { prefix: 'nelson22.', corpus: 'nelson22', label_he: 'Nelson Textbook of Pediatrics, 22e', kind: 'chapter' },
  { prefix: 'nelson.', corpus: 'nelson', label_he: 'Nelson Textbook of Pediatrics', kind: 'chapter' },
  { prefix: 'moh.', corpus: 'moh', label_he: 'חוזר משרד הבריאות', kind: 'circular' },
  { prefix: 'aes.', corpus: 'aes', label_he: 'American Epilepsy Society (AES)', kind: 'guideline' },
  { prefix: 'ilae.', corpus: 'ilae', label_he: 'International League Against Epilepsy (ILAE)', kind: 'guideline' },
  { prefix: 'omim.', corpus: 'omim', label_he: 'OMIM', kind: 'catalog' },
  { prefix: 'orphanet.', corpus: 'orphanet', label_he: 'Orphanet', kind: 'catalog' },
  { prefix: 'acr.', corpus: 'acr', label_he: 'American College of Radiology (ACR)', kind: 'guideline' },
  { prefix: 'dsm.', corpus: 'dsm', label_he: 'DSM-5-TR', kind: 'guideline' },
  { prefix: 'aap.', corpus: 'aap', label_he: 'American Academy of Pediatrics (AAP)', kind: 'guideline' },
  { prefix: 'ichd.', corpus: 'ichd', label_he: 'ICHD-3', kind: 'guideline' },
  { prefix: 'rome.', corpus: 'rome', label_he: 'Rome IV', kind: 'guideline' },
  { prefix: 'who.', corpus: 'who', label_he: 'World Health Organization (WHO)', kind: 'guideline' },
  { prefix: 'cdc.', corpus: 'cdc', label_he: 'CDC', kind: 'guideline' },
]);

export function isApprovedLiteratureAnchor(anchor) {
  const a = String(anchor ?? '').trim();
  if (!a) return false;
  if (a.startsWith(DRAFT_HEAD)) return false;
  return APPROVED_LITERATURE_PREFIXES.some((p) => a.startsWith(p));
}

export function isLiteratureShapedAnchor(anchor) {
  const a = String(anchor ?? '').trim();
  if (!a) return false;
  if (isApprovedLiteratureAnchor(a)) return true;
  return DRAFT_LITERATURE_PREFIXES.some((p) => a.startsWith(p));
}

function matchCorpus(body) {
  for (const c of CORPORA) {
    if (body.startsWith(c.prefix)) {
      return { ...c, rest: body.slice(c.prefix.length) };
    }
  }
  return null;
}

function displayFor(corpus, chapter, section) {
  if (corpus.kind === 'chapter') {
    return `${corpus.label_he} — פרק ${chapter}, סעיף ${section}`;
  }
  if (corpus.kind === 'catalog') {
    return `${corpus.label_he} ${chapter} — ${section}`;
  }
  return `${corpus.label_he} — ${chapter} / ${section}`;
}

/**
 * מפרק עוגן לפרק וסעיף.
 * nelson.{chapter}.{section} · aes.{guideline}.{section} · omim.{id}.{name} וכו'.
 */
export function parseLiteratureCitation(anchor) {
  const raw = String(anchor ?? '').trim();
  if (!raw || !isLiteratureShapedAnchor(raw)) return null;

  const draft = raw.startsWith(DRAFT_HEAD);
  const body = draft ? raw.slice(DRAFT_HEAD.length) : raw;
  const corpus = matchCorpus(body);
  if (!corpus) return null;

  const parts = corpus.rest.split('.').filter(Boolean);
  if (parts.length < 2) return null;
  const chapter = parts[0];
  const section = parts.slice(1).join('.');

  return {
    canonical: raw,
    corpus: corpus.corpus,
    chapter,
    section,
    draft,
    approved: !draft && isApprovedLiteratureAnchor(raw),
    display_he: displayFor(corpus, chapter, section),
    verification_status: draft ? 'draft_needs_verification' : 'verified_shape',
  };
}

export function requireLiteratureCitation(anchor) {
  return parseLiteratureCitation(anchor);
}

export function attachLiteratureCitation(item) {
  if (!item || typeof item !== 'object') return item;
  const anchor = item.source_anchor ?? item.topic_key ?? null;
  const citation = parseLiteratureCitation(anchor);
  if (!citation) {
    return { ...item, literature_citation: null, literature_ok: false };
  }
  return { ...item, literature_citation: citation, literature_ok: citation.approved || citation.draft };
}

export function describeLiteratureAnchor(anchor) {
  const c = parseLiteratureCitation(anchor);
  return c ? c.display_he : null;
}
