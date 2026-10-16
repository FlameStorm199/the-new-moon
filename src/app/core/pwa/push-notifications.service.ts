import { Injectable, computed, inject, signal } from '@angular/core';
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

/** Lo stesso file che registra Angular (provideServiceWorker in app.config.ts). */
const SW_SCRIPT = 'ngsw-worker.js';
/** Oltre questo il logout non aspetta la rete: meglio uscire che restare appesi. */
const FORGET_TIMEOUT_MS = 3000;
/**
 * Tetto per ogni passaggio dell'attivazione (service worker pronto,
 * iscrizione al servizio push, salvataggio). Senza, un passaggio che non
 * risponde lascia l'interruttore su "Attivazione…" per sempre.
 */
const STEP_TIMEOUT_MS = 20000;

/**
 * Notifiche push su QUESTO dispositivo: attivazione (permesso del browser +
 * sottoscrizione salvata con register_push_subscription), disattivazione,
 * e pulizia al logout. L'invio vero e proprio lo fanno le Edge Function di
 * notifica, vedi supabase/functions/_shared/push.ts.
 *
 * "Attive di default", per quanto i browser lo permettono: nessuno consente
 * di attivarle senza il permesso dell'utente, e iPhone/Safari vogliono che
 * la richiesta parta da un tocco. Quindi:
 * - permesso già concesso su questo dispositivo → a ogni accesso si
 *   attivano da sole, senza chiedere nulla (anche dopo logout/login);
 * - permesso mai chiesto → shouldAsk diventa true e compare l'invito
 *   (PushPromptComponent), un tocco e sono attive.
 *
 * Usa PushManager direttamente e non SwPush.requestSubscription: gli
 * observable di SwPush aspettano che il service worker controlli la
 * pagina, e alla prima visita potrebbero non emettere mai — qui serve solo
 * sapere se il service worker di Angular è abilitato (SwPush.isEnabled).
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
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;

  readonly state = signal<PushState>('unsupported');
  readonly busy = signal(false);
  /**
   * Ultimo errore di attivazione, già pronto da mostrare: messaggio per
   * l'utente + codice breve del passaggio fallito (es. "sw-ready-timeout"),
   * così da capire il problema anche senza console. null dopo un successo.
   */
  readonly lastError = signal<string | null>(null);

  private readonly signedIn = signal(false);
  private readonly permission = signal<NotificationPermission>(
    this.supported ? Notification.permission : 'denied'
  );

  /** Permesso mai chiesto, utente collegato: è il momento dell'invito. */
  readonly shouldAsk = computed(
    () => this.signedIn() && this.state() === 'off' && this.permission() === 'default'
  );

  /** Evita di rifare l'attivazione automatica a ogni refresh del token. */
  private syncedForAuthUserId: string | null = null;

  constructor() {
    if (!this.supported) {
      return;
    }
    void this.refreshState();
    // Subito, senza aspettare provideServiceWorker (che registra solo ad app
    // "stabile" o dopo 30 secondi): quando l'utente tocca "Attiva" il
    // service worker deve essere già pronto. Stesso script e scope di
    // Angular, quindi è la stessa registrazione.
    navigator.serviceWorker.register(SW_SCRIPT).catch((err) => console.warn('[push] registrazione service worker:', err));

    this.supabase.auth.onAuthStateChange((event, session) => {
      this.signedIn.set(!!session);
      if (!session) {
        this.syncedForAuthUserId = null;
        return;
      }
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session.user.id !== this.syncedForAuthUserId) {
        this.syncedForAuthUserId = session.user.id;
        // Fuori dal callback: supabase-js sconsiglia chiamate al client
        // dentro onAuthStateChange (possono bloccarsi a vicenda).
        setTimeout(() => void this.autoEnable(), 0);
      }
    });
  }

  /**
   * Va chiamata direttamente dal click: iOS e Safari mostrano la richiesta
   * di permesso solo in risposta a un gesto dell'utente. Lancia un Error
   * con un messaggio già leggibile dall'utente.
   */
  async enable(): Promise<void> {
    if (!this.supported || this.busy()) {
      return;
    }
    this.busy.set(true);
    try {
      // Niente timeout qui: l'utente può metterci quanto vuole a decidere.
      const permission = await Notification.requestPermission();
      this.permission.set(permission);
      if (permission !== 'granted') {
        this.state.set(permission === 'denied' ? 'denied' : 'off');
        return;
      }
      await this.subscribeAndSave();
      this.state.set('on');
      this.lastError.set(null);
    } catch (err) {
      this.lastError.set(describe(err));
      throw err;
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
   * Al prossimo accesso, permesso già concesso, si riattivano da sole.
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
    this.permission.set(Notification.permission);
    if (Notification.permission === 'denied') {
      this.state.set('denied');
      return;
    }
    const subscription = await this.currentSubscription();
    this.state.set(subscription && Notification.permission === 'granted' ? 'on' : 'off');
  }

  /**
   * A ogni accesso, se il permesso c'è già: crea la sottoscrizione se manca
   * (dopo un logout, o un'iscrizione scaduta) e riallinea il server, perché
   * il servizio push può aver cambiato endpoint. Mai la richiesta di
   * permesso: senza un tocco iOS/Safari la rifiutano e Chrome la penalizza.
   */
  private async autoEnable(): Promise<void> {
    // Silenziosa: niente busy, quindi niente "Attivazione…" a ogni
    // ricarica. L'interfaccia cambia solo se riesce (o mostra il motivo se
    // fallisce, in lastError).
    if (Notification.permission !== 'granted' || this.busy() || this.autoRunning) {
      return;
    }
    this.autoRunning = true;
    try {
      await this.subscribeAndSave();
      this.state.set('on');
      this.lastError.set(null);
    } catch (err) {
      console.warn('[push] attivazione automatica non riuscita:', err);
      this.lastError.set(describe(err));
    } finally {
      this.autoRunning = false;
    }
  }

  private autoRunning = false;

  private async subscribeAndSave(): Promise<void> {
    const registration = await this.readyRegistration();

    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await withTimeout(
        registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToUint8Array(environment.vapidPublicKey),
        }),
        'subscribe',
        'Il servizio delle notifiche del browser non risponde. Riprova tra poco.'
      ));

    try {
      await withTimeout(this.save(subscription), 'save', 'Non riusciamo a salvare la scelta. Controlla la connessione e riprova.');
    } catch (err) {
      // Senza la riga sul server il browser crederebbe di essere iscritto
      // ma non arriverebbe mai nulla: meglio tornare a "spente".
      await subscription.unsubscribe().catch(() => undefined);
      throw err;
    }
  }

  /**
   * Il service worker pronto, senza aspettare Angular: provideServiceWorker
   * lo registra solo quando l'app è "stabile" o dopo 30 secondi, e
   * serviceWorker.ready resta in attesa fino ad allora. Registrare lo
   * stesso script con lo stesso scope è idempotente: se c'è già, il
   * browser restituisce la registrazione esistente.
   */
  private async readyRegistration(): Promise<ServiceWorkerRegistration> {
    const message = 'Le notifiche non sono ancora pronte su questo dispositivo. Ricarica la pagina e riprova.';
    await withTimeout(navigator.serviceWorker.register(SW_SCRIPT), 'sw-register', message);
    return withTimeout(navigator.serviceWorker.ready, 'sw-ready', message);
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

/** Errore di attivazione: messaggio per l'utente + codice del passaggio. */
class PushSetupError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
  }
}

function describe(err: unknown): string {
  if (err instanceof PushSetupError) {
    return `${err.message} (codice: ${err.code})`;
  }
  return 'Attivazione non riuscita, riprova.';
}

/**
 * Rifiuta dopo STEP_TIMEOUT_MS, o se il passaggio fallisce, con `message`
 * per l'utente e un codice "<step>-timeout" / "<step>-<NomeErrore>".
 */
function withTimeout<T>(promise: Promise<T>, step: string, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      console.warn(`[push] timeout: ${step}`);
      reject(new PushSetupError(message, `${step}-timeout`));
    }, STEP_TIMEOUT_MS);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        console.warn(`[push] errore: ${step}`, err);
        const name = (err as { name?: string; code?: string })?.name || (err as { code?: string })?.code || 'error';
        reject(new PushSetupError(message, `${step}-${name}`));
      }
    );
  });
}

/** La chiave VAPID arriva in base64url, PushManager la vuole in byte. */
function base64UrlToUint8Array(value: string): Uint8Array {
  const padded = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
