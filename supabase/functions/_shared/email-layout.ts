import { siteUrl } from "./site-url.ts";

// Impaginazione unica di tutte le email transazionali (lezioni, eventi,
// incontro conoscitivo, account e password). Ogni template descrive solo
// COSA dire — titolo, paragrafi, riquadro dettagli, bottone — e questo file
// decide COME appare, così l'aspetto si cambia in un posto solo.
//
// Scritto per i client di posta, non per il browser: tabelle invece di
// flex/grid, stili tutti inline, niente <style> che Gmail e Outlook
// scarterebbero, larghezza massima fissa, bottone "a prova di Outlook"
// (cella di tabella colorata con dentro il link). I colori sono quelli
// dell'app: blu per le lezioni, viola per gli eventi, verde acqua per
// l'Incontro Conoscitivo.

export type Tone = "lesson" | "event" | "incontro" | "success" | "danger" | "neutral";

const TONES: Record<Tone, { fg: string; bg: string }> = {
  lesson: { fg: "#3b6fd4", bg: "#eef3fc" },
  event: { fg: "#7c4dff", bg: "#f3efff" },
  incontro: { fg: "#0b6b63", bg: "#e6f5f3" },
  success: { fg: "#1b7a3d", bg: "#eaf7ef" },
  danger: { fg: "#b00020", bg: "#fdecea" },
  neutral: { fg: "#555555", bg: "#f4f5f7" },
};

const ACCENT = "#3b6fd4";
const TEXT = "#1f2328";
const MUTED = "#5f6670";
const PAGE_BG = "#f3f4f7";
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export interface DetailRow {
  label: string;
  /** Testo semplice: viene escapato qui. */
  value: string;
}

export interface DetailBlock {
  /** Piccola intestazione sopra il riquadro (es. "Prima" / "Ora" per uno spostamento). */
  heading?: string;
  rows: DetailRow[];
  tone?: Tone;
  /** Riquadro "superato" (il vecchio orario di una lezione spostata): grigio e barrato. */
  muted?: boolean;
}

