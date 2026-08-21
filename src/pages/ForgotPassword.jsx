import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Heart, Mail, Loader2, CheckCircle } from "lucide-react";
import { Link } from "react-router-dom";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await base44.auth.resetPasswordRequest(email);
    } catch {}
    setSent(true);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-slate-50 flex items-center justify-center p-5" dir="rtl">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-blue-500/25 mb-4">
            <Heart className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-foreground">איפוס סיסמה</h1>
        </div>

        {sent ? (
          <div className="text-center space-y-3">
            <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto" />
            <p className="text-sm text-muted-foreground">אם החשבון קיים, נשלח קישור לאיפוס סיסמה לאימייל שלך.</p>
            <Link to="/login" className="text-xs text-primary hover:underline block">חזור להתחברות</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Mail className="absolute right-3 top-3 w-4 h-4 text-muted-foreground" />
              <Input type="email" placeholder="אימייל" value={email} onChange={(e) => setEmail(e.target.value)} className="pr-10 h-11 rounded-xl" required />
            </div>
            <Button type="submit" className="w-full h-11 rounded-xl font-semibold" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "שלח קישור איפוס"}
            </Button>
            <Link to="/login" className="text-xs text-primary hover:underline block text-center">חזור להתחברות</Link>
          </form>
        )}
      </div>
    </div>
  );
}