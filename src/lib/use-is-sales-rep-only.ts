import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

/**
 * true = el usuario está ligado a un vendedor activo, no tiene filas en
 * user_program_access y no es superadmin. Esos usuarios solo ven /mi-cartera.
 */
export function useIsSalesRepOnly() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["is-sales-rep-only", user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("is_sales_rep_only");
      if (error) return false;
      return !!data;
    },
  });
}
