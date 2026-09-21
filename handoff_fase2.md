# Handoff — Fase 2 (Incontro Conoscitivo + Eventi)

Documento di passaggio da sessione di design a Claude Code. Presuppone la Fase 1 già rilasciata e in produzione — non ripete decisioni/schema di quella fase, solo ciò che è nuovo o cambia per questa.

- Oggi: lunedì 21/09. Rilascio: **domenica 27/09**. Disponibilità: 17-18h totali su 7 giorni (piano in fondo).
- File SQL da eseguire su Supabase, **in ordine**, non ancora lanciati:
  1. `002_auth_signup_trigger.sql` — se non già eseguito in Fase 1, verificare prima
  2. `003_fase2_schema.sql` — `events.event_range` (anti-sovrapposizione), `users.invited_by`, trigger sync conferma email, trigger promozione automatica future_customer→customer
  3. `004_fase2_events_revision.sql` — `events.location`, `events.max_customers` nullable, `event_registrations.cancellation_note`, stato iscrizioni semplificato

## ⚠️ Prima azione da fare tu, non delegabile al codice

Verificare se in Fase 1 è già stato scritto un trigger che sincronizza `public.users.confirmed_email`/`confirmed_email_at` da `auth.users.email_confirmed_at`. Se esiste già (con nome diverso da `trg_auth_user_email_confirmed`), valutare se disattivarne uno dei due — coesistere è innocuo ma ridondante. Se non esiste, `003_fase2_schema.sql` lo crea lui.

## Decisioni prese in questa sessione (alcune correggono ipotesi della Fase 1)

**Incontro Conoscitivo — creazione utenza rivista.** Non si usa più `signInWithOtp` (ipotesi iniziale, prima di sapere che Fase 2 era rimandata): non permette di impostare `app_metadata`, necessario al trigger di Fase 1 per distinguere self-signup da creazione server-side. Ora: Edge Function chiama `admin.createUser({ email, email_confirm: false, app_metadata: { admin_created: true } })`, poi inserisce direttamente la riga `public.users` con `type_id = future_customer`, poi `admin.generateLink()` + Resend per il link di conferma. Stesso meccanismo già usato per la creazione utenti staff in Fase 1, nessun codice nuovo di categoria diversa.

**Promozione automatica a customer.** Trigger su `auth.users`, condizione `OLD.encrypted_password IS NULL AND NEW.encrypted_password IS NOT NULL` (prima password mai impostata). Se l'utente collegato è `future_customer`: diventa `customer`, `validated=true`, `validated_at=now()`, `validated_by = invited_by` (colonna nuova: chi ha effettivamente inviato l'email di invito, non necessariamente chi ha accettato l'incontro — possono essere due educatori diversi).

**Iscrizione eventi: niente approvazione staff.** Contraddice sez. 16 del documento originale ("la richiesta deve essere approvata da educatore/amministratore") — la cliente ha chiesto esplicitamente iscrizione **self-service istantanea**, bloccata solo se i posti sono esauriti. Confermato dall'utente. Stato `event_registrations.status`: solo `active`/`cancelled` (non più `requested`/`approved`/`rejected`). La RPC che serviva ("approvazione") non esiste più: la concorrenza sull'ultimo posto si gestisce con lock pessimistico al momento dell'**iscrizione**, non dell'approvazione (vedi sotto).

**Assistente = Cliente + Educatore in sola visualizzazione.** Informazione emersa dallo sviluppo Fase 1, non dal documento originale: gli Assistenti hanno già, in produzione, tutti i diritti di un Customer sulle **proprie** entità (prenotano/cancellano lezioni come un customer), oltre alla visualizzazione in sola lettura di tutto il resto. Per gli eventi vale lo stesso principio: **stessi diritti del Customer** su iscrizione/cancellazione propria. Resta invece "solo visualizzazione" su tutto ciò che è gestione altrui (creazione eventi, rimozione di un iscritto, ecc. — riservate a educatore/admin).

**Cancellazione Incontro Conoscitivo da parte dell'utente stesso.** Non era coperta esplicitamente dalla matrice permessi scritta in Fase 1 (che copriva solo la prenotazione). Ora confermato: il future_customer può cancellare la propria lezione **con le stesse regole di un customer normale** (finestra `app_settings.lesson_cancel_min_hours_before`), riusando la stessa RPC di cancellazione lezione già esistente. **Verifica da fare sul codice Fase 1**: quella RPC deve controllare "la lezione appartiene a chi chiama" (`customer_id = current_app_user_id()`), non "chi chiama è di tipo customer" — se il controllo fosse stato scritto sul ruolo invece che sulla proprietà della riga, un future_customer resterebbe escluso ingiustamente.

