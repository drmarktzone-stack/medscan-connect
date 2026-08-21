import React from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

export default function PrintDraftButton({ disabled = false }) {
  const { t } = useI18n();
  return (
    <Button
      type="button"
      variant="outline"
      className="no-print w-full h-11 rounded-xl"
      disabled={disabled}
      onClick={() => window.print()}
    >
      <Printer className="w-4 h-4" />
      {t("clinic.print_draft")}
    </Button>
  );
}
