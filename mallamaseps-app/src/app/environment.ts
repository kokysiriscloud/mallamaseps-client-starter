declare global {
  interface Window {
    __APP_CONFIG__?: {
      authPortalUrl?: string;
      authApiUrl?: string;
      mallamasepsApiUrl?: string;
    };
  }
}

const runtimeConfig = window.__APP_CONFIG__ || {};

function resolveAuthApiUrl(explicit?: string): string {
  const fromRuntime = String(explicit || '').trim();
  if (fromRuntime) return fromRuntime;

  // Default explícito al servicio auth API para evitar apuntar al portal por error.
  return 'https://api-auth.siriscloud.com.co/api/auth';
  // return 'http://localhost:3000/api/auth';
}

function resolveMallamasepsApiUrl(explicit?: string): string {
  const fromRuntime = String(explicit || '').trim();
  if (fromRuntime) return fromRuntime.replace(/\/$/, '');

  // En local apunta al API local; en cualquier otro host, al desplegado.
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return 'http://localhost:3100/api';

  return 'https://api-mallamaseps.siriscloud.com.co/api';
}

const authPortalUrl = runtimeConfig.authPortalUrl || 'https://auth.siriscloud.com.co/login';

export const environment = {
  authPortalUrl,
  authApiUrl: resolveAuthApiUrl(runtimeConfig.authApiUrl),
  mallamasepsApiUrl: resolveMallamasepsApiUrl(runtimeConfig.mallamasepsApiUrl),
};
