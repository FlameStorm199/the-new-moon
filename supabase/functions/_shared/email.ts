// Punto unico di invio email transazionali (lezioni + flussi password),
// tramite Resend. Nessuna funzione deve chiamare l'API Resend direttamente:
// tutte passano da qui, così un domain/from-address o provider diverso si
// cambia in un solo posto.
//
// CONFIGURAZIONE RICHIESTA (secret della Edge Function, non nel codice):
// - RESEND_API_KEY: chiave API del progetto Resend.
// - EMAIL_FROM (opzionale): mittente nel formato "Nome <indirizzo@dominio>".
//   Il dominio deve essere verificato su Resend prima di poter inviare.
// - EMAIL_ENABLED (opzionale): "false" blocca ogni invio — vedi sotto.
// Finché RESEND_API_KEY non è impostata, sendEmail ritorna un errore
// esplicito invece di fingere un invio riuscito: meglio un fallimento
// rumoroso in test che un'email silenziosamente mai partita.
//
// INTERRUTTORE PER I TEST
// Con EMAIL_ENABLED="false" nessuna email parte davvero: viene solo scritta
// nei log della Edge Function (destinatario e oggetto) e la chiamata
// risponde come se fosse riuscita. "Come se fosse riuscita" e non come un
// errore di proposito: bloccare gli invii durante i test non deve far
// comparire avvisi di fallimento nell'app né interrompere i flussi che
// proseguono dopo l'invio (la creazione utente, per dirne una, segnala un
// warning se l'invito non parte). Basta cambiare il secret, senza
// ridispiegare nulla: il valore è letto a ogni chiamata.
//
// Essendo qui — il punto unico da cui passa ogni email — l'interruttore vale
// per tutto: notifiche lezioni, promemoria 24h, inviti e reset password.

const RESEND_API_URL = "https://api.resend.com/emails";
const DEFAULT_FROM = "ASD Cinofila La Luna Nuova <onboarding@resend.dev>";

/** Attivo salvo esplicito "false": in produzione non serve impostare nulla. */
function emailsEnabled(): boolean {
  return (Deno.env.get("EMAIL_ENABLED") ?? "true").trim().toLowerCase() !== "false";
}

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

export interface SendEmailResult {
  ok: boolean;
  error: string | null;
}

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  if (!emailsEnabled()) {
    console.log(
      `[EMAIL_ENABLED=false] invio bloccato — destinatario: ${params.to}, oggetto: "${params.subject}"`,
    );
    return { ok: true, error: null };
  }

  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    return {
      ok: false,
      error:
        "RESEND_API_KEY non configurata: impostarla tra i secret della Edge Function prima di poter inviare email.",
    };
  }

  const from = Deno.env.get("EMAIL_FROM") ?? DEFAULT_FROM;

  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: `Resend ha rifiutato l'invio (${res.status}): ${text}` };
  }

  return { ok: true, error: null };
}
