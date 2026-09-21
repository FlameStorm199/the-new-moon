// Testi delle email di iscrizione/cancellazione/rimozione da un evento.
// Contenuto per contratto (handoff_fase2.md): Titolo, Luogo, Data, Orario,
// Nota — MAI Contributo (prezzo) né Numero di cani (capienza). Non è solo
// una scelta di stile: EventRegistrationDetail sotto non ha affatto quei
// due campi, quindi non possono nemmeno finire in un'email per errore.

export interface EventRegistrationDetail {
  id: number;
  event_title: string;
  event_location: string;
  event_date: string;
  event_time_from: string;
  event_time_to: string;
  cancellation_note: string | null;
  customer_email: string | null;
}

function formatDateIt(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

function formatTime(time: string): string {
  return time.slice(0, 5);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function noteBlock(note: string | null): string {
  if (!note) return '';
  return `<p style="border-left:3px solid #ddd; padding-left:0.75rem; color:#555;">
    <strong>Nota:</strong> ${escapeHtml(note)}
  </p>`;
}

function eventDetail(detail: EventRegistrationDetail): string {
  return `
    <p style="margin:0.25rem 0;"><strong>${escapeHtml(detail.event_title)}</strong></p>
    <p style="margin:0.25rem 0; color:#555;">${escapeHtml(detail.event_location)}</p>
    <p style="margin:0.25rem 0; color:#555;">${formatDateIt(detail.event_date)} dalle ${formatTime(detail.event_time_from)} alle ${formatTime(detail.event_time_to)}</p>
  `;
}

function shell(bodyHtml: string): string {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #222;">
      ${bodyHtml}
      <p style="font-size:0.8rem; color:#777; margin-top:2rem;">ASD Cinofila "La Luna Nuova"</p>
    </div>
  `;
}

export interface EmailContent {
  subject: string;
  html: string;
}

export function customerEmailForEventRegistration(
  event: 'registered' | 'cancelled' | 'removed' | 'event_cancelled',
  detail: EventRegistrationDetail
): EmailContent {
  switch (event) {
    case 'event_cancelled':
      return {
        subject: 'Evento cancellato',
        html: shell(`
          <h2>Evento cancellato</h2>
          <p>L'evento a cui eri iscritto/a è stato cancellato:</p>
          ${eventDetail(detail)}
          ${noteBlock(detail.cancellation_note)}
        `),
      };
    case 'registered':
      return {
        subject: 'Iscrizione confermata',
        html: shell(`
          <h2>Iscrizione confermata</h2>
          <p>Sei iscritto/a a:</p>
          ${eventDetail(detail)}
        `),
      };
    case 'cancelled':
      return {
        subject: 'Iscrizione cancellata',
        html: shell(`
          <h2>Iscrizione cancellata</h2>
          <p>Hai cancellato la tua iscrizione a:</p>
          ${eventDetail(detail)}
        `),
      };
    case 'removed':
      return {
        subject: 'Iscrizione rimossa',
        html: shell(`
          <h2>Iscrizione rimossa</h2>
          <p>Lo staff ha rimosso la tua iscrizione a:</p>
          ${eventDetail(detail)}
          ${noteBlock(detail.cancellation_note)}
        `),
      };
  }
}
