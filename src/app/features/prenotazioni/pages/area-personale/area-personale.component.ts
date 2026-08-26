import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../../core/auth/auth.service';

@Component({
  selector: 'app-area-personale',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './area-personale.component.html',
  styleUrl: './area-personale.component.scss',
})
export class AreaPersonaleComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly session = this.auth.session;

  async logout(): Promise<void> {
    await this.auth.signOut();
    this.router.navigateByUrl('/prenotazioni/login');
  }
}
