// Testi delle notifiche push: una riga di titolo e una di testo, da leggere
// sulla schermata di blocco. Stessi eventi e stesse parole degli oggetti
// delle email (lesson-email-templates.ts, event-email-templates.ts): chi
// riceve entrambe deve riconoscere subito che parlano della stessa cosa.
// Testo semplice, niente HTML: le notifiche non lo interpretano.

import { formatLongDateIt } from "./email-layout.ts";
import type { EventRegistrationDetail, NewEventDetail } from "./event-email-templates.ts";
import type { LessonDetail, PreviousSlot } from "./lesson-email-templates.ts";
import type { PushContent } from "./push.ts";

type LessonEvent = "booked" | "rescheduled" | "cancelled" | "reminder_24h" | "accepted" | "rejected";
type EventRegistrationEvent = "registered" | "cancelled" | "removed" | "event_cancelled";

const MY_LESSONS = "/prenotazioni/le-mie-lezioni";
const STAFF_LESSONS = "/prenotazioni/gestione-lezioni";
const EVENTS = "/prenotazioni/eventi";

function isIncontro(lesson: LessonDetail): boolean {
  return lesson.lesson_type === "incontro_conoscitivo";
}

function isGroup(lesson: LessonDetail): boolean {
  return (lesson.slot_capacity ?? 1) > 1;
}

/** Per una collettiva, il nome davanti all'orario: "Classe cuccioli · Martedì…". */
function groupPrefix(lesson: LessonDetail): string {
  return isGroup(lesson) ? `${lesson.slot_group_label?.trim() || "Lezione collettiva"} · ` : "";
}

/** "Martedì 21 ottobre 2026, ore 10:00" */
function when(date: string, timeFrom: string): string {
  return `${formatLongDateIt(date)}, ore ${timeFrom.slice(0, 5)}`;
}

function withReason(text: string, reason: string | null, label = "Motivo"): string {
  return reason ? `${text} ${label}: ${reason}` : text;
}

function lessonTag(lesson: LessonDetail): string {
  return `lesson-${lesson.id}`;
}

export function customerPushFor(
  event: LessonEvent,
  lesson: LessonDetail,
  previous: PreviousSlot | null,
): PushContent {
  const at = `${groupPrefix(lesson)}${when(lesson.date, lesson.time_from)}`;
  const base = { url: MY_LESSONS, tag: lessonTag(lesson) };

  switch (event) {
    case "booked":
      if (isIncontro(lesson) && lesson.status === "pending") {
        return { ...base, title: "Richiesta di Incontro Conoscitivo ricevuta", body: `${at}. Ti avvisiamo appena l'educatore conferma.` };
      }
      return {
        ...base,
        title: isIncontro(lesson)
          ? "Incontro Conoscitivo confermato"
          : isGroup(lesson)
            ? "Iscrizione confermata"
            : "Lezione confermata",
        body: `${at}. Ti aspettiamo al campo.`,
      };
    case "accepted":
      return { ...base, title: "Incontro Conoscitivo confermato", body: `${at}. Ti aspettiamo al campo.` };
    case "rejected":
      return {
        ...base,
        title: "Incontro Conoscitivo non confermato",
        body: withReason("La data richiesta non è disponibile: contatta il centro per sceglierne un'altra.", lesson.cancellation_reason),
      };
    case "rescheduled":
      return {
        ...base,
        title: isGroup(lesson) ? "Lezione collettiva spostata" : "Lezione spostata",
        body: previous ? `Da ${when(previous.date, previous.time_from)} a ${at}.` : `Nuovo orario: ${at}.`,
      };
    case "cancelled":
      return {
        ...base,
        title: isIncontro(lesson)
          ? "Incontro Conoscitivo cancellato"
          : isGroup(lesson)
            ? "Lezione collettiva cancellata"
            : "Lezione cancellata",
        body: withReason(`${at}.`, lesson.cancellation_reason),
      };
    case "reminder_24h":
      return {
        ...base,
        title: "Ci vediamo domani",
        body: `${isIncontro(lesson) ? "Incontro Conoscitivo" : isGroup(lesson) ? groupPrefix(lesson).slice(0, -3) : "Lezione"} alle ${lesson.time_from.slice(0, 5)}.`,
      };
  }
}