**Rimozione forzata di un iscritto a un evento.** Solo trainer/admin, con `cancellation_note` obbligatoria (nuovo campo). La notifica email va **solo al cliente rimosso** (non allo staff che ha eseguito l'azione).

**Campi evento aggiunti rispetto al documento originale:** `location` (Luogo, richiesto dalla cliente, mancava). `max_customers` ora nullable = nessun limite di partecipanti (anche questo mancava: prima era obbligatorio e sempre limitato).

**Contenuto email eventi**: iscrizione/cancellazione devono riportare Titolo, Luogo, Data, Orario, Nota — **mai** Contributo (prezzo) né Numero di cani (capienza).

**Storico eventi**: nessuna tabella/flag dedicato. La lista "eventi in corso" si ottiene filtrando per `date >= oggi` in query — gli eventi passati spariscono da soli dalla vista, nessuna cancellazione fisica necessaria. Cancellazione manuale resta comunque disponibile per trainer/admin se vogliono ripulire prima.

## Le 3 RPC da scrivere per gli eventi (logica, non ancora codificate)

- **`register_for_event(event_id)`**: `SELECT max_customers FROM events WHERE id=... FOR UPDATE` (lock sulla riga evento) → se `max_customers IS NOT NULL`, conta le iscrizioni `active` e blocca se già al limite → altrimenti insert con `customer_id = current_app_user_id()`. Il lock **prima** del conteggio è essenziale: è lo stesso principio anti-race-condition già usato in Fase 1 per le prenotazioni slot, qui applicato a un vincolo aggregato invece che puntuale — due iscrizioni concorrenti sull'ultimo posto si serializzano invece di sovrapporsi.
- **`cancel_event_registration(registration_id)`**: verifica proprietà della riga, `status='cancelled'`, `cancellation_note=NULL`, notifica solo l'interessato.
- **`admin_remove_event_registration(registration_id, note)`**: riservata a trainer/admin, `status='cancelled'`, `cancellation_note=note`, notifica il cliente rimosso.

`create_event`/`update_event` (già disegnate concettualmente prima di questa revisione, invariate nella logica): transazione che blocca la creazione/modifica se l'evento si sovrappone a slot con lezioni attive (rollback + elenco conflitti restituito), altrimenti disattiva gli slot liberi sovrapposti taggandoli `deactivated_by_event_id`. Alla modifica/cancellazione, riattiva solo gli slot con quel preciso `deactivated_by_event_id`.

## Piano giornaliero (21/09 → 27/09)

| Data | Ore | Attività | Priorità |
|---|---|---|---|
| Lun 21/09 | 2h | Verifica trigger email-confirm esistente; esecuzione 003+004 su Supabase; scaffold Edge Function creazione future_customer | 🔴 |
| Mar 22/09 | 1h | Completamento/test Edge Function Incontro Conoscitivo end-to-end | 🔴 |
| Mer 23/09 | 2h | Form pubblico mobile-first (`/incontro-conoscitivo`, fuori navbar) + vista slot per future_customer | 🔴 |
| Gio 24/09 | 2h | Prenotazione/cancellazione lezione Incontro Conoscitivo (riuso RPC, verifica controllo per proprietà); accettazione/rifiuto lato educatore | 🔴 |
| Ven 25/09 | 2h | Invito password manuale con `invited_by`; verifica end-to-end promozione a customer; avvio RPC `create_event`/`update_event` | 🔴 |
| Sab 26/09 | 4-5h | UI trainer/admin eventi (CRUD, lista con posti/iscritti, rimozione con nota); RPC `register_for_event`/`cancel_event_registration`/`admin_remove_event_registration`; UI customer/assistant (lista, iscrizione/cancellazione, badge iscritto); email eventi | 🔴 |
| Dom 27/09 | 4h | Test end-to-end entrambi i flussi, bugfix, deploy produzione, verifica finale | 🔴 |

⚠️ **Rischio dichiarato**: sabato è la giornata più densa (tre RPC nuove + due UI complete + email), senza un vero cuscinetto oltre alla domenica. Se sabato va in sofferenza, taglio di riserva già deciso: la riattivazione automatica degli slot su modifica/cancellazione evento diventa un pulsante manuale ("libera gli slot di questo evento") invece che automatica dentro `update_event` — non tocca sicurezza (il blocco anti-sovrapposizione resta automatico), solo comodità rimandabile a dopo il 27/09.

## Note aperte, non bloccanti

- Nessuna modifica alla navbar anche in questa fase (tutto resta raggiungibile solo via URL diretto).
- Reminder: già implementati durante lo sviluppo Fase 1, nessun lavoro residuo qui.
- Pagamento eventi: mai previsto, `price` resta puramente informativo — nessun payment provider da integrare.
