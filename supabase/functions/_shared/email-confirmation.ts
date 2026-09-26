// deno-lint-ignore-file no-explicit-any
import { sendEmail } from "./email.ts";
import { emailShell } from "./password-flows.ts";
import { siteUrl } from "./site-url.ts";

// Link di conferma email per un future_customer, inviato DOPO che ha già
// prenotato il proprio Incontro Conoscitivo (chiamata da
// send-incontro-confirmation-email, innescata da
// notify_incontro_email_confirmation — vedi database/35_fase2_incontro_
// deferred_notification.sql). Non più legata alla creazione dell'account:
// request-incontro-conoscitivo ormai autentica l'utente in automatico e lo
// porta dritto alla prenotazione, questa mail arriva solo a quel punto,
// perché la prenotazione stessa "diventi effettiva" (notifica a cliente ed
// educatore rimandata fino al click, vedi trg_lessons_notify_fn).
//
// L'utente Auth esiste già in quel momento (admin.createUser con
// email_confirm:false), quindi i tipi "signup"/"invite" di generateLink()
// NON vanno bene: entrambi provano a CREARE l'utente e falliscono se esiste
// già ("A user with this email address has already been registered").
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
// Punta alla pagina di atterraggio dedicata
// (incontro-conoscitivo-confermato.component.ts), NON ad area-personale —
// quella route ha authGuard, e lo stesso codebase evita apposta di mettere
// un guard su una pagina raggiunta da link email coi token nel frammento
// dell'URL (vedi la nota su reimposta-password.component.ts): un guard lì
// rischia di rimbalzare l'utente al login prima che supabase-js abbia letto
// i token e stabilito la sessione. La pagina di atterraggio verifica la
// sessione da sé (l'utente in realtà ha già una sessione attiva dal login
// automatico della creazione account, questo click ne stabilisce
// semplicemente una nuova/aggiornata).

function confirmationRedirectUrl(): string {
  return `${siteUrl()}/prenotazioni/incontro-conoscitivo-confermato`;
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
