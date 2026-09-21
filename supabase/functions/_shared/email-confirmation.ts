// deno-lint-ignore-file no-explicit-any
import { sendEmail } from "./email.ts";
import { emailShell } from "./password-flows.ts";
import { siteUrl } from "./site-url.ts";

// Link di conferma email per un future_customer creato da
// request-incontro-conoscitivo. L'utente Auth esiste già a quel punto
// (admin.createUser con email_confirm:false, vedi index.ts), quindi i tipi
// "signup"/"invite" di generateLink() NON vanno bene: entrambi provano a
// CREARE l'utente e falliscono se esiste già ("A user with this email
// address has already been registered").
//
// Verificato leggendo il sorgente di supabase/auth (mail.go,
// adminGenerateLink): quando l'utente esiste già, "magiclink" viene
// processato nello STESSO branch di "recovery" (stesso RecoveryToken, stesso
// handler recoverVerify al click — vedi verify.go). recoverVerify chiama
// user.Confirm(tx) se l'utente non è ancora confermato: è il meccanismo
// esatto, non solo l'effetto atteso, con cui il click marca l'email come
// confermata, l'evento che database/26_fase2_schema.sql intercetta
// (trg_auth_user_email_confirmed) per sincronizzare
// public.users.confirmed_email. Usiamo "recovery" esplicitamente (non
// "magiclink") perché è lo stesso tipo già in produzione per l'invito
// password (generateRecoveryLink in password-flows.ts) — stesso meccanismo
// collaudato, redirect diverso.
//
// APERTO per il giorno 3: la pagina di destinazione. Per ora punta alla
// route base prenotazioni — da sostituire con la pagina dedicata quando
// esiste (form pubblico + vista slot per future_customer). Da tenere a
// mente: il click stabilisce comunque una sessione di recovery (stesso
// comportamento del link di invito password) — non è "solo" una conferma
// email silenziosa, l'utente atterra loggato sulla pagina di redirect.

function confirmationRedirectUrl(): string {
  return `${siteUrl()}/prenotazioni`;
}

export async function sendIncontroConoscitivoConfirmationEmail(
  supabaseAdmin: any,
  email: string,
): Promise<{ ok: boolean; error: string | null }> {
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "recovery",
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
