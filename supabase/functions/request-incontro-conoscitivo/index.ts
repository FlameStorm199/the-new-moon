// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { jsonResponse } from "../_shared/auth-helpers.ts";
import { sendIncontroConoscitivoConfirmationEmail } from "../_shared/email-confirmation.ts";

// Punto di ingresso PUBBLICO (nessun login) del form "Incontro Conoscitivo"
// (giorno 3: pagina /incontro-conoscitivo, fuori navbar). Crea un utente
// future_customer con lo stesso meccanismo già usato per lo staff in
// admin-create-user (admin.createUser + service_role), MAI
// supabase.auth.signUp() lato client: quella via crea sempre e solo customer
// (vedi database/02_auth_signup_trigger.sql) e non permette di impostare
// app_metadata.admin_created.
//
// auth: ["publishable"] — stesso pattern di manage-user-password per
// self_reset_request: nessun JWT (il chiamante non è loggato), ma il client
// supabase-js manda comunque l'header apikey con la publishable key di
// progetto, che soddisfa questa modalità.
//
// email_confirm: false — a differenza di admin-create-user (email_confirm:
// true, perché lì è l'Admin a verificare l'indirizzo di persona), qui
// l'indirizzo lo scrive il pubblico: va confermato con un click. Vedi
// _shared/email-confirmation.ts e il trigger trg_auth_user_email_confirmed
// in database/26_fase2_schema.sql.
//
// pending_admin_user_creations: handle_new_auth_user() NON si fa più da
// parte per gli utenti creati dall'Admin API (versione originale in
// 02_auth_signup_trigger.sql, superata) — dopo 13_fix_admin_created_trigger.sql
// e soprattutto 14_pending_admin_user_creations.sql (la definizione
// ATTUALE), il trigger consulta questa tabella per email PRIMA di decidere:
// se non trova un annuncio recente, inserisce comunque la riga come
// customer (type_id=1). Bisogna quindi scrivere l'annuncio qui, PRIMA di
// createUser(), esattamente come fa admin-create-user — niente insert
// diretto su public.users dopo la creazione, sarebbe un duplicate key su
// auth_user_id (riga già creata dal trigger).
//
// Nessuna scelta di ruolo esposta al chiamante (a differenza di
// admin-create-user): qui il type_id è sempre e solo future_customer,
// deciso da questa funzione, mai dal body della richiesta.

interface IncontroConoscitivoRequest {
  name: string;
  surname: string;
  email: string;
  phone: string;
  dog_name: string;
}

export default {
  fetch: withSupabase({ auth: ["publishable"] }, async (req, ctx) => {
    let body: IncontroConoscitivoRequest;
    try {
      body = (await req.json()) as IncontroConoscitivoRequest;
    } catch {
      return jsonResponse({ error: "Corpo della richiesta non valido." }, 400);
    }

    const email = body.email?.trim().toLowerCase();
    const name = body.name?.trim();
    const surname = body.surname?.trim();
    const phone = body.phone?.trim();
    const dogName = body.dog_name?.trim();

    // Rispecchia validate_user_required_fields() (trigger DB già esistente
    // da Fase 1): per future_customer email/telefono/nome cane sono
    // obbligatori. Non sostituisce il vincolo DB, solo un errore leggibile
    // prima di arrivare a chiamare l'Auth Admin API.
    if (!name || !surname || !email || !phone || !dogName) {
      return jsonResponse(
        { error: "Nome, cognome, email, telefono e nome del cane sono obbligatori." },
        400,
      );
    }

    const { data: typeRow, error: typeError } = await ctx.supabaseAdmin
      .from("user_types")
      .select("id")
      .eq("code", "future_customer")
      .single();
    if (typeError || !typeRow) {
      return jsonResponse({ error: "Configurazione ruoli non valida." }, 500);
    }

    // Annuncio per handle_new_auth_user() (14_pending_admin_user_creations.sql):
    // va scritto PRIMA di creare l'utente Auth, altrimenti il trigger non lo
    // trova e inserisce la riga come customer.
    const { error: pendingError } = await ctx.supabaseAdmin
      .from("pending_admin_user_creations")
      .upsert({
        email,
        type_id: typeRow.id,
        name,
        surname,
        phone,
        dog_name: dogName,
      });
    if (pendingError) {
      return jsonResponse({ error: pendingError.message }, 400);
    }

    const { data: created, error: createError } = await ctx.supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: false,
      app_metadata: { admin_created: true },
      user_metadata: { name, surname, phone, dog_name: dogName },
    });
    if (createError || !created?.user) {
      // Ripulisce l'annuncio: non deve restare agganciabile da un
      // self-signup successivo con la stessa email.
      await ctx.supabaseAdmin.from("pending_admin_user_creations").delete().eq("email", email);
      return jsonResponse(
        { error: createError?.message ?? "Richiesta non riuscita, riprova." },
        400,
      );
    }

    // Il trigger ha già inserito public.users usando l'annuncio sopra, nella
    // stessa transazione dell'INSERT su auth.users. Verifichiamo che sia
    // successo davvero (difesa in profondità, stesso pattern di
    // admin-create-user): se per qualsiasi motivo l'annuncio non fosse
    // stato trovato, il trigger avrebbe comunque creato una riga, ma come
    // customer — la sistemiamo qui.
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
        phone,
        dog_name: dogName,
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

    const confirmation = await sendIncontroConoscitivoConfirmationEmail(ctx.supabaseAdmin, email);
    if (!confirmation.ok) {
      return jsonResponse(
        {
          warning: `Richiesta registrata, ma l'invio dell'email di conferma è fallito: ${confirmation.error}`,
          user_id: created.user.id,
        },
        207,
      );
    }

    return jsonResponse({ user_id: created.user.id });
  }),
};
