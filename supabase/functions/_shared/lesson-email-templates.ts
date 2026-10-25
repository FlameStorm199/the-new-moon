// Testi delle email di lezione (prenotata/spostata/cancellata/promemoria,
// e risposta all'Incontro Conoscitivo). Tenuti qui, separati dalla logica di
// orchestrazione in index.ts, per poter ritoccare il testo senza toccare
// query o instradamento. L'aspetto sta in email-layout.ts.

import {
  type DetailBlock,
  type DetailRow,
  escapeHtml,
  formatLongDateIt,
  formatTimeRangeIt,
  renderEmail,
  type Tone,
} from "./email-layout.ts";
import { siteUrl } from "./site-url.ts";

export interface LessonDetail {
  id: number;
  customer_name: string;
  customer_surname: string;
  customer_dog_name: string | null;
  customer_email: string | null;
  date: string;
  time_from: string;
  time_to: string;
  cancellation_reason: string | null;
  /** Nota lasciata alla prenotazione — dal cliente stesso, o dallo staff se ha prenotato per lui. */
  description: string | null;
  status: string;
  lesson_type: string;
  /** Posti dello slot (da v_lessons_detail): >1 = lezione collettiva. */
  slot_capacity?: number | null;
  slot_group_label?: string | null;
  /** Iscritti attivi alla collettiva, per le email allo staff. */
  group_booked?: number | null;
}

export interface PreviousSlot {
  date: string;
  time_from: string;
  time_to: string;
}

export interface EmailContent {
  subject: string;
  html: string;
}

function isIncontro(lesson: LessonDetail): boolean {
  return lesson.lesson_type === "incontro_conoscitivo";
}

/** Iscrizione a una lezione collettiva (slot con più posti, database/40_lezioni_collettive.sql). */
function isGroup(lesson: LessonDetail): boolean {
  return (lesson.slot_capacity ?? 1) > 1;
}

function kindLabel(lesson: LessonDetail): string {
  return isIncontro(lesson) ? "Incontro Conoscitivo" : isGroup(lesson) ? "Lezione collettiva" : "Lezione";
}

/** Accordo di genere: "lezione cancellata" ma "incontro cancellato". */
function kindWithParticiple(lesson: LessonDetail, feminine: string, masculine: string): string {
  return isIncontro(lesson) ? `Incontro Conoscitivo ${masculine}` : `${kindLabel(lesson)} ${feminine}`;
}

function kindTone(lesson: LessonDetail): Tone {
  return isIncontro(lesson) ? "incontro" : isGroup(lesson) ? "group" : "lesson";
}

/** Riquadro data/orario (+ cane, + cliente per lo staff). */
function whenBlock(
  lesson: LessonDetail,
  opts: { withCustomer?: boolean; tone?: Tone; heading?: string } = {},
): DetailBlock {
  const rows: DetailRow[] = [];
  if (isGroup(lesson) && lesson.slot_group_label) {
    rows.push({ label: "Lezione", value: lesson.slot_group_label });
  }
  if (opts.withCustomer) {
    rows.push({ label: "Cliente", value: `${lesson.customer_name} ${lesson.customer_surname}` });
  }
  if (lesson.customer_dog_name) {
    rows.push({ label: "Cane", value: lesson.customer_dog_name });
  }
  rows.push(
    { label: "Data", value: formatLongDateIt(lesson.date) },
    { label: "Orario", value: formatTimeRangeIt(lesson.time_from, lesson.time_to) },
  );
  if (opts.withCustomer && isGroup(lesson) && lesson.group_booked != null) {
    rows.push({ label: "Iscritti", value: `${lesson.group_booked} su ${lesson.slot_capacity}` });
  }
  return { rows, tone: opts.tone ?? kindTone(lesson), heading: opts.heading };
}

function previousBlock(previous: PreviousSlot): DetailBlock {
  return {
    heading: "Prima",
    muted: true,
    rows: [
      { label: "Data", value: formatLongDateIt(previous.date) },
      { label: "Orario", value: formatTimeRangeIt(previous.time_from, previous.time_to) },
    ],
  };
}

function noteOf(description: string | null): { label: string; text: string } | undefined {
  return description ? { label: "Nota alla prenotazione", text: description } : undefined;
}

function reasonOf(reason: string | null): { label: string; text: string } | undefined {
  return reason ? { label: "Motivo", text: reason } : undefined;
}

function myLessonsCta(): { url: string; label: string } {
  return { url: `${siteUrl()}/prenotazioni/le-mie-lezioni`, label: "Vai alle mie lezioni" };
}

function staffLessonsCta(): { url: string; label: string } {
  return { url: `${siteUrl()}/prenotazioni/gestione-lezioni`, label: "Apri Gestione lezioni" };
}

function greeting(lesson: LessonDetail): string {
  return `Ciao ${escapeHtml(lesson.customer_name)},`;
}

function shortWhen(lesson: { date: string; time_from: string }): string {
  return `${formatLongDateIt(lesson.date)}, ore ${lesson.time_from.slice(0, 5)}`;
}

