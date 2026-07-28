// Server functions for the admin user management module.
// All mutating functions are gated by `is_super_admin` server-side (the
// `requireSupabaseAuth` middleware identifies the caller; the RPCs and
// admin-API calls re-check). Anti-lockout is enforced inside the RPCs.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SIG_TTL_SECONDS = 60 * 60 * 24 * 365; // 1 year

/** Superadministrador O administrador de algún programa: puede gestionar usuarios. */
async function assertCallerIsAdmin(supabase: any, userId?: string) {
  const uid = userId ?? (await supabase.auth.getUser()).data.user?.id ?? null;
  const { data, error } = await supabase.rpc("can_manage_users", { _user_id: uid });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("forbidden");
}

/** Solo Superadministrador (integraciones, credenciales de plataforma). */
async function assertCallerIsSuperAdmin(supabase: any, userId?: string) {
  const uid = userId ?? (await supabase.auth.getUser()).data.user?.id ?? null;
  const { data, error } = await supabase.rpc("is_super_admin", { _user_id: uid });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("forbidden");
}

// --------------------------------------------------------------
// Read: is the current caller a super-admin? (for UI gating)
// --------------------------------------------------------------
export const checkIsSuperAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("is_super_admin", {
      _user_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return { isAdmin: Boolean(data) };
  });

// --------------------------------------------------------------
// Read: nivel de autorización del usuario actual (para gating de UI)
// --------------------------------------------------------------
export const getMyAuthLevel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [su, pa] = await Promise.all([
      context.supabase.rpc("is_super_admin", { _user_id: context.userId }),
      (context.supabase.rpc as any)("is_any_program_admin", { _user_id: context.userId }),
    ]);
    const isSuperAdmin = Boolean(su.data);
    const isProgramAdmin = Boolean(pa.data);
    return { isSuperAdmin, isProgramAdmin, canManageUsers: isSuperAdmin || isProgramAdmin };
  });

// --------------------------------------------------------------
// Read: list users (admin only)
// Returns: profile + auth metadata (email, last_sign_in_at) + program access
// --------------------------------------------------------------
export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertCallerIsAdmin(context.supabase);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1) all profiles
    const { data: profiles, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, phone, is_active, signature_url, created_at, updated_at")
      .order("created_at", { ascending: false });
    if (pErr) throw new Error(pErr.message);

    // 2) all program access
    const { data: access } = await supabaseAdmin
      .from("user_program_access")
      .select("user_id, program_id, role, modules");


    // 3) all programs (for chip names/colors)
    const { data: programs } = await supabaseAdmin
      .from("programs")
      .select("id, code, name, color_primary");

    // 4) auth.users for email + last_sign_in_at (admin API)
    const emails: Record<string, { email: string | null; last_sign_in_at: string | null }> = {};
    let page = 1;
    while (true) {
      const { data, error } = await (supabaseAdmin as any).auth.admin.listUsers({
        page, perPage: 200,
      });
      if (error) break;
      for (const u of data?.users ?? []) {
        emails[u.id] = { email: u.email ?? null, last_sign_in_at: u.last_sign_in_at ?? null };
      }
      if (!data || data.users.length < 200) break;
      page += 1;
      if (page > 25) break; // safety cap (5k users)
    }

    return {
      programs: programs ?? [],
      users: (profiles ?? []).map((p: any) => ({
        ...p,
        email: emails[p.id]?.email ?? null,
        last_sign_in_at: emails[p.id]?.last_sign_in_at ?? null,
        access: (access ?? []).filter((a: any) => a.user_id === p.id),
      })),
    };
  });

