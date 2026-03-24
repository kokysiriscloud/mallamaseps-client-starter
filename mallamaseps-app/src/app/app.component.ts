import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

type MenuKey = 'home' | 'usage' | 'api-keys' | 'billing';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  session = this.getSession();
  active: MenuKey = 'home';

  select(key: MenuKey): void {
    this.active = key;
  }

  private getSession(): any {
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
