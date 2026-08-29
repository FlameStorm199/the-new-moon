// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { createContextClient } from "@supabase/server/core";
import { jsonResponse, requireAdminCaller } from "../_shared/auth-helpers.ts";
import { sendForcedResetEmail, sendInviteEmail, sendSelfResetEmail } from "../_shared/password-flows.ts";

// Punto centrale UNICO per ogni email di tipo reset/imposta/invita password.
// Nessun flusso password parte MAI direttamente da una chiamata Auth lato
// frontend (niente supabase.auth.resetPasswordForEmail() diretto dal
// client): tutti passano da qui, che valida le regole di business ("chi può
// richiederla, per chi") prima di invocare service_role.
//
// auth: ["user", "publishable"] — NON "secret" (mai la secret key nel
// client). Un JWT valido soddisfa "user" (self_change, admin_invite,
// admin_force_reset: tutti richiedono un chiamante autenticato, verificato
// sotto per ogni azione). self_reset_request deve invece funzionare anche
// per chi NON è loggato (ha dimenticato la password): per lui non c'è nessun
// JWT, ma il client supabase-js manda comunque sempre l'header apikey con la
// publishable key di progetto, che quindi soddisfa la modalità "publishable"
// e fa passare la richiesta. ctx.authMode dice quale delle due è scattata.

type PasswordAction = "self_reset_request" | "admin_invite" | "admin_force_reset" | "self_change";

interface ManagePasswordRequest {
  action: PasswordAction;
  email?: string;
  target_user_id?: number;
  current_password?: string;
  new_password?: string;
}

const MIN_PASSWORD_LENGTH = 8;

export default {
  fetch: withSupabase({ auth: ["user", "publishable"] }, async (req, ctx) => {
    let body: ManagePasswordRequest;
    try {
      body = (await req.json()) as ManagePasswordRequest;
    } catch {
      return jsonResponse({ error: "Corpo della richiesta non valido." }, 400);
    }

    switch (body.action) {
      case "self_reset_request":
        return handleSelfResetRequest(ctx, body);
      case "admin_invite":
        return handleAdminInvite(ctx, body);
      case "admin_force_reset":
        return handleAdminForceReset(ctx, body);
      case "self_change":
        return handleSelfChange(ctx, body);
      default:
        return jsonResponse({ error: "Azione non riconosciuta." }, 400);
    }
  }),
};

// deno-lint-ignore no-explicit-any
async function handleSelfResetRequest(ctx: any, body: ManagePasswordRequest): Promise<Response> {
  const email = body.email?.trim();
  if (!email) {
    return jsonResponse({ error: "Indica l'indirizzo email." }, 400);
  }

  // Risposta sempre generica e sempre "ok", email esista o meno: altrimenti
  // la risposta stessa diventerebbe un modo per scoprire quali indirizzi
  // sono registrati (user enumeration). L'eventuale fallimento va solo nei
  // log server, mai nella risposta al chiamante.
  const result = await sendSelfResetEmail(ctx.supabaseAdmin, email);
  if (!result.ok) {
    console.error(`self_reset_request fallito per ${email}: ${result.error}`);
  }
  return jsonResponse({ message: "Se l'indirizzo è registrato, riceverai un'email a breve." });
}

// deno-lint-ignore no-explicit-any
async function handleAdminInvite(ctx: any, body: ManagePasswordRequest): Promise<Response> {
  const admin = await requireAdminCaller(ctx);
  if (!admin) {
    return jsonResponse({ error: "Non autorizzato." }, 403);
  }
  const target = await loadTargetUser(ctx, body.target_user_id);
  if (!target) {
    return jsonResponse({ error: "Utente destinatario non trovato." }, 404);
  }

  const result = await sendInviteEmail(ctx.supabaseAdmin, target.email);
  if (!result.ok) {
    return jsonResponse({ error: result.error }, 502);
  }
  return jsonResponse({ message: "Invito inviato." });
}

// deno-lint-ignore no-explicit-any
async function handleAdminForceReset(ctx: any, body: ManagePasswordRequest): Promise<Response> {
  const admin = await requireAdminCaller(ctx);
  if (!admin) {
    return jsonResponse({ error: "Non autorizzato." }, 403);
  }
  const target = await loadTargetUser(ctx, body.target_user_id);
  if (!target) {
    return jsonResponse({ error: "Utente destinatario non trovato." }, 404);
  }

  const result = await sendForcedResetEmail(ctx.supabaseAdmin, target.email);
  if (!result.ok) {
    return jsonResponse({ error: result.error }, 502);
  }
  return jsonResponse({ message: "Email di reimpostazione inviata." });
}

// deno-lint-ignore no-explicit-any
async function handleSelfChange(ctx: any, body: ManagePasswordRequest): Promise<Response> {
  if (ctx.authMode !== "user" || !ctx.userClaims) {
    return jsonResponse({ error: "Devi essere autenticato per cambiare la tua password." }, 401);
  }
  const currentPassword = body.current_password;
  const newPassword = body.new_password;
  if (!currentPassword || !newPassword) {
    return jsonResponse({ error: "Indica sia la password attuale sia quella nuova." }, 400);
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return jsonResponse(
      { error: `La nuova password deve avere almeno ${MIN_PASSWORD_LENGTH} caratteri.` },
      400,
    );
  }

  const email = ctx.userClaims.email;
  if (!email) {
    return jsonResponse({ error: "Impossibile determinare l'email dell'account." }, 400);
  }

  // Verifica la password attuale con un tentativo di login "a vuoto" su un
  // client anonimo separato: è l'unico modo per far confermare a Supabase
  // Auth che quella è davvero la password corrente, il JWT già in mano al
  // chiamante non lo dimostra (potrebbe essere ancora valido da tempo).
  const verifyClient = createContextClient();
  const { error: verifyError } = await verifyClient.auth.signInWithPassword({
    email,
    password: currentPassword,
  });
  if (verifyError) {
    return jsonResponse({ error: "Password attuale non corretta." }, 401);
  }

  const { error: updateError } = await ctx.supabaseAdmin.auth.admin.updateUserById(
    ctx.userClaims.id,
    { password: newPassword },
  );
  if (updateError) {
    return jsonResponse({ error: updateError.message }, 400);
  }

  return jsonResponse({ message: "Password aggiornata." });
}

// deno-lint-ignore no-explicit-any
async function loadTargetUser(
  ctx: any,
  targetUserId: number | undefined,
): Promise<{ id: number; email: string } | null> {
  if (!targetUserId) return null;
  const { data, error } = await ctx.supabaseAdmin
    .from("users")
    .select("id, email")
    .eq("id", targetUserId)
    .is("deleted_at", null)
    .single();
  if (error || !data) return null;
  return data;
}
