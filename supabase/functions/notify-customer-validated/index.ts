// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { jsonResponse } from "../_shared/auth-helpers.ts";
import { sendEmail } from "../_shared/email.ts";
import { emailShell } from "../_shared/password-flows.ts";
import { siteUrl } from "../_shared/site-url.ts";

// Chiamata SOLO dal database (trigger trg_users_notify_validation, vedi
// database/24_validation_notifications.sql) quando validated passa da false
// a true — indifferentemente da chi l'ha validato (trainer o admin, da
// Gestione utenti) o come (✓ singolo, non c'è un percorso in blocco).
//
// auth: ["none"] e segreto condiviso nell'header, stessa autenticazione di
// send-lesson-notification.

const SUBJECT = 'Il tuo account è stato validato';

interface NotifyRequest {
  user_id: number;
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

    const { data: customer, error } = await ctx.supabaseAdmin
      .from("users")
      .select("name, email")
      .eq("id", body.user_id)
      .maybeSingle();

    if (error) {
      return jsonResponse({ error: error.message }, 400);
    }
    if (!customer?.email) {
      return jsonResponse({ skipped: "utente non trovato o senza email" });
    }

    const html = emailShell(
      SUBJECT,
      `<p>Ciao ${customer.name}, il tuo account su ASD Cinofila "La Luna Nuova" è stato validato: puoi accedere e prenotare le tue lezioni.</p>`,
      `${siteUrl()}/prenotazioni/login`,
      "Accedi",
    );

    const result = await sendEmail({ to: customer.email, subject: SUBJECT, html });

    return jsonResponse({ result });
  }),
};
