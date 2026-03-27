import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { environment } from './environment';
import { SessionService } from './session.service';

let refreshInFlight: Promise<{ accessToken: string; refreshToken: string } | null> | null = null;

async function refreshTokens(refreshToken: string): Promise<{ accessToken: string; refreshToken: string } | null> {
  const authApiUrl = String(environment.authApiUrl || '').replace(/\/$/, '');
  if (!authApiUrl) return null;

  const response = await fetch(`${authApiUrl}/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) return null;
  const payload = (await response.json()) as any;

  const accessToken = String(payload?.accessToken || '').trim();
  const nextRefresh = String(payload?.refreshToken || '').trim();

  if (!accessToken || !nextRefresh) return null;
  return { accessToken, refreshToken: nextRefresh };
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const sessionService = inject(SessionService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      const isUnauthorized = error?.status === 401;
      const isRefreshCall = req.url.includes('/auth/refresh');
      const current = sessionService.session;

      if (!isUnauthorized || isRefreshCall || !current?.refreshToken) {
        if (isUnauthorized) {
          sessionService.clear();
          window.location.href = environment.authPortalUrl;
        }
        return throwError(() => error);
      }

      if (!refreshInFlight) {
        refreshInFlight = refreshTokens(current.refreshToken).finally(() => {
          refreshInFlight = null;
        });
      }

      return from(refreshInFlight).pipe(
        switchMap((tokens) => {
          if (!tokens) {
            sessionService.clear();
            window.location.href = environment.authPortalUrl;
            return throwError(() => error);
          }

          sessionService.saveTokens(tokens.accessToken, tokens.refreshToken);

          const retried = req.clone({
            setHeaders: {
              Authorization: `Bearer ${tokens.accessToken}`,
            },
          });

          return next(retried);
        }),
        catchError(() => {
          sessionService.clear();
          window.location.href = environment.authPortalUrl;
          return throwError(() => error);
        }),
      );
    }),
  );
};
