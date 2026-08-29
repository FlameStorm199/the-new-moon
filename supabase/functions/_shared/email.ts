// Punto unico di invio email transazionali (lezioni + flussi password),
// tramite Resend. Nessuna funzione deve chiamare l'API Resend direttamente:
// tutte passano da qui, così un domain/from-address o provider diverso si
// cambia in un solo posto.
//
// CONFIGURAZIONE RICHIESTA (secret della Edge Function, non nel codice):
// - RESEND_API_KEY: chiave API del progetto Resend.
// - EMAIL_FROM (opzionale): mittente nel formato "Nome <indirizzo@dominio>".
//   Il dominio deve essere verificato su Resend prima di poter inviare.
// Finché RESEND_API_KEY non è impostata, sendEmail ritorna un errore
// esplicito invece di fingere un invio riuscito: meglio un fallimento
// rumoroso in test che un'email silenziosamente mai partita.

const RESEND_API_URL = "https://api.resend.com/emails";
const DEFAULT_FROM = "ASD Cinofila La Luna Nuova <onboarding@resend.dev>";

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
