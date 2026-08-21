export const BACKUP_VERSION = 1;
export const BACKUP_APP = 'doctorpedai';

export function buildClinicBackup({ encounters = [], profile = {} } = {}, now = () => new Date().toISOString()) {
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exported_at: now(),
    profile: {
      clinicName: String(profile.clinicName || ''),
      physicianName: String(profile.physicianName || ''),
    },
    encounters: Array.isArray(encounters) ? encounters : [],
  };
}

export function parseClinicBackup(raw) {
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!data || data.app !== BACKUP_APP || data.version !== BACKUP_VERSION) {
    throw new Error('invalid_backup');
  }
  if (!Array.isArray(data.encounters)) throw new Error('invalid_backup');
  return data;
}

export function mergeEncounterRows(existing, incoming) {
  const current = Array.isArray(existing) ? existing : [];
  const next = Array.isArray(incoming) ? incoming : [];
  const ids = new Set(current.map((row) => row?.id).filter(Boolean));
  const stamped = next
    .filter((row) => row && typeof row === 'object')
    .filter((row) => !row.id || !ids.has(row.id))
    .map((row, i) => ({
      ...row,
      id: row.id || `imported-${Date.now()}-${i}`,
      backend: row.backend || 'local_fallback',
    }));
  return [...stamped, ...current].slice(0, 200);
}
