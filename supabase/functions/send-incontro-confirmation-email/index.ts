// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { jsonResponse } from "../_shared/auth-helpers.ts";
import { sendIncontroConoscitivoConfirmationEmail } from "../_shared/email-confirmation.ts";

// Chiamata SOLO dal database (trg_lessons_notify_fn, tramite
// notify_incontro_email_confirmation — vedi database/37_fix_users_update_
// rules_and_incontro_token.sql), mai dal browser: stesso pattern di
// autenticazione di send-lesson-notification/send-event-notification,
// x-internal-secret, non RLS o chiavi Supabase.
//
// Il token arriva già generato dal database: qui si legge solo l'indirizzo
// del cliente e si spedisce la mail col link che lo contiene.

interface NotifyRequest {
  lesson_id: number;
  token: string;
}

export default {
  fetch: withSupabase({ auth: ["none"] }, async (req, ctx) => {
    const expectedSecret = Deno.env.get("INTERNAL_WEBHOOK_SECRET");
    const providedSecret = req.headers.get("x-internal-secret");
    if (!expectedSecret || !providedSecret || providedSecret !== expectedSecret) {
      return jsonResponse({ error: "Non autorizzato." }, 403);
    }

    let body: NotifyRequest;
    try {
      body = (await req.json()) as NotifyRequest;
    } catch {
      return jsonResponse({ error: "Corpo della richiesta non valido." }, 400);
    }
    if (!body.lesson_id || !body.token) {
      return jsonResponse({ error: "lesson_id e token sono obbligatori." }, 400);
    }

    const { data: lesson, error: lessonError } = await ctx.supabaseAdmin
      .from("v_lessons_detail")
      .select("id, customer_email")
      .eq("id", body.lesson_id)
      .maybeSingle();

    if (lessonError) {
      return jsonResponse({ error: lessonError.message }, 400);
    }
    if (!lesson?.customer_email) {
      return jsonResponse({ skipped: "lezione non trovata o cliente senza email" });
    }

    const result = await sendIncontroConoscitivoConfirmationEmail(lesson.customer_email, body.token);
    if (!result.ok) {
      console.error(`send-incontro-confirmation-email: invio fallito per lesson_id=${body.lesson_id}: ${result.error}`);
    }
    return jsonResponse({ result: { to: lesson.customer_email, ...result } });
  }),
};
