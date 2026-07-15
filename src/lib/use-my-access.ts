import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth-context";
import { getMyModules } from "@/lib/users.functions";

export type ModuleKey =
  | "clients" | "policies" | "payments" | "finance"
  | "incidents" | "hospitals" | "alerts" | "sales_reps" | "reports";

type AccessRow = { program_id: string; role: string; modules: string[] | null };

export function useMyAccess() {
  const { user } = useAuth();
  const fn = useServerFn(getMyModules);
  return useQuery({
    queryKey: ["my-modules", user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const r = (await fn()) as { access: AccessRow[] };
      return r.access;
    },
  });
}

/** Union of all modules across a user's programs. `null` modules = all. */
export function unionModules(access: AccessRow[] | undefined): Set<ModuleKey> | "all" {
  if (!access || access.length === 0) return new Set<ModuleKey>();
  const s = new Set<ModuleKey>();
  for (const a of access) {
    if (!a.modules || a.modules.length === 0) return "all";
    for (const m of a.modules) s.add(m as ModuleKey);
  }
  return s;
}

export function canAccessModule(
  mods: Set<ModuleKey> | "all" | undefined,
  key: ModuleKey,
): boolean {
  if (!mods) return true; // loading — don't hide yet
  if (mods === "all") return true;
  return mods.has(key);
}
