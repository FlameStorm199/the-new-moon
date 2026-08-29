// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { jsonResponse, requireAdminCaller } from "../_shared/auth-helpers.ts";
import { sendInviteEmail } from "../_shared/password-flows.ts";

// Unica via per creare un utente con ruolo diverso da "customer": il
// self-signup pubblico (supabase.auth.signUp lato client) può creare SOLO
// customer — mai bypassabile (vedi database/02_auth_signup_trigger.sql).
//
// auth: ["user"] — NON "secret". Il chiamante è un Admin loggato nel
// browser, che manda il proprio JWT come qualsiasi altra chiamata
// autenticata: la sua identità va verificata leggendo public.users tramite
// ctx.supabaseAdmin (bypassa RLS solo per QUESTO controllo), mai fidandosi
// di un ruolo dichiarato dal body. ctx.supabaseAdmin resta comunque
// disponibile in modalità "user" (creato dalla SDK dalla secret key
// dell'ambiente della Edge Function, non da qualcosa che manda il
// chiamante) — è quello che usiamo per le operazioni privilegiate vere e
// proprie (creare l'utente Auth, inserire la riga public.users). La secret
// key non deve MAI essere spedita al client: usarla come modalità di auth
// qui avrebbe significato metterla nel bundle Angular.

interface AdminCreateUserRequest {
  type_code: "customer" | "future_customer" | "assistant" | "trainer" | "admin";
  name: string;
  surname: string;
  email: string;
  phone?: string;
  dog_name?: string;
}

// Rispecchia validate_user_required_fields() di schema_fase1.sql: per questi
// due ruoli telefono e nome del cane sono obbligatori. Non sostituisce il
// vincolo DB (che resta l'enforcement ultimo), solo dà un errore leggibile
// prima di arrivare a chiamare l'Auth Admin API.
const REQUIRES_PHONE_AND_DOG = new Set(["customer", "future_customer"]);

export default {
  fetch: withSupabase({ auth: ["user"] }, async (req, ctx) => {
    let body: AdminCreateUserRequest;
    try {
      body = (await req.json()) as AdminCreateUserRequest;
    } catch {
      return jsonResponse({ error: "Corpo della richiesta non valido." }, 400);
    }

    const caller = await requireAdminCaller(ctx);
    if (!caller) {
      return jsonResponse(
        { error: "Non autorizzato: solo un amministratore può creare utenti." },
        403,
      );
    }

    const { type_code, name, surname, phone, dog_name } = body;
    // Normalizzata qui e riusata ovunque sotto: GoTrue salva l'email in
    // auth.users normalizzata a proprio modo, il confronto con l'annuncio
    // in pending_admin_user_creations nel trigger è comunque case-insensitive
    // (vedi 14_pending_admin_user_creations.sql), ma partire già normalizzati
    // evita qualunque altra discrepanza a valle (es. invio dell'invito).
    const email = body.email?.trim().toLowerCase();
    if (!type_code || !name?.trim() || !surname?.trim() || !email) {
      return jsonResponse({ error: "Nome, cognome, email e ruolo sono obbligatori." }, 400);
    }
    if (REQUIRES_PHONE_AND_DOG.has(type_code) && (!phone?.trim() || !dog_name?.trim())) {
      return jsonResponse(
        { error: "Telefono e nome del cane sono obbligatori per questo ruolo." },
        400,
      );
    }

    const { data: typeRow, error: typeError } = await ctx.supabaseAdmin
      .from("user_types")
      .select("id")
      .eq("code", type_code)
      .single();
    if (typeError || !typeRow) {
      return jsonResponse({ error: "Ruolo non valido." }, 400);
    }

    // "Annuncio" per handle_new_auth_user() (vedi database/14_pending_admin_user_creations.sql):
    // due tentativi precedenti di far riconoscere al trigger un utente creato
    // da qui — via app_metadata.admin_created, poi via encrypted_password is
    // null — sono falliti: GoTrue non espone in tempo nessuno dei due segnali
    // al trigger AFTER INSERT su auth.users. Scriviamo quindi noi stessi,
    // PRIMA di creare l'utente Auth, un annuncio che il trigger consulta per
    // email: un dato che controlliamo interamente, niente da indovinare sul
    // comportamento interno di GoTrue.
    const { error: pendingError } = await ctx.supabaseAdmin
      .from("pending_admin_user_creations")
      .upsert({
        email,
        type_id: typeRow.id,
        name,
        surname,
        phone: phone ?? null,
        dog_name: dog_name ?? null,
      });
    if (pendingError) {
      return jsonResponse({ error: pendingError.message }, 400);
    }

    // email_confirm: true — l'Admin verifica lui stesso l'indirizzo
    // inserendolo a mano; l'unico passo che resta all'utente è impostare la
    // password tramite il link generato sotto, non anche confermare l'email.
    const { data: created, error: createError } = await ctx.supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      app_metadata: { admin_created: true },
      user_metadata: { name, surname, phone: phone ?? null, dog_name: dog_name ?? null },
    });
    if (createError || !created?.user) {
      // Ripulisce l'annuncio: non deve restare agganciabile da un
      // self-signup successivo con la stessa email.
      await ctx.supabaseAdmin.from("pending_admin_user_creations").delete().eq("email", email);
      return jsonResponse({ error: createError?.message ?? "Creazione utente fallita." }, 400);
    }

    // Il trigger handle_new_auth_user() ha già inserito public.users usando
    // l'annuncio sopra, nella stessa transazione dell'INSERT su auth.users.
    // Verifichiamo che sia successo davvero (difesa in profondità: se per
    // qualsiasi motivo l'annuncio non fosse stato trovato, il trigger avrebbe
    // comunque creato una riga, ma come customer — la sistemiamo qui).
    const { data: insertedRow, error: verifyError } = await ctx.supabaseAdmin
      .from("users")
      .select("id, type_id")
      .eq("auth_user_id", created.user.id)
      .maybeSingle();
    if (verifyError) {
      return jsonResponse({ error: verifyError.message }, 400);
    }
    if (!insertedRow) {
      const { error: fallbackInsertError } = await ctx.supabaseAdmin.from("users").insert({
        auth_user_id: created.user.id,
        type_id: typeRow.id,
        name,
        surname,
        email,
        phone: phone ?? null,
        dog_name: dog_name ?? null,
      });
      if (fallbackInsertError) {
        await ctx.supabaseAdmin.auth.admin.deleteUser(created.user.id);
        return jsonResponse({ error: fallbackInsertError.message }, 400);
      }
    } else if (insertedRow.type_id !== typeRow.id) {
      const { error: fixTypeError } = await ctx.supabaseAdmin
        .from("users")
        .update({ type_id: typeRow.id })
        .eq("id", insertedRow.id);
      if (fixTypeError) {
        return jsonResponse({ error: fixTypeError.message }, 400);
      }
    }

    const invite = await sendInviteEmail(ctx.supabaseAdmin, email);
    if (!invite.ok) {
      // L'utente esiste già a questo punto: non è un errore da bloccare, ma
      // va segnalato all'Admin (es. può rimandare l'invito da
      // manage-user-password/admin_invite una volta sistemato Resend).
      return jsonResponse(
        {
          warning: `Utente creato, ma l'invio dell'email di invito è fallito: ${invite.error}`,
          user_id: created.user.id,
        },
        207,
      );
    }

    return jsonResponse({ user_id: created.user.id });
  }),
};
