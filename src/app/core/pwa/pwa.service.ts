import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { filter } from 'rxjs';

/** L'evento non è nei tipi DOM standard: esiste solo sui browser Chromium. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type PwaPlatform = 'ios' | 'android' | 'other';

/** Stesso confine dello scope in manifest.webmanifest. */
const APP_PREFIX = '/prenotazioni';
const MANIFEST_HREF = 'manifest.webmanifest';

/**
 * Tutto ciò che riguarda l'area prenotazioni installata come app (PWA):
 *
 * - il <link rel="manifest"> esiste solo dentro /prenotazioni: sul sito
 *   pubblico il browser non deve proporre di installare l'area riservata,
 *   che dal sito non è mai linkata;
 * - riconosce se si sta girando "da app" (schermata Home) per adattare la
 *   navbar, vedi NavbarComponent;
 * - tiene da parte il prompt di installazione di Android/Chrome, che il
 *   browser lancia una volta sola e spesso prima che l'area personale (dove
 *   c'è il bottone) sia caricata;
 * - applica gli aggiornamenti del service worker alla navigazione
 *   successiva: un'app lasciata aperta per giorni altrimenti resterebbe
 *   sulla versione vecchia.
 *
 * Va istanziato all'avvio (lo inietta AppComponent).
 */
@Injectable({ providedIn: 'root' })
export class PwaService {
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);
  // Opzionale: negli spec dei componenti provideServiceWorker non c'è.
  private readonly swUpdate = inject(SwUpdate, { optional: true });

  /** true quando aperta dall'icona in Home, non da una scheda del browser. */
  readonly standalone = signal(detectStandalone());
  readonly platform: PwaPlatform = detectPlatform();

  private readonly installPrompt = signal<BeforeInstallPromptEvent | null>(null);
  /** Solo Chromium: c'è un prompt nativo da lanciare col bottone "Installa". */
  readonly canPromptInstall = computed(() => this.installPrompt() !== null);

  private updateReady = false;

  constructor() {
    this.document.documentElement.classList.toggle('pwa-standalone', this.standalone());

    this.syncManifestLink(this.router.url);
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => this.syncManifestLink(e.urlAfterRedirects));

    const win = this.document.defaultView;
    win?.addEventListener('beforeinstallprompt', (event) => {
      // Niente mini-banner automatico di Chrome: l'invito è il riquadro
      // dell'area personale, che decide da sé quando mostrarsi.
      event.preventDefault();
      this.installPrompt.set(event as BeforeInstallPromptEvent);
    });
    win?.addEventListener('appinstalled', () => this.installPrompt.set(null));

    this.watchForUpdates();
  }

  /** Lancia il prompt nativo. true se l'utente ha accettato. */
  async promptInstall(): Promise<boolean> {
    const prompt = this.installPrompt();
    if (!prompt) {
      return false;
    }
    // Il prompt è usa-e-getta: dopo prompt() non si può riusare.
    this.installPrompt.set(null);
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    return outcome === 'accepted';
  }

  private syncManifestLink(url: string): void {
    const inApp = url === APP_PREFIX || url.startsWith(`${APP_PREFIX}/`) || url.startsWith(`${APP_PREFIX}?`);
    const existing = this.document.head.querySelector<HTMLLinkElement>('link[rel="manifest"]');

    if (inApp && !existing) {
      const link = this.document.createElement('link');
      link.rel = 'manifest';
      link.href = MANIFEST_HREF;
      this.document.head.appendChild(link);
    } else if (!inApp && existing) {
      existing.remove();
    }
  }

  private watchForUpdates(): void {
    // Disabilitato con `ng serve` (il service worker c'è solo in build di
    // produzione, vedi angular.json): niente da fare.
    const swUpdate = this.swUpdate;
    if (!swUpdate?.isEnabled) {
      return;
    }

    swUpdate.versionUpdates
      .pipe(filter((e) => e.type === 'VERSION_READY'))
      .subscribe(() => (this.updateReady = true));

    // Cache rotta (es. file cancellati dal browser per spazio): l'unica
    // via d'uscita è ricaricare dalla rete.
    swUpdate.unrecoverable.subscribe(() => this.document.location.reload());

    // Ricaricare a metà di un form farebbe perdere quanto scritto: si
    // aspetta che l'utente cambi pagina e si carica direttamente quella.
    this.router.events
      .pipe(filter((e): e is NavigationStart => e instanceof NavigationStart))
      .subscribe((e) => {
        if (this.updateReady) {
          this.document.location.href = e.url;
        }
      });

    // Un'app installata non viene "riaperta" come un sito: torna in primo
    // piano. È il momento giusto per controllare se c'è una versione nuova.
    this.document.addEventListener('visibilitychange', () => {
      if (this.document.visibilityState === 'visible') {
        swUpdate.checkForUpdate().catch(() => undefined);
      }
    });
  }
}

function detectStandalone(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  // navigator.standalone: unico segnale affidabile sulle versioni di iOS
  // che non supportano la media query display-mode.
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia('(display-mode: standalone)').matches;
}

function detectPlatform(): PwaPlatform {
  if (typeof navigator === 'undefined') {
    return 'other';
  }
  const ua = navigator.userAgent;
  // iPadOS si presenta come Mac: lo tradisce il touch.
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) {
    return 'ios';
  }
  if (/android/i.test(ua)) {
    return 'android';
  }
  return 'other';
}
