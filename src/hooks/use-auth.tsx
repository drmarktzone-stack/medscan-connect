import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/types/doctorped";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const hydrate = async () => {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      setUser(data.user ?? null);
      if (data.user) {
        const { data: roleRow } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id).maybeSingle();
        if (active) setRole(roleRow?.role ?? "parent");
      } else {
        setRole(null);
      }
      if (active) setLoading(false);
    };
    void hydrate();
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      setUser(session?.user ?? null);
      void hydrate();
    });
    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  return { user, role, loading };
}