export function customerEmailFor(
  event: "booked" | "rescheduled" | "cancelled" | "reminder_24h" | "accepted" | "rejected",
  lesson: LessonDetail,
  previous: PreviousSlot | null,
): EmailContent {
  const kind = kindLabel(lesson);
  const badge = { text: kind, tone: kindTone(lesson) };

  switch (event) {
    case "booked":
      // Un Incontro Conoscitivo nasce 'pending' (richiede risposta
      // dell'educatore, vedi respond_incontro_conoscitivo in
      // database/28_fase2_incontro_conoscitivo_booking.sql): niente "confermato"
      // finché non lo è davvero, altrimenti l'email contraddirebbe l'app.
      if (isIncontro(lesson) && lesson.status === "pending") {
        return {
          subject: "Richiesta di Incontro Conoscitivo ricevuta",
          html: renderEmail({
            preheader: `Richiesta per ${shortWhen(lesson)}: ti scriviamo appena l'educatore conferma.`,
            badge,
            title: "Abbiamo ricevuto la tua richiesta",
            paragraphs: [
              greeting(lesson),
              "grazie per aver scelto di conoscerci. L'educatore controlla la tua richiesta e ti scriviamo appena è confermata.",
            ],
            details: [whenBlock(lesson)],
            note: noteOf(lesson.description),
          }),
        };
      }
      return {
        subject: isIncontro(lesson)
          ? "Incontro Conoscitivo confermato"
          : isGroup(lesson)
            ? "Iscrizione alla lezione collettiva confermata"
            : "Lezione confermata",
        html: renderEmail({
          preheader: `${kindWithParticiple(lesson, "confermata", "confermato")}: ${shortWhen(lesson)}.`,
          badge,
          title: isIncontro(lesson)
            ? "Il tuo Incontro Conoscitivo è confermato"
            : isGroup(lesson)
              ? "Sei iscritto/a alla lezione collettiva"
              : "La tua lezione è confermata",
          paragraphs: [greeting(lesson), "ecco il riepilogo. Ti aspettiamo al campo."],
          details: [whenBlock(lesson)],
          note: noteOf(lesson.description),
          cta: myLessonsCta(),
          smallPrint: ["Se non puoi più venire, puoi cancellare dall'area personale entro i tempi previsti."],
        }),
      };

    case "accepted":
      return {
        subject: "Incontro Conoscitivo confermato",
        html: renderEmail({
          preheader: `Confermato: ${shortWhen(lesson)}. Ti aspettiamo.`,
          badge,
          title: "Il tuo Incontro Conoscitivo è confermato",
          paragraphs: [greeting(lesson), "l'educatore ha confermato il tuo Incontro Conoscitivo. Ti aspettiamo al campo."],
          details: [whenBlock(lesson)],
        }),
      };

    case "rejected":
      return {
        subject: "Incontro Conoscitivo non confermato",
        html: renderEmail({
          preheader: "Non possiamo confermare la data richiesta: contattaci per sceglierne un'altra.",
          badge: { text: kind, tone: "danger" },
          title: "Non possiamo confermare il tuo Incontro Conoscitivo",
          paragraphs: [greeting(lesson), "purtroppo la data che hai richiesto non è disponibile."],
          details: [whenBlock(lesson, { tone: "neutral" })],
          note: reasonOf(lesson.cancellation_reason),
          smallPrint: ["Contatta il centro per concordare un'altra data: saremo felici di conoscerti."],
        }),
      };

    case "rescheduled":
      return {
        subject: kindWithParticiple(lesson, "spostata", "spostato"),
        html: renderEmail({
          preheader: `Nuovo orario: ${shortWhen(lesson)}.`,
          badge,
          title: "La tua lezione è stata spostata",
          paragraphs: [greeting(lesson), "lo staff ha spostato la tua lezione. Ecco il nuovo orario."],
          details: [
            ...(previous ? [previousBlock(previous)] : []),
            whenBlock(lesson, { heading: previous ? "Ora" : undefined }),
          ],
          cta: myLessonsCta(),
        }),
      };

    case "cancelled":
      return {
        subject: kindWithParticiple(lesson, "cancellata", "cancellato"),
        html: renderEmail({
          preheader: `${kindWithParticiple(lesson, "cancellata", "cancellato")}: ${shortWhen(lesson)}.`,
          badge: { text: kind, tone: "danger" },
          title: isIncontro(lesson) ? "Il tuo Incontro Conoscitivo è stato cancellato" : "La tua lezione è stata cancellata",
          paragraphs: [greeting(lesson), "ti confermiamo la cancellazione di questo appuntamento."],
          details: [whenBlock(lesson, { tone: "neutral" })],
          note: reasonOf(lesson.cancellation_reason),
          cta: isIncontro(lesson)
            ? undefined
            : { url: `${siteUrl()}/prenotazioni/prenota`, label: "Prenota un'altra lezione" },
        }),
      };

    case "reminder_24h":
      return {
        subject: isGroup(lesson) ? "Promemoria: lezione collettiva domani" : "Promemoria: lezione domani",
        html: renderEmail({
          preheader: `Domani alle ${lesson.time_from.slice(0, 5)}: ti aspettiamo.`,
          badge,
          title: "Ci vediamo domani",
          paragraphs: [greeting(lesson), "ti ricordiamo l'appuntamento di domani."],
          details: [whenBlock(lesson)],
          cta: myLessonsCta(),
        }),
      };
  }
}

