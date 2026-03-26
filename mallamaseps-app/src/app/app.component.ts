import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet, Router } from '@angular/router';
import { SessionService } from './session.service';
import { environment } from './environment';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './app.component.html',
})
export class AppComponent {
  session = inject(SessionService).session;
  authPortalUrl = environment.authPortalUrl;
  private router = inject(Router);

  constructor() {
    this.bootstrapSession();
    this.session = this.loadSessionFromStorage();

    if (!this.session) {
      window.location.href = this.authPortalUrl;
    }
  }

  private bootstrapSession(): void {
    const query = new URLSearchParams(window.location.search);
    const incomingSession = query.get('session');

    if (incomingSession) {
      try {
        const decoded = atob(decodeURIComponent(incomingSession));
        localStorage.setItem('siriscloud_auth_session', decoded);
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch {
        // no-op
      }
    }
  }

  private loadSessionFromStorage(): any {
    const raw = localStorage.getItem('siriscloud_auth_session');
    if (!raw) return null;

    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  get pageTitle(): string {
    const url = this.router.url;
    if (url.includes('usage')) return 'Usage';
    if (url.includes('api-keys')) return 'API Keys';
    if (url.includes('billing')) return 'Billing';
    return 'Home';
  }

  logout(): void {
    localStorage.removeItem('siriscloud_auth_session');
    window.location.href = environment.authPortalUrl;
  }
}
