import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

type MenuKey = 'home' | 'usage' | 'api-keys' | 'billing';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './app.component.html',
})
export class AppComponent {
  active: MenuKey = 'home';
  session = this.bootstrapSession();

  select(key: MenuKey): void {
    this.active = key;
  }

  private bootstrapSession(): any {
    const query = new URLSearchParams(window.location.search);
    const incomingSession = query.get('session');

    if (incomingSession) {
      try {
        const decoded = atob(decodeURIComponent(incomingSession));
        localStorage.setItem('siriscloud_auth_session', decoded);
        // Limpiar query param sensible
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch {
        // no-op
      }
    }

    const raw = localStorage.getItem('siriscloud_auth_session');
    if (!raw) return null;

    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  logout(): void {
    localStorage.removeItem('siriscloud_auth_session');
    window.location.href = 'http://localhost:4200/login';
  }
}
