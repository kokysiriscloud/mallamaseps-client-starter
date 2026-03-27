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
  refreshToken: string;
  user: SessionUser;
  tenant: SessionTenant;
}

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly storageKey = 'siriscloud_auth_session';

  get session(): Session | null {
    return this.load();
  }

  clear(): void {
    localStorage.removeItem(this.storageKey);
  }

  saveTokens(accessToken: string, refreshToken: string): Session | null {
    const current = this.load();
    if (!current) return null;

    const next = {
      ...current,
      token: String(accessToken || '').trim(),
      refreshToken: String(refreshToken || '').trim(),
      accessToken: String(accessToken || '').trim(),
    };

    localStorage.setItem(this.storageKey, JSON.stringify(next));
    return this.load();
  }

  private load(): Session | null {
    const raw = localStorage.getItem(this.storageKey);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw) as any;
      const token = String(parsed?.token || parsed?.accessToken || parsed?.access_token || '').trim();
      const refreshToken = String(parsed?.refreshToken || parsed?.refresh_token || '').trim();

      if (!token) return null;

      return {
        token,
        refreshToken,
        user: parsed?.user || { email: '', role: 'user' },
        tenant: parsed?.tenant || { name: '', domain: '' },
      } as Session;
    } catch {
      return null;
    }
  }
}
