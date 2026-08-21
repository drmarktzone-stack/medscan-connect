import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Heart, Lock, Loader2 } from "lucide-react";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get("token");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirm) { setError("הסיסמאות אינן תואמות"); return; }
    setLoading(true);
    setError("");
    try {
      await base44.auth.resetPassword({ resetToken: token, newPassword: password });
      window.location.href = "/login";
    } catch (err) {
      setError("שגיאה באיפוס הסיסמה. ייתכן שהקישור פג תוקף.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-slate-50 flex items-center justify-center p-5" dir="rtl">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-blue-500/25 mb-4">
            <Heart className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-foreground">סיסמה חדשה</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <Lock className="absolute right-3 top-3 w-4 h-4 text-muted-foreground" />
            <Input type="password" placeholder="סיסמה חדשה" value={password} onChange={(e) => setPassword(e.target.value)} className="pr-10 h-11 rounded-xl" required />
          </div>
          <div className="relative">
            <Lock className="absolute right-3 top-3 w-4 h-4 text-muted-foreground" />
            <Input type="password" placeholder="אימות סיסמה" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="pr-10 h-11 rounded-xl" required />
          </div>
          {error && <p className="text-xs text-red-500 text-center">{error}</p>}
          <Button type="submit" className="w-full h-11 rounded-xl font-semibold" disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "עדכן סיסמה"}
          </Button>
        </form>
      </div>
    </div>
  );
}