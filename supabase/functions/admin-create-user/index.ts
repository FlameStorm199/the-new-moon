// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

// SCAFFOLD — implementazione prevista per il 29/08 (pannello utenti) e
// completata per il 05/09 (pannello gestione utenti avanzato).
//
// Contratto e regole di business (da handoff_progetto.md, sez. 2/4/8):
// - Unica via per creare un utente con ruolo diverso da "customer": il
//   self-signup pubblico (supabase.auth.signUp lato client) può creare
//   SOLO customer — mai bypassabile.
// - Il chiamante deve essere autenticato E avere public.users.type_id
//   corrispondente ad "admin" (verificare tramite ctx.supabaseAdmin,
//   leggendo l'header Authorization del chiamante — non fidarsi di un
//   ruolo passato nel body).
// - Creare l'utente Auth con ctx.supabaseAdmin.auth.admin.createUser(),
//   passando SEMPRE app_metadata: { admin_created: true }: è il marcatore
//   che dice al trigger public.handle_new_auth_user() di non auto-inserire
//   una riga customer (vedi database/02_auth_signup_trigger.sql).
// - Questa funzione inserisce essa stessa la riga public.users con il
//   type_id scelto dall'Admin (non lo fa il trigger in questo caso).
// - Validare gli stessi campi obbligatori imposti a DB da
//   validate_user_required_fields() per customer/future_customer
//   (email, phone, dog_name) prima di chiamare l'Auth Admin API, per non
//   affidarsi solo al trigger DB per il messaggio di errore all'utente.
// - Nessuna password viene impostata qui: la creazione genera un invito
//   (magic link / set-password) gestito da manage-user-password, mai da
//   questa funzione direttamente (principio: un solo punto per i flussi
//   password, sez. 2 dell'handoff).

interface AdminCreateUserRequest {
  type_code: "customer" | "future_customer" | "assistant" | "trainer" | "admin";
  name: string;
  surname: string;
  email: string;
  phone?: string;
  dog_name?: string;
}

export default {
  fetch: withSupabase({ auth: ["secret"] }, async (req, _ctx) => {
    const _body = (await req.json()) as AdminCreateUserRequest;

    // TODO (29/08 - 05/09):
    // 1. Verificare che il chiamante sia un Admin autenticato.
    // 2. Validare _body secondo le regole sopra.
    // 3. ctx.supabaseAdmin.auth.admin.createUser({ email, app_metadata: { admin_created: true }, ... })
    // 4. Insert in public.users con type_id risolto da type_code.
    // 5. Invocare manage-user-password per l'invito iniziale.

    return new Response(JSON.stringify({ error: "not_implemented" }), {
      status: 501,
      headers: { "Content-Type": "application/json" },
    });
  }),
};
