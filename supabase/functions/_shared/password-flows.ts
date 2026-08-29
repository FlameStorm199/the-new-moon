// deno-lint-ignore-file no-explicit-any
import { sendEmail } from "./email.ts";

// Generazione del link con l'Auth Admin API di Supabase (bypassa RLS, va
// sempre chiamata con ctx.supabaseAdmin) e invio della relativa email via
// Resend. Usato sia da admin-create-user (invito iniziale alla creazione)
// sia da manage-user-password (tutti e 4 i flussi), per non duplicare la
// logica "genera link + spedisci email" in due posti.
//
// type "recovery" funziona sia per l'invito iniziale (l'utente non ha mai
// impostato una password) sia per un reset vero e proprio: in entrambi i
// casi produce un link che porta l'utente a impostare/reimpostare la
// password, e — a differenza di type "invite" — non fallisce se l'utente
// Auth esiste già (caso admin-create-user, che crea prima l'utente e poi
// genera questo link).

export async function generateRecoveryLink(
  supabaseAdmin: any,
  email: string,
): Promise<{ actionLink: string | null; error: string | null }> {
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "recovery",
    email,
  });

  if (error || !data?.properties?.action_link) {
    return { actionLink: null, error: error?.message ?? "Link non generato." };
  }
  return { actionLink: data.properties.action_link as string, error: null };
}

function emailShell(title: string, bodyHtml: string, actionLink: string, ctaLabel: string): string {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #222;">
      <h2>${title}</h2>
      ${bodyHtml}
      <p style="margin: 1.5rem 0;">
        <a href="${actionLink}"
           style="background:#2c6e49; color:#fff; padding:0.75rem 1.25rem; border-radius:0.4rem; text-decoration:none;">
          ${ctaLabel}
        </a>
      </p>
      <p style="font-size:0.8rem; color:#777;">
        Se non hai richiesto tu questa email, puoi ignorarla in sicurezza.
      </p>
      <p style="font-size:0.8rem; color:#777;">ASD Cinofila "La Luna Nuova"</p>
    </div>
  `;
}

export async function sendInviteEmail(
  supabaseAdmin: any,
  email: string,
): Promise<{ ok: boolean; error: string | null }> {
  const link = await generateRecoveryLink(supabaseAdmin, email);
  if (link.error || !link.actionLink) {
    return { ok: false, error: link.error };
  }
  return sendEmail({
    to: email,
    subject: "Benvenuto/a: imposta la tua password",
    html: emailShell(
      "Il tuo account è pronto",
      "<p>Un amministratore ha creato per te un account su ASD Cinofila \"La Luna Nuova\". Imposta la tua password per accedere:</p>",
      link.actionLink,
      "Imposta password",
    ),
  });
}

export async function sendForcedResetEmail(
  supabaseAdmin: any,
  email: string,
): Promise<{ ok: boolean; error: string | null }> {
  const link = await generateRecoveryLink(supabaseAdmin, email);
  if (link.error || !link.actionLink) {
    return { ok: false, error: link.error };
  }
  return sendEmail({
    to: email,
    subject: "Reimposta la tua password",
    html: emailShell(
      "Reimpostazione password richiesta",
      "<p>Un amministratore ha richiesto la reimpostazione della password del tuo account. Scegline una nuova:</p>",
      link.actionLink,
      "Reimposta password",
    ),
  });
}

export async function sendSelfResetEmail(
  supabaseAdmin: any,
  email: string,
): Promise<{ ok: boolean; error: string | null }> {
  const link = await generateRecoveryLink(supabaseAdmin, email);
  if (link.error || !link.actionLink) {
    return { ok: false, error: link.error };
  }
  return sendEmail({
    to: email,
    subject: "Reimposta la tua password",
    html: emailShell(
      "Hai richiesto di reimpostare la password",
      "<p>Clicca qui sotto per scegliere una nuova password:</p>",
      link.actionLink,
      "Reimposta password",
    ),
  });
}
