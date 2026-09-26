import { sendEmail } from "./email.ts";
import { actionEmail } from "./password-flows.ts";
import { siteUrl } from "./site-url.ts";

// Mail di conferma dell'Incontro Conoscitivo, inviata DOPO che il
// future_customer ha prenotato (send-incontro-confirmation-email, innescata
// da trg_lessons_notify_fn — vedi database/37_fix_users_update_rules_and_
// incontro_token.sql).
//
// Il link porta un token nostro, legato alla prenotazione, NON un link di
// recovery di GoTrue: il login automatico alla creazione account passa già
// da una verifica OTP, che per GoTrue conferma l'email — un secondo link
// GoTrue non segnalerebbe più nulla. Il token viene consumato da
// confirm_incontro_email() quando la pagina di atterraggio si apre; nessuna
// sessione richiesta, il link funziona anche da un altro dispositivo.

function confirmationUrl(token: string): string {
  return `${siteUrl()}/prenotazioni/incontro-conoscitivo-confermato?token=${encodeURIComponent(token)}`;
}

export async function sendIncontroConoscitivoConfirmationEmail(
  email: string,
  token: string,
): Promise<{ ok: boolean; error: string | null }> {
  return sendEmail({
    to: email,
    subject: "Conferma la tua email — Incontro Conoscitivo",
    html: actionEmail({
      preheader: "Un ultimo passo: conferma l'email e la richiesta arriva all'educatore.",
      badge: "Incontro Conoscitivo",
      tone: "incontro",
      title: "Conferma la tua richiesta",
      paragraphs: [
        "Grazie per aver prenotato un Incontro Conoscitivo con ASD Cinofila \"La Luna Nuova\".",
        "Manca un ultimo passo: conferma il tuo indirizzo email. Solo dopo la richiesta arriva all'educatore.",
      ],
      actionLink: confirmationUrl(token),
      ctaLabel: "Conferma la mia email",
      ignoreHint: "Se non hai richiesto tu un Incontro Conoscitivo, ignora questa email: senza conferma la richiesta non viene inoltrata.",
    }),
  });
}
