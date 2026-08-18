import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-cookie-banner',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cookie-banner.component.html',
  styleUrl: './cookie-banner.component.scss'
})
export class CookieBannerComponent implements OnInit {
  visible = false;

  ngOnInit() {
    const accepted = localStorage.getItem('cookie-accepted');
    if (!accepted) {
      this.visible = true;
    }
  }

  accept() {
    localStorage.setItem('cookie-accepted', 'true');
    this.visible = false;
  }

  reject() {
    localStorage.setItem('cookie-accepted', 'false');
    this.visible = false;
  }
}