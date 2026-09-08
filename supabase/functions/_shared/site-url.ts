// URL base dell'app, per costruire i link dentro le email che non passano
// da generateLink() (quelle hanno già il proprio redirectTo). Centralizzato
// qui perché sia password-flows.ts sia le notifiche di validazione ne hanno
// bisogno — un solo posto da aggiornare se il dominio cambia.
//
// Fallback solo per lo sviluppo locale: IN PRODUZIONE SITE_URL va impostata
// tra i secret della Edge Function, altrimenti i link nelle email
// manderebbero l'utente su localhost.
const DEFAULT_SITE_URL = "http://localhost:4200";

export function siteUrl(): string {
  return (Deno.env.get("SITE_URL") ?? DEFAULT_SITE_URL).replace(/\/+$/, "");
}
