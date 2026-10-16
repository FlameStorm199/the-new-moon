import { Injectable, inject, signal } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { environment } from '../../../environments/environment';
import { SupabaseService } from '../supabase/supabase.service';

export type PushState =
  /** Browser senza push, service worker spento (`ng serve`) o chiave VAPID non impostata. */
  | 'unsupported'
  /** L'utente ha bloccato le notifiche: si riattivano solo dalle impostazioni. */
  | 'denied'
  | 'off'
  | 'on';

/** Oltre questo il logout non aspetta la rete: meglio uscire che restare appesi. */
const FORGET_TIMEOUT_MS = 3000;

/**
 * Notifiche push su QUESTO dispositivo: attivazione (permesso del browser +
 * sottoscrizione salvata con register_push_subscription), disattivazione,
 * e pulizia al logout. L'invio vero e proprio lo fanno le Edge Function di
 * notifica, vedi supabase/functions/_shared/push.ts.
 *
 * Usa PushManager direttamente e non SwPush.requestSubscription: gli
 * observable di SwPush aspettano che il service worker controlli la
 * pagina, e alla prima visita potrebbero non emettere mai — qui serve solo
 * sapere se il service worker di Angular è attivo (SwPush.isEnabled).
 *
 * iPhone/iPad: le push esistono solo con l'app installata in Home (iOS
 * 16.4+). Da Safari "normale" PushManager non c'è e lo stato resta
 * 'unsupported': l'invito a installare è nel riquadro di installazione.
 */
@Injectable({ providedIn: 'root' })
export class PushNotificationsService {
  private readonly supabase = inject(SupabaseService).client;
  // Opzionale: negli spec dei componenti provideServiceWorker non c'è.
  private readonly swPush = inject(SwPush, { optional: true });

  private readonly supported =
    !!this.swPush?.isEnabled &&
    !!environment.vapidPublicKey &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'Notification' in window;

  readonly state = signal<PushState>('unsupported');
  readonly busy = signal(false);

  /** Evita di risalvare la sottoscrizione a ogni refresh del token. */
  private syncedForAuthUserId: string | null = null;

  constructor() {
    if (!this.supported) {
      return;
    }
    void this.refreshState();

    this.supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        this.syncedForAuthUserId = null;
        return;
      }
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session.user.id !== this.syncedForAuthUserId) {
        this.syncedForAuthUserId = session.user.id;
        // Fuori dal callback: supabase-js sconsiglia chiamate al client
        // dentro onAuthStateChange (possono bloccarsi a vicenda).
        setTimeout(() => void this.resyncExisting(), 0);
      }
    });
  }

  /**
   * Va chiamata direttamente dal click: iOS mostra la richiesta di permesso
   * solo in risposta a un gesto dell'utente.
   */
  async enable(): Promise<void> {
    if (!this.supported || this.busy()) {
      return;
    }
    this.busy.set(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        this.state.set(permission === 'denied' ? 'denied' : 'off');
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToUint8Array(environment.vapidPublicKey),
        }));

      try {
        await this.save(subscription);
      } catch (err) {
        // Senza la riga sul server il browser crederebbe di essere iscritto
        // ma non arriverebbe mai nulla: meglio tornare a "spente".
        await subscription.unsubscribe().catch(() => undefined);
        throw err;
      }
      this.state.set('on');
    } finally {
      this.busy.set(false);
    }
  }

  async disable(): Promise<void> {
    if (!this.supported || this.busy()) {
      return;
    }
    this.busy.set(true);
    try {
      await this.removeSubscription();
      this.state.set(Notification.permission === 'denied' ? 'denied' : 'off');
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Al logout: il prossimo account che accede da questo dispositivo non
   * deve ricevere le notifiche del precedente. Va chiamata PRIMA di
   * signOut, finché c'è ancora la sessione per la RPC. Non lancia mai.
   */
  async forgetThisDevice(): Promise<void> {
    if (!this.supported) {
      return;
    }
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, FORGET_TIMEOUT_MS));
    await Promise.race([this.removeSubscription().catch(() => undefined), timeout]);
    this.syncedForAuthUserId = null;
    void this.refreshState();
  }

  private async refreshState(): Promise<void> {
    if (Notification.permission === 'denied') {
      this.state.set('denied');
      return;
    }
    const subscription = await this.currentSubscription();
    this.state.set(subscription && Notification.permission === 'granted' ? 'on' : 'off');
  }

  /**
   * A ogni accesso riallinea il server con il browser: il servizio push può
   * aver cambiato endpoint, o la riga può essere stata rimossa (scaduta).
   * Solo se le notifiche erano già attive: non attiva mai nulla da sé.
   */
  private async resyncExisting(): Promise<void> {
    if (Notification.permission !== 'granted') {
      return;
    }
    const subscription = await this.currentSubscription();
    if (subscription) {
      await this.save(subscription).catch(() => undefined);
    }
  }

  private async removeSubscription(): Promise<void> {
    const subscription = await this.currentSubscription();
    if (!subscription) {
      return;
    }
    // Anche se la RPC fallisce si disiscrive il browser: la riga rimasta sul
    // server verrà eliminata dalla Edge Function al primo invio (410).
    await this.supabase
      .rpc('unregister_push_subscription', { p_endpoint: subscription.endpoint })
      .then(() => undefined, () => undefined);
    await subscription.unsubscribe();
  }

  private async currentSubscription(): Promise<PushSubscription | null> {
    const registration = await navigator.serviceWorker.getRegistration();
    return (await registration?.pushManager.getSubscription()) ?? null;
  }

  private async save(subscription: PushSubscription): Promise<void> {
    const json = subscription.toJSON();
    const { error } = await this.supabase.rpc('register_push_subscription', {
      p_endpoint: subscription.endpoint,
      p_p256dh: json.keys?.['p256dh'] ?? '',
      p_auth: json.keys?.['auth'] ?? '',
      p_user_agent: navigator.userAgent,
    });
    if (error) {
      throw error;
    }
  }
}

/** La chiave VAPID arriva in base64url, PushManager la vuole in byte. */
function base64UrlToUint8Array(value: string): Uint8Array {
  const padded = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
