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
// app_metadata.admin_created, che quel trigger legge per farsi da parte.
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

    const { data: created, error: createError } = await ctx.supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: false,
      app_metadata: { admin_created: true },
      user_metadata: { name, surname, phone, dog_name: dogName },
    });
    if (createError || !created?.user) {
      return jsonResponse(
        { error: createError?.message ?? "Richiesta non riuscita, riprova." },
        400,
      );
    }

    // Il trigger handle_new_auth_user() (02_auth_signup_trigger.sql) si fa
    // da parte per questo insert (encrypted_password is null): la riga
    // public.users la creiamo direttamente qui, con il type_id scelto da
    // questa Edge Function.
    const { error: insertError } = await ctx.supabaseAdmin.from("users").insert({
      auth_user_id: created.user.id,
      type_id: typeRow.id,
      name,
      surname,
      email,
      phone,
      dog_name: dogName,
    });
    if (insertError) {
      // Ripulisce l'utente Auth appena creato: non deve restare orfano
      // (senza riga public.users) se l'insert fallisce.
      await ctx.supabaseAdmin.auth.admin.deleteUser(created.user.id);
      return jsonResponse({ error: insertError.message }, 400);
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