// --------------------------------------------------------------
// Read: single user detail + audit log
// --------------------------------------------------------------
export const getUserDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ user_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCallerIsAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, phone, is_active, signature_url, created_at, updated_at")
      .eq("id", data.user_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!profile) throw new Error("user_not_found");

    const { data: access } = await supabaseAdmin
      .from("user_program_access")
      .select("program_id, role")
      .eq("user_id", data.user_id);

    const { data: programs } = await supabaseAdmin
      .from("programs")
      .select("id, code, name, color_primary");

    const { data: audit } = await supabaseAdmin
      .from("audit_log")
      .select("id, created_at, action, entity_type, entity_id, diff, program_id")
      .or(`user_id.eq.${data.user_id},entity_id.eq.${data.user_id}`)
      .order("created_at", { ascending: false })
      .limit(20);

    // auth metadata
    let email: string | null = null;
    let last_sign_in_at: string | null = null;
    try {
      const { data: auth } = await (supabaseAdmin as any).auth.admin.getUserById(data.user_id);
      email = auth?.user?.email ?? null;
      last_sign_in_at = auth?.user?.last_sign_in_at ?? null;
    } catch { /* ignore */ }

    // Signed URL for signature (private bucket)
    let signature_signed_url: string | null = null;
    if (profile.signature_url) {
      const { data: s } = await supabaseAdmin.storage
        .from("signatures")
        .createSignedUrl(profile.signature_url, SIG_TTL_SECONDS);
      signature_signed_url = s?.signedUrl ?? null;
    }

    // Programs in which this user is the SOLE admin (for UI warnings)
    const sole_admin_programs: string[] = [];
    for (const a of access ?? []) {
      if (a.role !== "admin") continue;
      const { data: isLast } = await supabaseAdmin.rpc("is_last_admin_in_program", {
        _user_id: data.user_id, _program_id: a.program_id,
      });
      if (isLast) sole_admin_programs.push(a.program_id);
    }

    return {
      profile: { ...profile, email, last_sign_in_at, signature_signed_url },
      access: access ?? [],
      programs: programs ?? [],
      audit: audit ?? [],
      sole_admin_programs,
    };
  });

// --------------------------------------------------------------
// Mutate: invite user (admin only)
// Creates auth.users via Admin API → trigger seeds profiles → apply matrix.
// --------------------------------------------------------------
const InviteSchema = z.object({
  email: z.string().email().max(255),
  full_name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(40).optional().nullable(),
  access: z.array(z.object({
    program_id: z.string().uuid(),
    role: z.enum(["none", "admin", "manager", "operator", "claims", "sales", "viewer"]),
  })).max(50),
});

export const inviteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => InviteSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertCallerIsAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Check email uniqueness in a friendly way
    try {
      const { data: existing } = await (supabaseAdmin as any).auth.admin.listUsers({
        page: 1, perPage: 200,
      });
      const dup = (existing?.users ?? []).find((u: any) =>
        (u.email ?? "").toLowerCase() === data.email.toLowerCase(),
      );
      if (dup) throw new Error("email_already_exists");
    } catch (e: any) {
      if (String(e?.message) === "email_already_exists") throw e;
      // listUsers failure should not block invite; admin API will surface dup too.
    }

    const { data: invited, error } = await (supabaseAdmin as any).auth.admin.inviteUserByEmail(
      data.email,
      { data: { full_name: data.full_name } },
    );
    if (error) throw new Error(error.message ?? "invite_failed");
    const userId = invited?.user?.id;
    if (!userId) throw new Error("invite_no_user_id");

    // Apply phone + access matrix (RPC validates admin caller)
    const { error: rpcErr } = await context.supabase.rpc("apply_invite_access_matrix" as any, {
      _user_id: userId,
      _phone: data.phone ?? null,
      _access: data.access.filter((a) => a.role !== "none") as any,
    });
    if (rpcErr) throw new Error(rpcErr.message);

    return { ok: true, user_id: userId };
  });

// --------------------------------------------------------------
// Mutate: create user directly with email + password (admin only)
// No invitation email — admin sets the password and hands it to the user.
// --------------------------------------------------------------
const ModuleEnum = z.enum([
  "clients","policies","payments","finance","incidents","hospitals","alerts","sales_reps","reports",
]);

const CreateDirectSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(72),
  full_name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(40).optional().nullable(),
  access: z.array(z.object({
    program_id: z.string().uuid(),
    role: z.enum(["none", "admin", "manager", "operator", "claims", "sales", "viewer"]),
    modules: z.array(ModuleEnum).optional().nullable(),
  })).max(50),
});

export const createUserDirect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateDirectSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertCallerIsAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error } = await (supabaseAdmin as any).auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (error) {
      const msg = String(error.message ?? "");
      if (msg.toLowerCase().includes("already")) throw new Error("email_already_exists");
      throw new Error(msg || "create_failed");
    }
    const userId = created?.user?.id;
    if (!userId) throw new Error("create_no_user_id");

    if (data.phone) {
      await supabaseAdmin.from("profiles").update({ phone: data.phone }).eq("id", userId);
    }
    const rows = data.access
      .filter((a) => a.role !== "none")
      .map((a) => ({
        user_id: userId,
        program_id: a.program_id,
        role: a.role,
        modules: a.modules && a.modules.length > 0 ? a.modules : null,
      }));
    if (rows.length > 0) {
      const { error: aErr } = await supabaseAdmin
        .from("user_program_access")
        .upsert(rows as any, { onConflict: "user_id,program_id" });
      if (aErr) throw new Error(aErr.message);
    }

    return { ok: true, user_id: userId, email: data.email };
  });

