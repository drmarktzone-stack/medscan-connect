import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Heart, Mail, Lock, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

export default function Register() {
  const [step, setStep] = useState("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleRegister = async (e) => {
    e.preventDefault();
    if (password !== confirm) { setError("הסיסמאות אינן תואמות"); return; }
    setLoading(true);
    setError("");
    try {
      await base44.auth.register({ email, password });
      setStep("otp");
    } catch (err) {
      setError("שגיאה בהרשמה. ייתכן שהאימייל כבר קיים.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    setLoading(true);
    setError("");
    try {
      const { access_token } = await base44.auth.verifyOtp({ email, otpCode: otp });
      base44.auth.setToken(access_token);
      window.location.href = "/";
    } catch (err) {
      setError("קוד אימות שגוי");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    try {
      await base44.auth.resendOtp(email);
    } catch {}
  };

  const handleGoogleLogin = () => {
    base44.auth.loginWithProvider("google", "/");
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-slate-50 flex items-center justify-center p-5" dir="rtl">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-blue-500/25 mb-4">
            <Heart className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-foreground">MedScan AI</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {step === "register" ? "צור חשבון חדש" : "הזן את קוד האימות"}
          </p>
        </div>

        {step === "register" ? (
          <>
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="relative">
                <Mail className="absolute right-3 top-3 w-4 h-4 text-muted-foreground" />
                <Input type="email" placeholder="אימייל" value={email} onChange={(e) => setEmail(e.target.value)} className="pr-10 h-11 rounded-xl" required />
              </div>
              <div className="relative">
                <Lock className="absolute right-3 top-3 w-4 h-4 text-muted-foreground" />
                <Input type="password" placeholder="סיסמה" value={password} onChange={(e) => setPassword(e.target.value)} className="pr-10 h-11 rounded-xl" required />
              </div>
              <div className="relative">
                <Lock className="absolute right-3 top-3 w-4 h-4 text-muted-foreground" />
                <Input type="password" placeholder="אימות סיסמה" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="pr-10 h-11 rounded-xl" required />
              </div>
              {error && <p className="text-xs text-red-500 text-center">{error}</p>}
              <Button type="submit" className="w-full h-11 rounded-xl font-semibold" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "הירשם"}
              </Button>
            </form>

            <div className="relative">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
              <div className="relative flex justify-center text-xs"><span className="bg-white px-3 text-muted-foreground">או</span></div>
            </div>

            <Button variant="outline" onClick={handleGoogleLogin} className="w-full h-11 rounded-xl font-medium">
              <svg className="w-4 h-4 ml-2" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
              הירשם עם Google
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              כבר יש לך חשבון?{" "}
              <Link to="/login" className="text-primary hover:underline font-medium">התחבר</Link>
            </p>
          </>
        ) : (
          <div className="space-y-5">
            <p className="text-xs text-muted-foreground text-center">שלחנו קוד אימות ל-{email}</p>
            <div className="flex justify-center" dir="ltr">
              <InputOTP maxLength={6} value={otp} onChange={setOtp}>
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </div>
            {error && <p className="text-xs text-red-500 text-center">{error}</p>}
            <Button onClick={handleVerify} className="w-full h-11 rounded-xl font-semibold" disabled={loading || otp.length < 6}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "אמת"}
            </Button>
            <button onClick={handleResend} className="text-xs text-primary hover:underline block mx-auto">שלח קוד שוב</button>
          </div>
        )}
      </div>
    </div>
  );
}