export interface EmailOptions {
  /** Anteprima mostrata dal client accanto all'oggetto; non visibile nel corpo. */
  preheader: string;
  /** Etichetta colorata sopra il titolo (es. "Lezione", "Evento"). */
  badge?: { text: string; tone: Tone };
  title: string;
  /** Paragrafi in HTML: chi li passa deve aver già escapato il testo libero. */
  paragraphs?: string[];
  details?: DetailBlock[];
  /** Testo libero dello staff o del cliente (motivo, nota): escapato qui. */
  note?: { label: string; text: string };
  cta?: { url: string; label: string };
  /** Righe piccole sotto il bottone (es. link di riserva, "se non sei stato tu…"). */
  smallPrint?: string[];
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const WEEKDAYS = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
const MONTHS = [
  "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
];

/**
 * "Giovedì 3 settembre 2026": in un'email si legge meglio di 03/09/2026 e
 * non lascia dubbi sul giorno. Costruita dai pezzi e in UTC, perché la data
 * è un giorno di calendario senza fuso (le Edge Function girano in UTC).
 */
export function formatLongDateIt(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const weekday = WEEKDAYS[date.getUTCDay()];
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${d} ${MONTHS[m - 1]} ${y}`;
}

/** "09:00 – 09:55" da due orari Postgres (HH:MM:SS). */
export function formatTimeRangeIt(timeFrom: string, timeTo: string): string {
  return `${timeFrom.slice(0, 5)} – ${timeTo.slice(0, 5)}`;
}

function badgeHtml(badge: EmailOptions["badge"]): string {
  if (!badge) return "";
  const tone = TONES[badge.tone];
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;">
    <tr><td style="background:${tone.bg}; color:${tone.fg}; font-family:${FONT}; font-size:12px; font-weight:700; letter-spacing:0.02em; padding:4px 10px; border-radius:6px;">${escapeHtml(badge.text)}</td></tr>
  </table>`;
}

function detailBlockHtml(block: DetailBlock): string {
  const tone = TONES[block.tone ?? "neutral"];
  const border = block.muted ? "#d5d8de" : tone.fg;
  const bg = block.muted ? "#f6f7f9" : tone.bg;
  const valueColor = block.muted ? "#8a9099" : TEXT;
  const decoration = block.muted ? "text-decoration:line-through;" : "";

  const heading = block.heading
    ? `<p style="margin:0 0 6px; font-family:${FONT}; font-size:12px; font-weight:700; color:${MUTED}; text-transform:uppercase; letter-spacing:0.04em;">${escapeHtml(block.heading)}</p>`
    : "";

  const rows = block.rows
    .map(
      (row) => `<tr>
        <td valign="top" style="padding:5px 12px 5px 0; font-family:${FONT}; font-size:13px; color:${MUTED}; white-space:nowrap; width:1%;">${escapeHtml(row.label)}</td>
        <td valign="top" style="padding:5px 0; font-family:${FONT}; font-size:15px; font-weight:600; color:${valueColor}; ${decoration}">${escapeHtml(row.value)}</td>
      </tr>`,
    )
    .join("");

  return `${heading}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px; background:${bg}; border-left:4px solid ${border}; border-radius:8px;">
    <tr><td style="padding:12px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>
    </td></tr>
  </table>`;
}

function noteHtml(note: EmailOptions["note"]): string {
  if (!note) return "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;">
    <tr><td style="padding:10px 14px; background:#fafafa; border:1px solid #eceef2; border-radius:8px; font-family:${FONT}; font-size:14px; line-height:1.5; color:#3d434a;">
      <strong style="color:${TEXT};">${escapeHtml(note.label)}</strong><br>${escapeHtml(note.text)}
    </td></tr>
  </table>`;
}

/** Bottone come cella di tabella colorata: l'unico modo che Outlook rispetti. */
function ctaHtml(cta: EmailOptions["cta"]): string {
  if (!cta) return "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 22px;">
    <tr><td align="center" bgcolor="${ACCENT}" style="border-radius:8px;">
      <a href="${escapeHtml(cta.url)}" target="_blank" style="display:inline-block; padding:13px 26px; font-family:${FONT}; font-size:15px; font-weight:700; color:#ffffff; text-decoration:none; border-radius:8px;">${escapeHtml(cta.label)}</a>
    </td></tr>
  </table>`;
}

export function renderEmail(opts: EmailOptions): string {
  const base = siteUrl();
  const logoUrl = `${base}/assets/images/email-logo.png`;

  const paragraphs = (opts.paragraphs ?? [])
    .map(
      (p) =>
        `<p style="margin:0 0 16px; font-family:${FONT}; font-size:15px; line-height:1.6; color:${TEXT};">${p}</p>`,
    )
    .join("");

  const details = (opts.details ?? []).map(detailBlockHtml).join("");

  const smallPrint = (opts.smallPrint ?? [])
    .map(
      (p) =>
        `<p style="margin:0 0 8px; font-family:${FONT}; font-size:12px; line-height:1.5; color:${MUTED};">${p}</p>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(opts.title)}</title>
</head>
<body style="margin:0; padding:0; background:${PAGE_BG};">
<div style="display:none; max-height:0; overflow:hidden; opacity:0; mso-hide:all;">${escapeHtml(opts.preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAGE_BG}" style="background:${PAGE_BG};">
  <tr><td align="center" style="padding:28px 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
      <tr><td bgcolor="#ffffff" style="background:#ffffff; border-radius:14px; border-top:4px solid ${ACCENT}; padding:22px 30px 14px;">
        <!-- Logo dentro la card: ha lo sfondo bianco, sul grigio della pagina sembrerebbe un adesivo. -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px; border-bottom:1px solid #eceef2;">
          <tr><td align="center" style="padding:0 0 16px;">
            <a href="${escapeHtml(base)}" target="_blank" style="text-decoration:none;">
              <img src="${escapeHtml(logoUrl)}" width="104" height="86" alt="ASD Cinofila La Luna Nuova" style="display:block; border:0; width:104px; height:auto; font-family:${FONT}; font-size:14px; font-weight:700; color:${TEXT};">
            </a>
          </td></tr>
        </table>
        ${badgeHtml(opts.badge)}
        <h1 style="margin:0 0 16px; font-family:${FONT}; font-size:22px; line-height:1.3; font-weight:700; color:${TEXT};">${escapeHtml(opts.title)}</h1>
        ${paragraphs}
        ${details}
        ${noteHtml(opts.note)}
        ${ctaHtml(opts.cta)}
        ${smallPrint}
      </td></tr>
      <tr><td align="center" style="padding:20px 12px 0; font-family:${FONT}; font-size:12px; line-height:1.6; color:#8a9099;">
        ASD Cinofila "La Luna Nuova" · Ponzano Veneto<br>
        <a href="${escapeHtml(`${base}/prenotazioni/area-personale`)}" target="_blank" style="color:#8a9099; text-decoration:underline;">Area personale</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}
