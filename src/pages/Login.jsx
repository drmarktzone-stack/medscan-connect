import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Stethoscope, Mail, Lock, Loader2, Monitor } from "lucide-react";
import { Link } from "react-router-dom";
import { enableLocalClinic } from "@/lib/clinic/localMode";
import { useI18n } from "@/lib/i18n";

export default function Login() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await base44.auth.loginViaEmailPassword(email, password);
      window.location.href = "/";
    } catch (err) {
      setError(t("login.bad_credentials"));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    base44.auth.loginWithProvider("google", "/");
  };

  const enterLocal = () => {
    enableLocalClinic();
    window.location.href = "/";
  };

  return (
    <div className="min-h-screen bg-[hsl(204,36%,97%)] flex items-center justify-center p-5" dir="rtl">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-cyan-800 to-teal-500 flex items-center justify-center shadow-lg shadow-cyan-900/20 mb-4">
            <Stethoscope className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-foreground">{t("home.brand")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("login.local_title")}</p>
        </div>

        <Button onClick={enterLocal} className="w-full h-12 rounded-xl font-bold">
          <Monitor className="w-4 h-4" />
          {t("clinic.local_enter")}
        </Button>
        <p className="text-[11px] text-center text-slate-500 leading-relaxed">{t("clinic.local_enter_hint")}</p>

        <div className="relative">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
          <div className="relative flex justify-center text-xs"><span className="bg-[hsl(204,36%,97%)] px-3 text-muted-foreground">{t("login.or_account")}</span></div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <Mail className="absolute right-3 top-3 w-4 h-4 text-muted-foreground" />
            <Input
              type="email"
              placeholder={t("login.email")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pr-10 h-11 rounded-xl"
              required
            />
          </div>
          <div className="relative">
            <Lock className="absolute right-3 top-3 w-4 h-4 text-muted-foreground" />
            <Input
              type="password"
              placeholder={t("login.password")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pr-10 h-11 rounded-xl"
              required
            />
          </div>

          {error && <p className="text-xs text-red-500 text-center">{error}</p>}

          <Button type="submit" variant="outline" className="w-full h-11 rounded-xl font-semibold" disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : t("login.submit")}
          </Button>
        </form>

        <Button variant="outline" onClick={handleGoogleLogin} className="w-full h-11 rounded-xl font-medium">
          {t("login.google")}
        </Button>

        <div className="text-center space-y-2">
          <Link to="/forgot-password" className="text-xs text-primary hover:underline block">{t("login.forgot")}</Link>
          <p className="text-xs text-muted-foreground">
            {t("login.no_account")}{" "}
            <Link to="/register" className="text-primary hover:underline font-medium">{t("login.register")}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
