export const CLINIC_PROFILE_KEY = 'doctorped_clinic_profile_v1';

export function emptyClinicProfile() {
  return { clinicName: '', physicianName: '' };
}

function clip(value) {
  return String(value || '').trim().slice(0, 80);
}

export function loadClinicProfile(storage) {
  const store = storage ?? (typeof localStorage === 'undefined' ? null : localStorage);
  if (!store) return emptyClinicProfile();
  try {
    const raw = store.getItem(CLINIC_PROFILE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      clinicName: clip(parsed.clinicName),
      physicianName: clip(parsed.physicianName),
    };
  } catch {
    return emptyClinicProfile();
  }
}

export function saveClinicProfile(profile, storage) {
  const next = {
    clinicName: clip(profile?.clinicName),
    physicianName: clip(profile?.physicianName),
  };
  const store = storage ?? (typeof localStorage === 'undefined' ? null : localStorage);
  if (store) store.setItem(CLINIC_PROFILE_KEY, JSON.stringify(next));
  return next;
}
