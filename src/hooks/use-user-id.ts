import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Current auth user id: `undefined` while loading, `null` when signed out. */
export function useUserId() {
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(({ data }) => {
      if (alive) setUserId(data.user?.id ?? null);
    });
    return () => {
      alive = false;
    };
  }, []);
  return userId;
}
