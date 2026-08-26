// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

// SCAFFOLD — implementazione prevista per il 04/09.
//
// Contratto e regole di business (da handoff_progetto.md, sez. 2):
// Punto centrale UNICO per ogni email di tipo reset/imposta/invita
// password. Nessun flusso password parte MAI direttamente da una chiamata
// Auth lato frontend (niente supabase.auth.resetPasswordForEmail() diretto
// dal client): tutti passano da qui, che valida le regole di business
// ("chi può richiederla, per chi") prima di invocare service_role. Questo
// evita che un utente possa auto-promuoversi o bypassare flussi di
// approvazione manipolando l'API Auth direttamente.
//
// Azioni previste (da handoff sez. 5, "4 flussi password centralizzati"):
// - self_reset_request: un utente qualsiasi chiede il reset per la PROPRIA
//   email (nessuna autorizzazione speciale, solo rate limiting implicito
//   di Supabase Auth).
// - admin_invite: l'Admin invita un nuovo utente staff (creato da
//   admin-create-user) a impostare la password iniziale.
// - admin_force_reset: l'Admin forza il reset password di un utente
//   esistente (es. utente bloccato).
// - self_change: utente autenticato cambia la propria password conoscendo
//   quella attuale (eventualmente delegabile diretto al client se
//   Supabase lo consente in modo sicuro — DA CONFERMARE in fase di
//   implementazione se rientra comunque qui per uniformità).
//
// Ogni azione tranne self_reset_request richiede il chiamante autenticato
// con ruolo Admin, verificato via public.users.type_id — mai un ruolo
// dichiarato dal body della richiesta.

type PasswordAction =
  | "self_reset_request"
  | "admin_invite"
  | "admin_force_reset"
  | "self_change";

interface ManagePasswordRequest {
  action: PasswordAction;
  email?: string;
  target_user_id?: number;
}

export default {
  fetch: withSupabase({ auth: ["publishable", "secret"] }, async (req, _ctx) => {
    const _body = (await req.json()) as ManagePasswordRequest;

    // TODO (04/09):
    // switch (_body.action) { ... valida ruolo chiamante per ogni caso,
    // poi ctx.supabaseAdmin.auth.admin.* / resetPasswordForEmail ... }

    return new Response(JSON.stringify({ error: "not_implemented" }), {
      status: 501,
      headers: { "Content-Type": "application/json" },
    });
  }),
};
