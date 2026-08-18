import { CommonModule } from '@angular/common';
import { Component, HostListener } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, CommonModule],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss'
})
export class NavbarComponent {
  facebookPonzanoUrl = 'https://www.facebook.com/profile.php?id=100093541022280';
  facebookGeneralUrl = 'https://www.facebook.com/share/1P2AEUbsr8/?mibextid=wwXIfr';
  instagramUrl = 'https://www.instagram.com/asdcinofila_lalunanuovaponzano?igsh=aDFnY3dobXVvZXA5&utm_source=ig_contact_invite';
  fbDropdownOpen = false;

  toggleFbDropdown(event: Event) {
    event.stopPropagation();
    this.fbDropdownOpen = !this.fbDropdownOpen;
  }

  closeFbDropdown() {
    this.fbDropdownOpen = false;
  }

  @HostListener('document:click')
  onDocumentClick() {
    this.fbDropdownOpen = false;
  }
}