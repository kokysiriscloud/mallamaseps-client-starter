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
  get session(): Session | null {
    return this.load();
  }

  private load(): Session | null {
    const raw = localStorage.getItem('siriscloud_auth_session');
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw) as any;
      const token = String(parsed?.token || parsed?.accessToken || parsed?.access_token || '').trim();

      if (!token) return null;

      return {
        token,
        user: parsed?.user || { email: '', role: 'user' },
        tenant: parsed?.tenant || { name: '', domain: '' },
      } as Session;
    } catch {
      return null;
    }
  }
}
