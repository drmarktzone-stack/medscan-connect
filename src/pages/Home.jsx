import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  Heart, Stethoscope, ShieldCheck, Activity, Settings, ScanLine, FlaskConical,
  UserCog, GitBranch, ListChecks, Database, Biohazard, Flame, Baby, Brain, Bone,
  Dna, Droplets, Waves, Mic, Pill, ArrowUpLeft,
} from "lucide-react";
import DisclaimerBanner from "@/components/DisclaimerBanner";
import AccountSettings from "@/components/AccountSettings";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import OnboardingOverlay from "@/components/clinic/OnboardingOverlay";
import { useI18n } from "@/lib/i18n";

const portals = [
  {
    titleKey: "home.doctorped_title",
    descKey: "home.doctorped_desc",
    ctaKey: "home.open_clinician",
    icon: Stethoscope,
    path: "/doctorped",
    tone: "lime",
  },
  {
    titleKey: "home.parent_title",
    descKey: "home.parent_desc",
    ctaKey: "home.open_parent",
    icon: Heart,
    path: "/parent",
    tone: "ink",
  },
];

const community = [
  { titleKey: "home.tox_title", descKey: "home.tox_desc", icon: Biohazard, path: "/tox" },
  { titleKey: "home.trauma_title", descKey: "home.trauma_desc", icon: Flame, path: "/trauma" },
  { titleKey: "home.growth_title", descKey: "home.growth_desc", icon: Activity, path: "/growth" },
  { titleKey: "home.nutrition_title", descKey: "home.nutrition_desc", icon: Baby, path: "/nutrition" },
  { titleKey: "home.neurodev_title", descKey: "home.neurodev_desc", icon: Brain, path: "/neurodev" },
  { titleKey: "home.chronic_title", descKey: "home.chronic_desc", icon: Pill, path: "/chronic" },
  { titleKey: "home.syndromes_title", descKey: "home.syndromes_desc", icon: GitBranch, path: "/syndromes" },
  { titleKey: "home.metabolic_title", descKey: "home.metabolic_desc", icon: Droplets, path: "/metabolic" },
  { titleKey: "home.genetics_title", descKey: "home.genetics_desc", icon: Dna, path: "/genetics" },
  { titleKey: "home.csf_title", descKey: "home.csf_desc", icon: Droplets, path: "/csf" },
  { titleKey: "home.us_title", descKey: "home.us_desc", icon: Waves, path: "/us" },
  { titleKey: "home.eeg_title", descKey: "home.eeg_desc", icon: Brain, path: "/eeg" },
  { titleKey: "home.audio_title", descKey: "home.audio_desc", icon: Mic, path: "/audio" },
  { titleKey: "home.referrals_title", descKey: "home.referrals_desc", icon: Bone, path: "/referrals" },
];

const media = [
  { titleKey: "home.ecg_title", descKey: "home.ecg_desc", icon: Activity, path: "/ecg" },
  { titleKey: "home.skin_title", descKey: "home.skin_desc", icon: Stethoscope, path: "/skin" },
  { titleKey: "home.radiology_title", descKey: "home.radiology_desc", icon: ScanLine, path: "/radiology" },
  { titleKey: "home.labs_title", descKey: "home.labs_desc", icon: FlaskConical, path: "/labs" },
];

const knowledge = [
  { titleKey: "home.context_title", descKey: "home.context_desc", icon: UserCog, path: "/patient-context" },
  { titleKey: "home.protocols_title", descKey: "home.protocols_desc", icon: GitBranch, path: "/protocols" },
  { titleKey: "home.differential_title", descKey: "home.differential_desc", icon: ListChecks, path: "/differential" },
  { titleKey: "home.kbadmin_title", descKey: "home.kbadmin_desc", icon: Database, path: "/knowledge-admin" },
];