// --------------------------------------------------------------
// Mutate: update a single user's access to one program (role + modules)
// --------------------------------------------------------------
export const updateUserAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      user_id: z.string().uuid(),
      program_id: z.string().uuid(),
      role: z.enum(["none", "admin", "manager", "operator", "claims", "sales", "viewer"]),
      modules: z.array(ModuleEnum).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("update_user_program_access" as any, {
      _user_id: data.user_id,
      _program_id: data.program_id,
      _role_text: data.role,
      _modules: data.modules && data.modules.length > 0 ? data.modules : null,
    } as any);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --------------------------------------------------------------
// Read: modules the current user has, per program
// --------------------------------------------------------------
export const getMyModules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("user_program_access")
      .select("program_id, role, modules")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { access: data ?? [] };
  });

// --------------------------------------------------------------
// Seed: 11 usuarios Zemgo predefinidos (idempotente)
// --------------------------------------------------------------
type Mod = z.infer<typeof ModuleEnum>;
const ALL_MODULES: Mod[] = ["clients","policies","payments","finance","incidents","hospitals","alerts","sales_reps","reports"];

const ZEMGO_USERS: Array<{
  email: string; full_name: string;
  programs: Array<"FUTCARE"|"ABC"|"MCV">;
  modules: Mod[];
}> = [
  { email: "javier.moro@zemgo.local",       full_name: "Javier Moro",       programs: ["FUTCARE"],              modules: ALL_MODULES },
  { email: "graciela.rivera@zemgo.local",   full_name: "Graciela Rivera",   programs: ["ABC","MCV"],            modules: ALL_MODULES },
  { email: "laura.castro@zemgo.local",      full_name: "Laura Castro",      programs: ["FUTCARE","ABC","MCV"],  modules: ["payments","finance","sales_reps"] },
  { email: "lucia.saldana@zemgo.local",     full_name: "Lucía Saldaña",     programs: ["FUTCARE","ABC","MCV"],  modules: ["clients","incidents","hospitals","reports"] },
  { email: "andrea.rodriguez@zemgo.local",  full_name: "Andrea Rodríguez",  programs: ["FUTCARE","ABC","MCV"],  modules: ["clients","payments","alerts"] },
  { email: "alisson@zemgo.local",           full_name: "Alisson",           programs: ["FUTCARE","ABC","MCV"],  modules: ["clients","policies","hospitals","alerts"] },
  { email: "saira@zemgo.local",             full_name: "Saira",             programs: ["FUTCARE","ABC","MCV"],  modules: ["clients","policies","payments","finance","alerts","sales_reps","reports"] },
  { email: "ing.javier@zemgo.local",        full_name: "Ing. Javier",       programs: ["FUTCARE","ABC","MCV"],  modules: ALL_MODULES },
  { email: "alan.gomez@zemgo.local",        full_name: "Alan Gómez",        programs: ["FUTCARE","ABC","MCV"],  modules: ALL_MODULES },
  { email: "alejandro@zemgo.local",         full_name: "Alejandro",         programs: ["FUTCARE","ABC","MCV"],  modules: ALL_MODULES },
  { email: "abelardo@zemgo.local",          full_name: "Abelardo",          programs: ["FUTCARE","ABC","MCV"],  modules: ALL_MODULES },
];

export const seedZemgoUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ password: z.string().min(8).max(72) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertCallerIsAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Resolve programs by code
    const { data: programs } = await supabaseAdmin.from("programs").select("id, code");
    const codeMap = new Map<string, string>();
    for (const p of programs ?? []) codeMap.set(String(p.code).toUpperCase(), p.id);

    // Existing users by email
    const emailToId = new Map<string, string>();
    let page = 1;
    while (true) {
      const { data } = await (supabaseAdmin as any).auth.admin.listUsers({ page, perPage: 200 });
      for (const u of data?.users ?? []) if (u.email) emailToId.set(u.email.toLowerCase(), u.id);
      if (!data || data.users.length < 200) break;
      page += 1; if (page > 25) break;
    }

    const results: Array<{ email: string; status: string; user_id?: string }> = [];

    for (const u of ZEMGO_USERS) {
      let userId = emailToId.get(u.email.toLowerCase());
      let status: string;

      if (!userId) {
        const { data: created, error } = await (supabaseAdmin as any).auth.admin.createUser({
          email: u.email,
          password: data.password,
          email_confirm: true,
          user_metadata: { full_name: u.full_name },
        });
        if (error) { results.push({ email: u.email, status: "error:" + error.message }); continue; }
        userId = created?.user?.id;
        status = "created";
      } else {
        // Reset password so admin can hand out the same temp password
        await (supabaseAdmin as any).auth.admin.updateUserById(userId, { password: data.password });
        await supabaseAdmin.from("profiles").update({ full_name: u.full_name }).eq("id", userId);
        status = "updated";
      }

      if (!userId) continue;

      // Program access with modules — replace fully
      await supabaseAdmin.from("user_program_access").delete().eq("user_id", userId);
      const rows = u.programs
        .map((code) => codeMap.get(code))
        .filter((id): id is string => !!id)
        .map((program_id) => ({
          user_id: userId!, program_id, role: "operator" as const, modules: u.modules,
        }));
      if (rows.length) await supabaseAdmin.from("user_program_access").insert(rows as any);

      results.push({ email: u.email, status, user_id: userId });
    }

    return { ok: true, password: data.password, results };
  });


