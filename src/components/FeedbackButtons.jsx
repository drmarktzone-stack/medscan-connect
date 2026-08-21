import React, { useState } from "react";
import { ThumbsUp, ThumbsDown, Check, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useI18n } from "@/lib/i18n";
import { promoteFeedbackToGold } from "@/lib/feedbackFlywheel";

export default function FeedbackButtons({ analysisId, analysisType }) {
  const { t } = useI18n();
  const [submitted, setSubmitted] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [correctedDiagnosis, setCorrectedDiagnosis] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const handleCorrect = async () => {
    setSaving(true);
    try {
      await base44.entities.Feedback.create({ analysis_id: analysisId, analysis_type: analysisType, is_correct: true });
      // Flywheel: promote confirmation into the labeled evaluation set (non-blocking).
      promoteFeedbackToGold({ analysisId, feedback: { analysis_type: analysisType, is_correct: true } });
      setSubmitted(true);
    } finally {
      setSaving(false);
    }
  };

  const handleIncorrectSubmit = async () => {
    setSaving(true);
    try {
      await base44.entities.Feedback.create({
        analysis_id: analysisId,
        analysis_type: analysisType,
        is_correct: false,
        corrected_diagnosis: correctedDiagnosis,
        notes,
      });
      // Flywheel: a physician correction becomes labeled ground truth (non-blocking).
      promoteFeedbackToGold({
        analysisId,
        feedback: { analysis_type: analysisType, is_correct: false, corrected_diagnosis: correctedDiagnosis, notes },
      });
      setSubmitted(true);
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex items-center justify-center gap-2 bg-green-50 border border-green-200 rounded-xl py-3 text-sm text-green-700 font-semibold">
        <Check className="w-4 h-4" />
        {t("feedback.thanks")}
      </div>
    );
  }

  if (showForm) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <p className="text-sm font-semibold text-foreground">{t("feedback.correct_question")}</p>
        <input
          type="text"
          value={correctedDiagnosis}
          onChange={(e) => setCorrectedDiagnosis(e.target.value)}
          placeholder={t("feedback.correct_ph")}
          className="w-full h-9 rounded-lg border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t("feedback.notes_ph")}
          rows={2}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
        />
        <div className="flex gap-2">
          <button
            onClick={handleIncorrectSubmit}
            disabled={saving || !correctedDiagnosis.trim()}
            className="flex-1 h-9 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 flex items-center justify-center"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : t("feedback.submit")}
          </button>
          <button onClick={() => setShowForm(false)} className="h-9 px-4 rounded-lg border border-slate-200 text-sm text-muted-foreground">
            {t("feedback.cancel")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-slate-100 pt-4">
      <p className="text-xs text-center text-muted-foreground mb-2">{t("feedback.question")}</p>
      <div className="flex gap-2">
        <button
          onClick={handleCorrect}
          disabled={saving}
          className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm font-semibold hover:bg-green-100 transition-colors disabled:opacity-50"
        >
          <ThumbsUp className="w-4 h-4" />
          {t("feedback.correct")}
        </button>
        <button
          onClick={() => setShowForm(true)}
          className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm font-semibold hover:bg-red-100 transition-colors"
        >
          <ThumbsDown className="w-4 h-4" />
          {t("feedback.incorrect")}
        </button>
      </div>
    </div>
  );
}