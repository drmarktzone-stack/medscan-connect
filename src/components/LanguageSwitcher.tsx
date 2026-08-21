import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";

const locales = [
  { key: "he", label: "עב" },
  { key: "en", label: "EN" },
  { key: "ar", label: "عر" },
] as const;

export function LanguageSwitcher({ locale, onChange }: { locale: "he" | "en" | "ar"; onChange: (locale: "he" | "en" | "ar") => void }) {
  return (
    <div className="flex items-center gap-1 rounded-full border border-border bg-background/40 p-1 backdrop-blur-xl" aria-label="בחירת שפה">
      <Languages className="mx-1 size-4 text-muted-foreground" />
      {locales.map((item) => (
        <Button key={item.key} type="button" size="sm" variant={locale === item.key ? "default" : "ghost"} className="h-7 rounded-full px-2.5" onClick={() => onChange(item.key)}>
          {item.label}
        </Button>
      ))}
    </div>
  );
}