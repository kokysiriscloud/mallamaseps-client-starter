declare global {
  interface Window {
    __APP_CONFIG__?: {
      authPortalUrl?: string;
      authApiUrl?: string;
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

const authPortalUrl = runtimeConfig.authPortalUrl || 'https://auth.siriscloud.com.co/login';

export const environment = {
  authPortalUrl,
  authApiUrl: resolveAuthApiUrl(runtimeConfig.authApiUrl),
};
