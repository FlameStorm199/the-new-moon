// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { jsonResponse } from "../_shared/auth-helpers.ts";
import { sendEmail } from "../_shared/email.ts";
import {
  customerEmailFor,
  LessonDetail,
  PreviousSlot,
  trainerEmailFor,
} from "../_shared/lesson-email-templates.ts";
import { sendPushToUsers } from "../_shared/push.ts";
import { customerPushFor, trainerPushFor } from "../_shared/push-templates.ts";

// Chiamata SOLO dal database (trigger trg_lessons_notify e il cron
// send_lesson_reminders, vedi database/15_lesson_notifications.sql), mai dal
// browser: auth: ["none"] perché non c'è un utente loggato in quel contesto
// (è Postgres stesso a chiamare), l'autorizzazione vera è l'header
// x-internal-secret, confrontato con un segreto condiviso generato da quel
// file SQL e copiato qui come secret INTERNAL_WEBHOOK_SECRET. Senza questo
// controllo chiunque conoscesse l'URL della function potrebbe far partire
// email a piacere: niente a che vedere con RLS o con le chiavi Supabase.

type LessonEvent =
  | "booked"
  | "rescheduled"
  | "cancelled"
  | "reminder_24h"
  | "accepted"
  | "rejected";

interface NotifyRequest {
  lesson_id: number;
  event: LessonEvent;
  previous?: PreviousSlot | null;
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

    const { data: lesson, error: lessonError } = await ctx.supabaseAdmin
      .from("v_lessons_detail")
      .select(
        "id, customer_id, slot_id, customer_name, customer_surname, customer_dog_name, customer_email, date, time_from, time_to, cancellation_reason, description, status, lesson_type, slot_capacity, slot_group_label"
      )
      .eq("id", body.lesson_id)
      .maybeSingle();

    if (lessonError) {
      return jsonResponse({ error: lessonError.message }, 400);
    }
    if (!lesson) {
      // La lezione potrebbe essere stata rimossa (delete_lesson) subito dopo
      // l'evento che ha innescato questa chiamata: non è un errore da far
      // notare al chiamante (il trigger l'ha già sparata, fire-and-forget),
      // semplicemente non c'è più nulla da notificare.
      return jsonResponse({ skipped: "lezione non trovata" });
    }

    // Lezione collettiva: allo staff serve anche quanti sono gli iscritti
    // ("Iscritti: 4 su 6"), contati qui una volta per tutte le email.
    if ((lesson.slot_capacity ?? 1) > 1 && lesson.slot_id) {
      const { count } = await ctx.supabaseAdmin
        .from("lessons")
        .select("id", { count: "exact", head: true })
        .eq("slot_id", lesson.slot_id)
        .in("status", ["pending", "confirmed"])
        .is("deleted_at", null);
      (lesson as LessonDetail).group_booked = count ?? null;
    }

    const results: Array<{ to: string; ok: boolean; error: string | null }> = [];
    // Push: stessi destinatari delle email, spedite dopo (vedi _shared/push.ts).
    const push: Record<string, unknown> = {};

    if (lesson.customer_email) {
      const content = customerEmailFor(
        body.event,
        lesson as LessonDetail,
        body.previous ?? null
      );
      const result = await sendEmail({ to: lesson.customer_email, ...content });
      results.push({ to: lesson.customer_email, ...result });
    }

    push.customer = await sendPushToUsers(
      ctx,
      [lesson.customer_id],
      customerPushFor(body.event, lesson as LessonDetail, body.previous ?? null)
    );

    if (body.event !== "reminder_24h") {
      const { data: trainerTypeRow } = await ctx.supabaseAdmin
        .from("user_types")
        .select("id")
        .eq("code", "trainer")
        .single();

      const { data: trainers } = trainerTypeRow
        ? await ctx.supabaseAdmin
            .from("users")
            .select("id, email")
            .eq("type_id", trainerTypeRow.id)
            .is("deleted_at", null)
        : { data: [] as { id: number; email: string | null }[] };

      const content = trainerEmailFor(body.event, lesson as LessonDetail, body.previous ?? null);
      for (const trainer of trainers ?? []) {
        if (!trainer.email) continue;
        const result = await sendEmail({ to: trainer.email, ...content });
        results.push({ to: trainer.email, ...result });
      }

      push.trainers = await sendPushToUsers(
        ctx,
        (trainers ?? []).map((t) => t.id),
        trainerPushFor(body.event, lesson as LessonDetail, body.previous ?? null)
      );
    }

    return jsonResponse({ results, push });
  }),
};