function ToolGrid({ items, t }) {
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {items.map((tool) => (
        <Link
          key={tool.path}
          to={tool.path}
          className="group rounded-3xl bg-card border border-border p-4 transition-all hover:border-foreground/20 hover:shadow-[0_16px_40px_-30px_rgba(0,0,0,0.6)]"
        >
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
            <div className="w-11 h-11 shrink-0 rounded-full bg-muted grid place-items-center transition-colors group-hover:bg-primary">
              <tool.icon className="w-5 h-5 text-foreground" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-extrabold truncate">{t(tool.titleKey)}</h3>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">{t(tool.descKey)}</p>
            </div>
            <ArrowUpLeft className="w-4 h-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5" />
          </div>
        </Link>
      ))}
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <h2 className="text-xs font-extrabold uppercase tracking-[0.12em] text-muted-foreground">{children}</h2>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

export default function Home() {
  const { t } = useI18n();
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="clinic-page">
      <div className="flex items-center justify-between clinic-wrap pt-[calc(env(safe-area-inset-top)+1rem)]">
        <LanguageSwitcher />
        <button
          onClick={() => setSettingsOpen(true)}
          className="rounded-full bg-card border border-border px-3 py-1.5 text-xs font-bold text-foreground hover:bg-muted flex items-center gap-1.5"
        >
          <Settings className="w-3.5 h-3.5" />
          {t("home.settings")}
        </button>
      </div>

      <header className="clinic-wrap pt-6 pb-7">
        <div className="rounded-[2rem] bg-ink text-background p-6 sm:p-8 relative overflow-hidden">
          <div className="absolute -top-16 -left-10 w-56 h-56 rounded-full bg-primary/20 blur-2xl" aria-hidden />
          <div className="relative grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
            <div className="min-w-0">
              <span className="pilo-chip bg-primary text-primary-foreground">{t("home.not_diagnosis")}</span>
              <h1 className="mt-4 text-3xl sm:text-5xl font-black tracking-tight leading-[1.05]">
                {t("home.brand")}
              </h1>
              <p className="text-sm text-background/70 mt-3 max-w-lg leading-relaxed">{t("home.subtitle")}</p>
            </div>
            <div className="w-14 h-14 shrink-0 rounded-full bg-primary grid place-items-center">
              <Stethoscope className="w-7 h-7 text-primary-foreground" />
            </div>
          </div>
        </div>
      </header>

      <main className="clinic-wrap pb-10 space-y-8">
        <section className="grid md:grid-cols-2 gap-4">
          {portals.map((p) => {
            const lime = p.tone === "lime";
            return (
              <Link
                key={p.path}
                to={p.path}
                className={`group rounded-[2rem] p-6 transition-transform hover:-translate-y-0.5 ${
                  lime ? "bg-primary text-primary-foreground" : "bg-ink text-background"
                }`}
              >
                <div className="flex items-center justify-between">
                  <p.icon className="w-8 h-8" />
                  <span
                    className={`w-9 h-9 rounded-full grid place-items-center ${
                      lime ? "bg-ink text-primary" : "bg-primary text-primary-foreground"
                    }`}
                  >
                    <ArrowUpLeft className="w-4 h-4" />
                  </span>
                </div>
                <h2 className="text-2xl font-black mt-6 tracking-tight">{t(p.titleKey)}</h2>
                <p className={`text-sm mt-2 leading-relaxed ${lime ? "text-primary-foreground/70" : "text-background/70"}`}>
                  {t(p.descKey)}
                </p>
                <span
                  className={`inline-block mt-5 text-xs font-bold rounded-full px-3 py-1 ${
                    lime ? "bg-ink/10" : "bg-background/10"
                  }`}
                >
                  {t(p.ctaKey)}
                </span>
              </Link>
            );
          })}
        </section>

        <section>
          <SectionTitle>{t("home.group_community")}</SectionTitle>
          <ToolGrid items={community} t={t} />
        </section>
        <section>
          <SectionTitle>{t("home.group_media")}</SectionTitle>
          <ToolGrid items={media} t={t} />
        </section>
        <section>
          <SectionTitle>{t("home.group_knowledge")}</SectionTitle>
          <ToolGrid items={knowledge} t={t} />
        </section>

        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: ShieldCheck, labelKey: "home.feat_privacy" },
            { icon: Activity, labelKey: "home.feat_instant" },
            { icon: Heart, labelKey: "home.feat_ai" },
          ].map((feat) => (
            <div key={feat.labelKey} className="text-center p-4 rounded-3xl bg-card border border-border">
              <feat.icon className="w-5 h-5 mx-auto text-foreground mb-1.5" />
              <p className="text-[11px] font-bold text-muted-foreground">{t(feat.labelKey)}</p>
            </div>
          ))}
        </div>
        <DisclaimerBanner />
      </main>

      <AccountSettings open={settingsOpen} onOpenChange={setSettingsOpen} />
      <OnboardingOverlay />
    </div>
  );
}
