// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { jsonResponse } from "../_shared/auth-helpers.ts";
import { sendEmail } from "../_shared/email.ts";
import { customerEmailForEventRegistration, EventRegistrationDetail } from "../_shared/event-email-templates.ts";

// Chiamata SOLO dal database (trigger trg_event_registrations_notify, vedi
// database/31_fase2_events_registrations.sql), mai dal browser — stesso
// pattern di autenticazione di send-lesson-notification: x-internal-secret,
// non RLS o chiavi Supabase (vedi commento lì per il perché).
//
// A differenza delle lezioni, l'email va SOLO al cliente, mai allo staff
// (decisione esplicita del documento di design per la rimozione forzata,
// estesa qui a tutti gli eventi: lo staff segue tutto dal vivo in "Gestione
// eventi", non ha bisogno di un'email per ogni iscrizione/cancellazione).

type EventRegistrationEvent = "registered" | "cancelled" | "removed" | "event_cancelled";

interface NotifyRequest {
  registration_id: number;
  event: EventRegistrationEvent;
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

    const { data: registration, error: regError } = await ctx.supabaseAdmin
      .from("v_event_registrations_detail")
      .select(
        "id, event_title, event_location, event_date, event_time_from, event_time_to, cancellation_note, customer_email"
      )
      .eq("id", body.registration_id)
      .maybeSingle();

    if (regError) {
      return jsonResponse({ error: regError.message }, 400);
    }
    if (!registration) {
      // Come per le lezioni: l'iscrizione potrebbe non esserci più, non è
      // un errore da far notare al chiamante (il trigger l'ha già sparata).
      return jsonResponse({ skipped: "iscrizione non trovata" });
    }
    if (!registration.customer_email) {
      return jsonResponse({ skipped: "cliente senza email" });
    }

    const content = customerEmailForEventRegistration(
      body.event,
      registration as EventRegistrationDetail
    );
    const result = await sendEmail({ to: registration.customer_email, ...content });

    return jsonResponse({ result: { to: registration.customer_email, ...result } });
  }),
};
