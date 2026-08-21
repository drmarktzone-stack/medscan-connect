import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { loadClinicProfile, saveClinicProfile } from "./profile.js";

const ClinicProfileContext = createContext(null);

export function ClinicProfileProvider({ children }) {
  const [profile, setProfile] = useState(() => loadClinicProfile());

  const update = useCallback((patch) => {
    const next = saveClinicProfile({ ...loadClinicProfile(), ...patch });
    setProfile(next);
    return next;
  }, []);

  const value = useMemo(() => ({ profile, update }), [profile, update]);
  return <ClinicProfileContext.Provider value={value}>{children}</ClinicProfileContext.Provider>;
}

export function useClinicProfile() {
  return useContext(ClinicProfileContext) || {
    profile: { clinicName: "", physicianName: "" },
    update: () => {},
  };
}
