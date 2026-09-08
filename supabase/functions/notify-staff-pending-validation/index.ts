// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { jsonResponse } from "../_shared/auth-helpers.ts";
import { sendEmail } from "../_shared/email.ts";
import { emailShell } from "../_shared/password-flows.ts";
import { siteUrl } from "../_shared/site-url.ts";

// Chiamata SOLO dal database (trigger trg_users_notify_validation, vedi
// database/24_validation_notifications.sql) quando nasce un nuovo
// customer/future_customer non ancora validato — self-signup pubblico o
// creazione da parte di un admin, indifferentemente: stesso principio di
// send-lesson-notification, qualunque scrittura genera l'email invece di
// fidarsi che ogni punto del client se ne ricordi.
//
// auth: ["none"] e segreto condiviso nell'header, stessa autenticazione di
// send-lesson-notification (non c'è un utente loggato in questo contesto,
// è Postgres stesso a chiamare).

const SUBJECT = "Nuovo utente da validare";

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

    const { data: pending, error: pendingError } = await ctx.supabaseAdmin
      .from("users")
      .select("name, surname, dog_name")
      .eq("id", body.user_id)
      .maybeSingle();

    if (pendingError) {
      return jsonResponse({ error: pendingError.message }, 400);
    }
    if (!pending) {
      // Può essere stato cancellato subito dopo (raro, ma non è un errore
      // da segnalare al trigger fire-and-forget che ha chiamato).
      return jsonResponse({ skipped: "utente non trovato" });
    }

    const { data: staffTypes, error: staffTypesError } = await ctx.supabaseAdmin
      .from("user_types")
      .select("id")
      .in("code", ["trainer", "admin"]);
    if (staffTypesError) {
      return jsonResponse({ error: staffTypesError.message }, 400);
    }
    const staffTypeIds = (staffTypes ?? []).map((t) => t.id);

    const { data: staff, error: staffError } = staffTypeIds.length
      ? await ctx.supabaseAdmin
          .from("users")
          .select("email")
          .in("type_id", staffTypeIds)
          .is("deleted_at", null)
          .not("email", "is", null)
      : { data: [] as { email: string | null }[], error: null };
    if (staffError) {
      return jsonResponse({ error: staffError.message }, 400);
    }

    const dog = pending.dog_name ? ` (${pending.dog_name})` : "";
    const html = emailShell(
      SUBJECT,
      `<p><strong>${pending.name} ${pending.surname}</strong>${dog} si è registrato/a e attende la validazione per poter prenotare lezioni.</p>`,
      `${siteUrl()}/prenotazioni/gestione-utenti`,
      "Vai a Gestione utenti",
    );

    const results: Array<{ to: string; ok: boolean; error: string | null }> = [];
    for (const member of staff ?? []) {
      if (!member.email) continue;
      const result = await sendEmail({ to: member.email, subject: SUBJECT, html });
      results.push({ to: member.email, ...result });
    }

    return jsonResponse({ results });
  }),
};
