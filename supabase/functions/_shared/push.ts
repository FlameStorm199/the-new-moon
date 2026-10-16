import type { SupabaseContext } from "@supabase/server";
import webpush from "web-push";

// Punto unico di invio delle notifiche push (PWA), gemello di email.ts: le
// Edge Function di notifica chiamano sendPushToUsers() insieme all'invio
// dell'email, con gli stessi destinatari. La push è un canale in più,
// mai un sostituto: chi non l'ha attivata continua a ricevere solo l'email.
//
// Mai bloccante: sendPushToUsers non lancia eccezioni. Una push non partita
// (chiavi mancanti, servizio push giù) non deve far fallire la risposta
// della function né, peggio, far sembrare non partita l'email.
//
// CONFIGURAZIONE RICHIESTA (secret della Edge Function, non nel codice):
// - VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY: generate una volta sola con
//   `npx web-push generate-vapid-keys`. La pubblica va anche in
//   src/environments (vapidPublicKey). Rigenerarle invalida ogni
//   sottoscrizione esistente: gli utenti dovrebbero riattivare le notifiche.
// - VAPID_SUBJECT: contatto per i servizi push, "mailto:..." o URL https.
// - PUSH_ENABLED (opzionale): "false" blocca ogni invio, solo log — stesso
//   interruttore per i test di EMAIL_ENABLED.
//
// Formato del contenuto: quello che il service worker di Angular (ngsw)
// sa mostrare da solo — oggetto "notification" con le opzioni di
// showNotification(). data.onActionClick dice al service worker cosa fare
// al tocco: aprire l'app (o riportarla in primo piano) direttamente sulla
// pagina giusta.

export interface PushContent {
  title: string;
  body: string;
  /** Percorso dell'app da aprire al tocco, es. "/prenotazioni/le-mie-lezioni". */
  url: string;
  /**
   * Stesso tag = la notifica nuova sostituisce la vecchia invece di
   * accodarsi (es. lezione prenotata e poi subito spostata).
   */
  tag?: string;
}

export interface SendPushResult {
  sent: number;
  failed: number;
  /** Sottoscrizioni scadute rimosse (dispositivo disinstallato, permesso revocato). */
  removed: number;
  error: string | null;
}

const ICON_PATH = "/assets/icons/icon-192.png";
/** Oltre un giorno una notifica di prenotazione non serve più a nessuno. */
const TTL_SECONDS = 24 * 60 * 60;

function pushEnabled(): boolean {
  return (Deno.env.get("PUSH_ENABLED") ?? "true").trim().toLowerCase() !== "false";
}

let vapidConfigured = false;

function configureVapid(): string | null {
  if (vapidConfigured) return null;
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const subject = Deno.env.get("VAPID_SUBJECT");
  if (!publicKey || !privateKey || !subject) {
    return "VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT non configurate: push non inviate.";
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return null;
}

function payloadOf(content: PushContent): string {
  return JSON.stringify({
    notification: {
      title: content.title,
      body: content.body,
      icon: ICON_PATH,
      lang: "it",
      ...(content.tag ? { tag: content.tag, renotify: true } : {}),
      data: {
        onActionClick: {
          default: { operation: "navigateLastFocusedOrOpen", url: content.url },
        },
      },
    },
  });
}

export async function sendPushToUsers(
  // deno-lint-ignore no-explicit-any
  ctx: SupabaseContext<any>,
  userIds: number[],
  content: PushContent,
): Promise<SendPushResult> {
  const result: SendPushResult = { sent: 0, failed: 0, removed: 0, error: null };
  const ids = [...new Set(userIds)].filter((id) => Number.isFinite(id));
  if (ids.length === 0) return result;

  if (!pushEnabled()) {
    console.log(`[PUSH_ENABLED=false] push bloccata — utenti: ${ids.join(", ")}, titolo: "${content.title}"`);
    return result;
  }

  try {
    const configError = configureVapid();
    if (configError) {
      return { ...result, error: configError };
    }

    const { data: subscriptions, error } = await ctx.supabaseAdmin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .in("user_id", ids);
    if (error) {
      return { ...result, error: error.message };
    }
    if (!subscriptions?.length) return result;

    const payload = payloadOf(content);
    const expiredIds: number[] = [];

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
            { TTL: TTL_SECONDS },
          );
          result.sent++;
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          // 404/410: il servizio push dice che questa sottoscrizione non
          // esiste più. Tenerla vorrebbe dire riprovarci per sempre.
          if (status === 404 || status === 410) {
            expiredIds.push(sub.id);
          } else {
            result.failed++;
            console.error(`push fallita (sottoscrizione ${sub.id}, status ${status ?? "?"}):`, err);
          }
        }
      }),
    );

    if (expiredIds.length) {
      await ctx.supabaseAdmin.from("push_subscriptions").delete().in("id", expiredIds);
      result.removed = expiredIds.length;
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
    console.error("sendPushToUsers:", err);
  }

  return result;
}
