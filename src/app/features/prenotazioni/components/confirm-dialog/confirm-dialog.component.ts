import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
  ViewChild,
} from '@angular/core';

/**
 * Conferma generica a uno stato solo (niente ricevuta: chi lo usa chiude il
 * pannello e mostra l'esito in linea nella pagina, stesso pattern già usato
 * in gestione-utenti.component.ts per azioni meno centrali di prenotazione/
 * cancellazione lezione — quelle hanno un modale dedicato a due stati,
 * queste non lo giustificano). Riusata per azioni diverse (cancella evento,
 * rimuovi iscritto, cancella la propria iscrizione) invece di un modale
 * quasi identico per ciascuna.
 */
@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './confirm-dialog.component.html',
  styleUrl: './confirm-dialog.component.scss',
})
export class ConfirmDialogComponent implements AfterViewInit {
  @Input({ required: true }) title!: string;
  @Input() message: string | null = null;
  @Input() confirmLabel = 'Conferma';
  @Input() busyLabel = 'Attendere…';
  /** true: bottone rosso (azione distruttiva/irreversibile). */
  @Input() danger = false;
  /** true: mostra un campo di testo, il cui valore arriva con (confirmed). */
  @Input() withReason = false;
  @Input() reasonLabel = 'Motivo';
  @Input() reasonRequired = false;
  @Input() busy = false;
  @Input() errorMessage: string | null = null;

  @Output() readonly confirmed = new EventEmitter<string>();
  @Output() readonly closed = new EventEmitter<void>();

  @ViewChild('primaryAction') private primaryAction?: ElementRef<HTMLElement>;
  @ViewChild('reasonInput') private reasonInput?: ElementRef<HTMLInputElement>;

  ngAfterViewInit(): void {
    (this.reasonInput ?? this.primaryAction)?.nativeElement.focus();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (!this.busy) {
      this.closed.emit();
    }
  }

  onBackdropClick(): void {
    if (!this.busy) {
      this.closed.emit();
    }
  }

  confirm(): void {
    const reason = this.reasonInput?.nativeElement.value?.trim() ?? '';
    if (this.withReason && this.reasonRequired && !reason) {
      return;
    }
    this.confirmed.emit(reason);
  }
}
