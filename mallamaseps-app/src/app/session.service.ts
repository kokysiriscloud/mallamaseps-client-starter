import { Injectable } from '@angular/core';

export interface SessionUser {
  email: string;
  role: string;
}

export interface SessionTenant {
  name: string;
  domain: string;
}

export interface Session {
  token: string;
  user: SessionUser;
  tenant: SessionTenant;
}

@Injectable({ providedIn: 'root' })
export class SessionService {
  readonly session: Session | null = this.load();

  private load(): Session | null {
    const raw = localStorage.getItem('siriscloud_auth_session');
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Session;
    } catch {
      return null;
    }
  }
}
