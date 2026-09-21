// deno-lint-ignore-file no-explicit-any
import { sendEmail } from "./email.ts";
import { emailShell } from "./password-flows.ts";
import { siteUrl } from "./site-url.ts";

// Link di conferma email per un future_customer creato da
// request-incontro-conoscitivo. L'utente Auth esiste già a quel punto
// (admin.createUser con email_confirm:false, vedi index.ts), quindi i tipi
// "signup"/"invite" di generateLink() NON vanno bene: entrambi provano a
// CREARE l'utente e falliscono se esiste già. "magiclink" invece funziona su
// un utente esistente e, come effetto della verifica OTP al click, GoTrue
// segna l'email come confermata — esattamente l'evento che
// database/26_fase2_schema.sql intercetta (trg_auth_user_email_confirmed)
// per sincronizzare public.users.confirmed_email.
//
// APERTO per il giorno 2 (Fase 2): la pagina di destinazione. Per ora punta
// alla route base prenotazioni — da sostituire con la pagina dedicata quando
// esiste (giorno 3: form pubblico + vista slot per future_customer). Da
// verificare anche end-to-end che "magiclink" su un utente non confermato
// produca davvero un link che, al click, marca l'email come confermata
// senza aprire subito una sessione indesiderata — se il comportamento reale
// di GoTrue non fosse questo, è la prima cosa da rivedere qui.

function confirmationRedirectUrl(): string {
  return `${siteUrl()}/prenotazioni`;
}

export async function sendIncontroConoscitivoConfirmationEmail(
  supabaseAdmin: any,
  email: string,
): Promise<{ ok: boolean; error: string | null }> {
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: confirmationRedirectUrl() },
  });

  const actionLink = data?.properties?.action_link as string | undefined;
  if (error || !actionLink) {
    return { ok: false, error: error?.message ?? "Link non generato." };
  }

  return sendEmail({
    to: email,
    subject: "Conferma la tua email — Incontro Conoscitivo",
    html: emailShell(
      "Conferma il tuo indirizzo email",
      "<p>Grazie per aver richiesto un Incontro Conoscitivo con ASD Cinofila \"La Luna Nuova\". Conferma il tuo indirizzo email per completare la richiesta:</p>",
      actionLink,
      "Conferma email",
    ),
  });
}
