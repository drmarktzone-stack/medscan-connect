import React, { createContext, useContext, useMemo, useState } from 'react';

const PatientSessionContext = createContext(null);

const empty = {
  ageValue: '',
  ageUnit: 'years',
  sex: '',
  weight: '',
  height: '',
  gaWeeks: '',
  gcs: '',
  fatherCm: '',
  motherCm: '',
  presentation: '',
  findingsText: '',
  features: {},
};

export function buildPatient(session) {
  const patient = {};
  if (session.ageValue !== '') {
    const n = Number(session.ageValue);
    if (Number.isFinite(n)) {
      if (session.ageUnit === 'days') patient.age_days = n;
      else if (session.ageUnit === 'months') patient.age_months = n;
      else patient.age_years = n;
    }
  }
  if (session.sex) patient.sex = session.sex;
  if (session.weight !== '') patient.weight_kg = Number(session.weight);
  if (session.height !== '') patient.height_cm = Number(session.height);
  if (session.gaWeeks !== '') patient.ga_weeks = Number(session.gaWeeks);
  return patient;
}

export function splitList(s) {
  return String(s || '').split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
}

export function PatientSessionProvider({ children }) {
  const [session, setSession] = useState(empty);
  const value = useMemo(() => ({
    session,
    setSession,
    patch: (partial) => setSession((s) => ({ ...s, ...partial })),
    patchFeature: (key, val) => setSession((s) => ({
      ...s,
      features: { ...s.features, [key]: val },
    })),
    reset: () => setSession(empty),
    patient: buildPatient(session),
    findings: splitList(session.findingsText),
  }), [session]);
  return (
    <PatientSessionContext.Provider value={value}>
      {children}
    </PatientSessionContext.Provider>
  );
}

export function usePatientSession() {
  const ctx = useContext(PatientSessionContext);
  if (!ctx) {
    return {
      session: empty,
      setSession: () => {},
      patch: () => {},
      patchFeature: () => {},
      reset: () => {},
      patient: {},
      findings: [],
    };
  }
  return ctx;
}