export const deactivateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ user_id: z.string().uuid(), reason: z.string().trim().min(5).max(500) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("deactivate_user" as any, {
      _user_id: data.user_id, _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    // Sign-out / ban so existing tokens stop working
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await (supabaseAdmin as any).auth.admin.updateUserById(data.user_id, {
        ban_duration: "876000h",
      });
    } catch { /* best-effort */ }
    return { ok: true };
  });

export const reactivateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("reactivate_user" as any, {
      _user_id: data.user_id,
    });
    if (error) throw new Error(error.message);
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await (supabaseAdmin as any).auth.admin.updateUserById(data.user_id, {
        ban_duration: "none",
      });
    } catch { /* ignore */ }
    return { ok: true };
  });

export const forcePasswordReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertCallerIsAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: u, error } = await (supabaseAdmin as any).auth.admin.getUserById(data.user_id);
    if (error || !u?.user?.email) throw new Error("user_not_found");
    const { error: lErr } = await (supabaseAdmin as any).auth.admin.generateLink({
      type: "recovery", email: u.user.email,
    });
    if (lErr) throw new Error(lErr.message);
    await context.supabase.from("audit_log").insert({
      user_id: context.userId, entity_type: "profiles",
      entity_id: data.user_id, action: "USER_PASSWORD_RESET_REQUESTED",
      diff: { email: u.user.email } as any,
    });
    return { ok: true };
  });

export const signOutUserSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertCallerIsAdmin(context.supabase);
    if (context.userId === data.user_id) throw new Error("cannot_signout_self");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Short ban → invalidates refresh tokens → unban
    await (supabaseAdmin as any).auth.admin.updateUserById(data.user_id, { ban_duration: "1s" });
    await new Promise((r) => setTimeout(r, 1100));
    await (supabaseAdmin as any).auth.admin.updateUserById(data.user_id, { ban_duration: "none" });
    await context.supabase.from("audit_log").insert({
      user_id: context.userId, entity_type: "profiles",
      entity_id: data.user_id, action: "USER_SESSIONS_REVOKED", diff: {} as any,
    });
    return { ok: true };
  });

// --------------------------------------------------------------
// Signature upload helper: registers the storage path on the profile
// (the actual file upload is done client-side via supabase.storage).
// --------------------------------------------------------------
export const setSignatureUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      user_id: z.string().uuid(),
      storage_path: z.string().min(3).max(500),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // Caller must be self OR admin
    if (context.userId !== data.user_id) {
      await assertCallerIsAdmin(context.supabase);
    }
    const { error } = await context.supabase
      .from("profiles")
      .update({ signature_url: data.storage_path })
      .eq("id", data.user_id);
    if (error) throw new Error(error.message);
    await context.supabase.from("audit_log").insert({
      user_id: context.userId, entity_type: "profiles",
      entity_id: data.user_id, action: "SIGNATURE_UPDATED",
      diff: { storage_path: data.storage_path } as any,
    });
    return { ok: true };
  });

// --------------------------------------------------------------
// Mutate: eliminar usuario permanentemente (superadmin o admin de programa)
// --------------------------------------------------------------
export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ user_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCallerIsAdmin(context.supabase, context.userId);
    if (context.userId === data.user_id) throw new Error("cannot_delete_self");

    // Valida permisos, anti-lockout y limpia perfil/accesos (registra en audit_log)
    const { error } = await (context.supabase.rpc as any)("delete_user_account", {
      _user_id: data.user_id,
    });
    if (error) throw new Error(error.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: dErr } = await (supabaseAdmin as any).auth.admin.deleteUser(data.user_id);
    if (dErr) throw new Error(dErr.message ?? "delete_auth_user_failed");

    return { ok: true };
  });
