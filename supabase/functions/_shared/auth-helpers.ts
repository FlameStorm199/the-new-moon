import type { SupabaseContext } from "@supabase/server";

// Helper condiviso da admin-create-user e manage-user-password per verificare
// CHI sta chiamando, leggendo la riga public.users del chiamante con
// ctx.supabaseAdmin (bypassa RLS: siamo noi stessi a fare qui il controllo di
// autorizzazione, non deleghiamo a RLS). Non fidarsi mai di un ruolo passato
// nel body della richiesta — solo di ctx.userClaims.id, che viene dal JWT
// verificato dalla SDK (@supabase/server), quindi non falsificabile dal client.

export interface CallerAppUser {
  id: number;
  type_id: number;
  email: string;
  name: string;
  surname: string;
}

// deno-lint-ignore no-explicit-any
export async function loadCallerAppUser(ctx: SupabaseContext<any>): Promise<CallerAppUser | null> {
  const authUserId = ctx.userClaims?.id;
  if (!authUserId) return null;

  const { data, error } = await ctx.supabaseAdmin
    .from("users")
    .select("id, type_id, email, name, surname")
    .eq("auth_user_id", authUserId)
    .is("deleted_at", null)
    .single();

  if (error || !data) return null;
  return data as CallerAppUser;
}

// deno-lint-ignore no-explicit-any
export async function requireAdminCaller(ctx: SupabaseContext<any>): Promise<CallerAppUser | null> {
  const caller = await loadCallerAppUser(ctx);
  if (!caller) return null;

  const { data: typeRow, error } = await ctx.supabaseAdmin
    .from("user_types")
    .select("code")
    .eq("id", caller.type_id)
    .single();

  if (error || !typeRow || typeRow.code !== "admin") return null;
  return caller;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
