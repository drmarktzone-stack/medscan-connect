/**
 * MedScan i18n — locale + direction.
 * Default Hebrew. English is LTR; Hebrew and Arabic are RTL.
 */

export const SUPPORTED_LOCALES = Object.freeze(['he', 'en', 'ar']);

export function resolveLocale(locale) {
  const loc = String(locale ?? 'he').trim().toLowerCase();
  if (loc === 'iw') return 'he';
  if (SUPPORTED_LOCALES.includes(loc)) return loc;
  return 'he';
}

export function dirFor(locale) {
  return resolveLocale(locale) === 'en' ? 'ltr' : 'rtl';
}

export function localeMeta(locale) {
  const loc = resolveLocale(locale);
  return { locale: loc, dir: dirFor(loc) };
}
