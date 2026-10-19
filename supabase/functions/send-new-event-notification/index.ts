// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { jsonResponse } from "../_shared/auth-helpers.ts";
import { sendEmailBatch } from "../_shared/email.ts";
import { NewEventDetail, newEventEmail } from "../_shared/event-email-templates.ts";
import { sendPushToUsers } from "../_shared/push.ts";
import { newEventPush } from "../_shared/push-templates.ts";

// Chiamata SOLO dal database (trigger trg_events_notify_new, vedi
// database/39_new_event_notifications.sql) quando lo staff crea un evento —
// stessa autenticazione di send-lesson-notification: x-internal-secret,
// non RLS o chiavi Supabase (vedi commento lì per il perché).
//
// Destinatari: clienti e assistenti non cancellati. Email solo a chi ha
// confermato l'indirizzo (un indirizzo mai verificato può essere sbagliato,
// e i rimbalzi peggiorano la reputazione del mittente su Resend); push a
// chiunque di loro l'abbia attivata.
//
// A differenza delle altre notifiche i destinatari possono essere tanti:
// la risposta parte subito (202) e l'invio prosegue in background
// (EdgeRuntime.waitUntil), così la chiamata da pg_net non va in timeout.
// L'esito finisce nei log della function.

const RECIPIENT_TYPES = ["customer", "assistant"];

interface NotifyRequest {
  event_id: number;
}

interface Recipient {
  id: number;
  email: string | null;
  confirmed_email: boolean | null;
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

    const { data: event, error: eventError } = await ctx.supabaseAdmin
      .from("events")
      .select("id, title, location, date, time_from, time_to, description, deleted_at")
      .eq("id", body.event_id)
      .maybeSingle();

    if (eventError) {
      return jsonResponse({ error: eventError.message }, 400);
    }
    if (!event || event.deleted_at) {
      // Creato e subito cancellato: niente da annunciare.
      return jsonResponse({ skipped: "evento non trovato" });
    }

    const { data: types, error: typesError } = await ctx.supabaseAdmin
      .from("user_types")
      .select("id")
      .in("code", RECIPIENT_TYPES);
    if (typesError) {
      return jsonResponse({ error: typesError.message }, 400);
    }

    const { data: recipients, error: recipientsError } = await ctx.supabaseAdmin
      .from("users")
      .select("id, email, confirmed_email")
      .in("type_id", (types ?? []).map((t) => t.id))
      .is("deleted_at", null);
    if (recipientsError) {
      return jsonResponse({ error: recipientsError.message }, 400);
    }

    const list = (recipients ?? []) as Recipient[];
    EdgeRuntime.waitUntil(deliver(ctx, event as NewEventDetail, list));

    return jsonResponse({ accepted: true, recipients: list.length }, 202);
  }),
};

async function deliver(
  // deno-lint-ignore no-explicit-any
  ctx: any,
  event: NewEventDetail,
  recipients: Recipient[],
): Promise<void> {
  try {
    const content = newEventEmail(event);
    const emails = recipients
      .filter((r) => r.email && r.confirmed_email)
      .map((r) => ({ to: r.email as string, ...content }));

    const [email, push] = await Promise.all([
      sendEmailBatch(emails),
      sendPushToUsers(ctx, recipients.map((r) => r.id), newEventPush(event)),
    ]);

    console.log(`send-new-event-notification: evento ${event.id}`, JSON.stringify({ email, push }));
  } catch (err) {
    console.error(`send-new-event-notification: evento ${event.id}, invio interrotto:`, err);
  }
}
