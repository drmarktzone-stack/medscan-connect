import React from "react";
import { AlertOctagon, Siren } from "lucide-react";
import { useI18n } from "@/lib/i18n";

/**
 * Unmistakable safety banner shown at the TOP of a result when the analysis
 * flags a potentially life-threatening or urgent finding. Deliberately loud —
 * a decision-support tool must never let a critical finding read as routine.
 */

const copy = {
  he: {
    emergency: {
      title: "ייתכן מצב חירום רפואי — פעל/י מיד",
      body: "המערכת זיהתה ממצא שעלול להיות מסכן חיים. אין להמתין ואין להסתמך על כלי זה כאבחנה. פנה/י מיידית לחדר מיון או חייג/י למוקד החירום המקומי (בישראל: 101 / מד\"א).",
    },
    urgent: {
      title: "ממצא דחוף — נדרשת הערכה רפואית מהירה",
      body: "מומלץ לפנות בהקדם האפשרי להערכה רפואית דחופה של רופא/ה מוסמך/ת.",
    },
  },
  en: {
    emergency: {
      title: "Possible medical emergency — act now",
      body: "A potentially life-threatening finding was detected. Do not wait and do not rely on this tool as a diagnosis. Go to an emergency room immediately or call your local emergency number.",
    },
    urgent: {
      title: "Urgent finding — prompt medical evaluation needed",
      body: "Please seek urgent evaluation by a licensed physician as soon as possible.",
    },
  },
  ar: {
    emergency: {
      title: "حالة طارئة محتملة — تصرّف الآن",
      body: "تم رصد نتيجة قد تكون مهددة للحياة. لا تنتظر ولا تعتمد على هذه الأداة كتشخيص. توجّه فورًا إلى قسم الطوارئ أو اتصل برقم الطوارئ المحلي.",
    },
    urgent: {
      title: "نتيجة عاجلة — يلزم تقييم طبي سريع",
      body: "يرجى طلب تقييم طبي عاجل من طبيب مختص في أقرب وقت ممكن.",
    },
  },
};

export default function EmergencyTriageBanner({ severity, urgency }) {
  const { lang } = useI18n();
  const c = copy[lang] || copy.he;

  const isEmergency = severity === "urgent" || urgency === "Emergency";
  const isUrgent = !isEmergency && (severity === "severe" || urgency === "Urgent");
  if (!isEmergency && !isUrgent) return null;

  const t = isEmergency ? c.emergency : c.urgent;
  const cls = isEmergency
    ? "bg-red-600 border-red-700"
    : "bg-orange-500 border-orange-600";
  const Icon = isEmergency ? Siren : AlertOctagon;

  return (
    <div className={`rounded-xl border-2 ${cls} text-white p-4 shadow-lg ${isEmergency ? "animate-pulse" : ""}`}>
      <div className="flex items-start gap-3">
        <Icon className="w-6 h-6 shrink-0 mt-0.5" />
        <div>
          <p className="font-extrabold text-sm leading-tight">{t.title}</p>
          <p className="text-xs mt-1.5 leading-relaxed text-white/90">{t.body}</p>
        </div>
      </div>
    </div>
  );
}
