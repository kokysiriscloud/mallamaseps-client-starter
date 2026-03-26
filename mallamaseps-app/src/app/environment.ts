declare global {
  interface Window {
    __APP_CONFIG__?: {
      authPortalUrl?: string;
    };
  }
}

const runtimeConfig = window.__APP_CONFIG__ || {};

export const environment = {
  authPortalUrl: runtimeConfig.authPortalUrl || 'http://localhost:4200/login',
};
