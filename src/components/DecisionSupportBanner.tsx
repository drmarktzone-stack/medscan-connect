import { ShieldCheck } from "lucide-react";

export function DecisionSupportBanner() {
  return (
    <div className="decision-banner" role="note">
      <ShieldCheck className="size-4 shrink-0" />
      <span><strong>Decision Support</strong> · כלי תמיכה בהחלטה בלבד — אינו אבחנה ואינו מחליף שיקול דעת רפואי.</span>
    </div>
  );
}