export function trainerEmailFor(
  event: "booked" | "rescheduled" | "cancelled" | "accepted" | "rejected",
  lesson: LessonDetail,
  previous: PreviousSlot | null,
): EmailContent {
  const customer = `${lesson.customer_name} ${lesson.customer_surname}`;
  const customerHtml = `<strong>${escapeHtml(customer)}</strong>`;
  const kind = kindLabel(lesson);
  const badge = { text: kind, tone: kindTone(lesson) };

  switch (event) {
    case "booked":
      if (isIncontro(lesson) && lesson.status === "pending") {
        return {
          subject: "Nuova richiesta di Incontro Conoscitivo",
          html: renderEmail({
            preheader: `${customer} chiede un Incontro Conoscitivo per ${shortWhen(lesson)}.`,
            badge,
            title: "Nuova richiesta di Incontro Conoscitivo",
            paragraphs: [`${customerHtml} ha richiesto un Incontro Conoscitivo. È in attesa della tua conferma.`],
            details: [whenBlock(lesson, { withCustomer: true })],
            note: noteOf(lesson.description),
            cta: { url: `${siteUrl()}/prenotazioni/gestione-lezioni`, label: "Accetta o rifiuta" },
          }),
        };
      }
      return {
        subject: isIncontro(lesson)
          ? "Incontro Conoscitivo confermato"
          : isGroup(lesson)
            ? "Nuova iscrizione a una lezione collettiva"
            : "Nuova prenotazione",
        html: renderEmail({
          preheader: `${customer} · ${shortWhen(lesson)}.`,
          badge,
          title: isIncontro(lesson)
            ? "Incontro Conoscitivo confermato"
            : isGroup(lesson)
              ? "Nuova iscrizione"
              : "Nuova prenotazione",
          paragraphs: [
            isGroup(lesson)
              ? `${customerHtml} si è iscritto/a alla lezione collettiva.`
              : `${customerHtml} ha prenotato ${isIncontro(lesson) ? "un Incontro Conoscitivo" : "una lezione"}.`,
          ],
          details: [whenBlock(lesson, { withCustomer: true })],
          note: noteOf(lesson.description),
          cta: staffLessonsCta(),
        }),
      };

    case "accepted":
      return {
        subject: "Incontro Conoscitivo confermato",
        html: renderEmail({
          preheader: `${customer} · ${shortWhen(lesson)}.`,
          badge,
          title: "Incontro Conoscitivo confermato",
          paragraphs: [`L'Incontro Conoscitivo di ${customerHtml} è stato confermato.`],
          details: [whenBlock(lesson, { withCustomer: true })],
        }),
      };

    case "rejected":
      return {
        subject: "Incontro Conoscitivo rifiutato",
        html: renderEmail({
          preheader: `${customer} · ${shortWhen(lesson)}.`,
          badge: { text: kind, tone: "danger" },
          title: "Incontro Conoscitivo rifiutato",
          paragraphs: [`L'Incontro Conoscitivo di ${customerHtml} è stato rifiutato.`],
          details: [whenBlock(lesson, { withCustomer: true, tone: "neutral" })],
          note: reasonOf(lesson.cancellation_reason),
        }),
      };

    case "rescheduled":
      return {
        subject: kindWithParticiple(lesson, "spostata", "spostato"),
        html: renderEmail({
          preheader: `${customer} · nuovo orario ${shortWhen(lesson)}.`,
          badge,
          title: kindWithParticiple(lesson, "spostata", "spostato"),
          paragraphs: [
            isGroup(lesson)
              ? `L'iscrizione di ${customerHtml} alla lezione collettiva è stata spostata.`
              : `La lezione di ${customerHtml} è stata spostata.`,
          ],
          details: [
            ...(previous ? [previousBlock(previous)] : []),
            whenBlock(lesson, { withCustomer: true, heading: previous ? "Ora" : undefined }),
          ],
          cta: staffLessonsCta(),
        }),
      };

    case "cancelled":
      return {
        subject: kindWithParticiple(lesson, "cancellata", "cancellato"),
        html: renderEmail({
          preheader: `${customer} · ${shortWhen(lesson)}.`,
          badge: { text: kind, tone: "danger" },
          title: kindWithParticiple(lesson, "cancellata", "cancellato"),
          paragraphs: [
            isIncontro(lesson)
              ? `L'Incontro Conoscitivo di ${customerHtml} è stato cancellato.`
              : isGroup(lesson)
                ? `L'iscrizione di ${customerHtml} alla lezione collettiva è stata cancellata.`
                : `La lezione di ${customerHtml} è stata cancellata.`,
          ],
          details: [whenBlock(lesson, { withCustomer: true, tone: "neutral" })],
          note: reasonOf(lesson.cancellation_reason),
        }),
      };
  }
}
