// Testi delle email di iscrizione/cancellazione/rimozione da un evento.
// Contenuto per contratto (handoff_fase2.md): Titolo, Luogo, Data, Orario,
// Nota — MAI Contributo (prezzo) né Numero di cani (capienza). Non è solo
// una scelta di stile: EventRegistrationDetail sotto non ha affatto quei
// due campi, quindi non possono nemmeno finire in un'email per errore.
// L'aspetto sta in email-layout.ts.

import {
  type DetailBlock,
  formatLongDateIt,
  formatTimeRangeIt,
  renderEmail,
  type Tone,
} from "./email-layout.ts";
import { siteUrl } from "./site-url.ts";

export interface EventRegistrationDetail {
  id: number;
  event_title: string;
  event_location: string;
  event_date: string;
  event_time_from: string;
  event_time_to: string;
  cancellation_note: string | null;
  customer_email: string | null;
}

export interface EmailContent {
  subject: string;
  html: string;
}

function eventBlock(detail: EventRegistrationDetail, tone: Tone = "event"): DetailBlock {
  return {
    tone,
    rows: [
      { label: "Evento", value: detail.event_title },
      { label: "Data", value: formatLongDateIt(detail.event_date) },
      { label: "Orario", value: formatTimeRangeIt(detail.event_time_from, detail.event_time_to) },
      { label: "Luogo", value: detail.event_location },
    ],
  };
}

function noteOf(note: string | null): { label: string; text: string } | undefined {
  return note ? { label: "Nota dello staff", text: note } : undefined;
}

function eventsCta(label: string): { url: string; label: string } {
  return { url: `${siteUrl()}/prenotazioni/eventi`, label };
}

export function customerEmailForEventRegistration(
  event: "registered" | "cancelled" | "removed" | "event_cancelled",
  detail: EventRegistrationDetail,
): EmailContent {
  const when = `${formatLongDateIt(detail.event_date)}, ore ${detail.event_time_from.slice(0, 5)}`;

  switch (event) {
    case "event_cancelled":
      return {
        subject: "Evento cancellato",
        html: renderEmail({
          preheader: `"${detail.event_title}" del ${when} è stato cancellato.`,
          badge: { text: "Evento", tone: "danger" },
          title: "L'evento è stato cancellato",
          paragraphs: ["Ci dispiace: l'evento a cui eri iscritto/a non si terrà. La tua iscrizione è annullata, non devi fare nulla."],
          details: [eventBlock(detail, "neutral")],
          note: noteOf(detail.cancellation_note),
          cta: eventsCta("Guarda gli altri eventi"),
        }),
      };
    case "registered":
      return {
        subject: "Iscrizione confermata",
        html: renderEmail({
          preheader: `Sei iscritto/a a "${detail.event_title}" · ${when}.`,
          badge: { text: "Evento", tone: "event" },
          title: "Sei iscritto/a",
          paragraphs: ["La tua iscrizione è confermata. Ecco il riepilogo."],
          details: [eventBlock(detail)],
          cta: eventsCta("Vedi i tuoi eventi"),
          smallPrint: ["Se non puoi più partecipare, cancella l'iscrizione dalla pagina Eventi: il posto torna libero per qualcun altro."],
        }),
      };
    case "cancelled":
      return {
        subject: "Iscrizione cancellata",
        html: renderEmail({
          preheader: `Iscrizione a "${detail.event_title}" cancellata.`,
          badge: { text: "Evento", tone: "neutral" },
          title: "Iscrizione cancellata",
          paragraphs: ["Ti confermiamo che hai cancellato la tua iscrizione a questo evento."],
          details: [eventBlock(detail, "neutral")],
          cta: eventsCta("Guarda gli eventi"),
        }),
      };
    case "removed":
      return {
        subject: "Iscrizione rimossa",
        html: renderEmail({
          preheader: `La tua iscrizione a "${detail.event_title}" è stata rimossa dallo staff.`,
          badge: { text: "Evento", tone: "danger" },
          title: "La tua iscrizione è stata rimossa",
          paragraphs: ["Lo staff ha rimosso la tua iscrizione a questo evento."],
          details: [eventBlock(detail, "neutral")],
          note: noteOf(detail.cancellation_note),
          smallPrint: ["Per chiarimenti contatta il centro."],
        }),
      };
  }
}