export function trainerPushFor(
  event: Exclude<LessonEvent, "reminder_24h">,
  lesson: LessonDetail,
  previous: PreviousSlot | null,
): PushContent {
  const customer = `${lesson.customer_name} ${lesson.customer_surname}`;
  const seats =
    isGroup(lesson) && lesson.group_booked != null ? ` (${lesson.group_booked}/${lesson.slot_capacity})` : "";
  const at = `${groupPrefix(lesson)}${when(lesson.date, lesson.time_from)}`;
  const base = { url: STAFF_LESSONS, tag: lessonTag(lesson) };

  switch (event) {
    case "booked":
      if (isIncontro(lesson) && lesson.status === "pending") {
        return { ...base, title: "Nuova richiesta di Incontro Conoscitivo", body: `${customer} · ${at}. Da accettare o rifiutare.` };
      }
      return {
        ...base,
        title: isIncontro(lesson)
          ? "Incontro Conoscitivo confermato"
          : isGroup(lesson)
            ? "Nuova iscrizione"
            : "Nuova prenotazione",
        body: `${customer} · ${at}${seats}`,
      };
    case "accepted":
      return { ...base, title: "Incontro Conoscitivo confermato", body: `${customer} · ${at}` };
    case "rejected":
      return { ...base, title: "Incontro Conoscitivo rifiutato", body: `${customer} · ${at}` };
    case "rescheduled":
      return {
        ...base,
        title: isGroup(lesson) ? "Iscrizione spostata" : "Lezione spostata",
        body: previous
          ? `${customer} · da ${when(previous.date, previous.time_from)} a ${at}`
          : `${customer} · nuovo orario ${at}`,
      };
    case "cancelled":
      return {
        ...base,
        title: isIncontro(lesson)
          ? "Incontro Conoscitivo cancellato"
          : isGroup(lesson)
            ? "Iscrizione cancellata"
            : "Lezione cancellata",
        body: withReason(`${customer} · ${at}.`, lesson.cancellation_reason),
      };
  }
}

/**
 * null = nessuna push. Iscrizione e cancellazione le fa sempre il cliente
 * stesso, dal telefono che ha in mano (register_for_event e
 * cancel_event_registration agiscono solo per il chiamante): una notifica
 * subito dopo il tocco sarebbe solo rumore. L'email resta, come ricevuta.
 */
export function customerPushForEventRegistration(
  event: EventRegistrationEvent,
  detail: EventRegistrationDetail,
): PushContent | null {
  const at = when(detail.event_date, detail.event_time_from);
  const base = { url: EVENTS, tag: `event-registration-${detail.id}` };

  switch (event) {
    case "registered":
    case "cancelled":
      return null;
    case "removed":
      return {
        ...base,
        title: "Iscrizione rimossa",
        body: withReason(`Lo staff ha rimosso la tua iscrizione a "${detail.event_title}" (${at}).`, detail.cancellation_note, "Nota"),
      };
    case "event_cancelled":
      return {
        ...base,
        title: "Evento cancellato",
        body: withReason(`"${detail.event_title}" del ${at} non si terrà.`, detail.cancellation_note, "Nota"),
      };
  }
}

/** Nuovo evento pubblicato: a tutti i clienti e assistenti con le push attive. */
export function newEventPush(event: NewEventDetail): PushContent {
  return {
    title: "Nuovo evento",
    body: `"${event.title}" · ${when(event.date, event.time_from)} · ${event.location}`,
    url: EVENTS,
    tag: `new-event-${event.id}`,
  };
}
