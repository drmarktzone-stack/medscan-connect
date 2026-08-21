import React, { useState, useRef, useEffect } from "react";
import { Globe, Check, ChevronDown } from "lucide-react";
import { useI18n } from "@/lib/i18n";

const languages = [
  { code: "he", label: "עברית", short: "HE" },
  { code: "en", label: "English", short: "EN" },
  { code: "ar", label: "العربية", short: "AR" },
];

export default function LanguageSwitcher() {
  const { lang, setLang, dir } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const current = languages.find((l) => l.code === lang) || languages[0];

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs hover:opacity-80 transition-colors select-none"
      >
        <Globe className="w-4 h-4" />
        {current.short}
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div className={`absolute top-full mt-1 ${dir === "rtl" ? "left-0" : "right-0"} bg-white rounded-lg shadow-lg border border-slate-200 py-1 min-w-[120px] z-50`}>
          {languages.map((l) => (
            <button
              key={l.code}
              onClick={() => { setLang(l.code); setOpen(false); }}
              className={`w-full flex items-center justify-between px-3 py-2 text-sm transition-colors ${
                l.code === lang ? "text-primary font-semibold bg-primary/5" : "text-foreground hover:bg-slate-50"
              }`}
            >
              {l.label}
              {l.code === lang && <Check className="w-3.5 h-3.5" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}