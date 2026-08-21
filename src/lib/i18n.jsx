import React, { createContext, useContext, useState, useEffect } from "react";
import { translations } from "./translations";

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("medscan_lang") || "he";
    }
    return "he";
  });

  const dir = lang === "en" ? "ltr" : "rtl";

  useEffect(() => {
    document.documentElement.dir = dir;
    document.documentElement.lang = lang;
    localStorage.setItem("medscan_lang", lang);
  }, [lang, dir]);

  const t = (key, params) => {
    let str = translations[lang]?.[key] ?? translations.he[key] ?? key;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
      });
    }
    return str;
  };

  return (
    <I18nContext.Provider value={{ lang, setLang, dir, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    return {
      lang: "he",
      setLang: () => {},
      dir: "rtl",
      t: (k) => translations.he[k] || k,
    };
  }
  return ctx;
}