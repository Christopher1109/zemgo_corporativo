import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth-context";
import { getMyModules, getMyAuthLevel } from "@/lib/users.functions";

export type ModuleKey =
  | "clients" | "policies" | "payments" | "finance"
  | "incidents" | "hospitals" | "alerts" | "sales_reps" | "reports" | "messages";

export type AccessRow = { program_id: string; role: string; modules: string[] | null };

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

/** Nivel de autorización global del usuario (superadmin / admin de programa). */
export function useAuthLevel() {
  const { user } = useAuth();
  const fn = useServerFn(getMyAuthLevel);
  return useQuery({
    queryKey: ["my-auth-level", user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async () =>
      (await fn()) as { isSuperAdmin: boolean; isProgramAdmin: boolean; canManageUsers: boolean },
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

/** Módulos permitidos para UN programa concreto. `"all"` = sin restricción. */
export function modulesForProgram(
  access: AccessRow[] | undefined,
  programId: string | null | undefined,
): Set<ModuleKey> | "all" | "none" {
  if (!access) return "none";
  if (!programId) return "none";
  const row = access.find((a) => a.program_id === programId);
  if (!row) return "none";
  if (!row.modules || row.modules.length === 0) return "all";
  return new Set(row.modules as ModuleKey[]);
}

export function canAccessModule(
  mods: Set<ModuleKey> | "all" | "none" | undefined,
  key: ModuleKey,
): boolean {
  if (!mods) return false;
  if (mods === "all") return true;
  if (mods === "none") return false;
  return mods.has(key);
}
