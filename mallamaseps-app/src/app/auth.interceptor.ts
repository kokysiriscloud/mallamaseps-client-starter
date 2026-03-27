import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { environment } from './environment';
import { SessionService } from './session.service';

let refreshInFlight: Promise<{ accessToken: string; refreshToken: string } | null> | null = null;

async function refreshTokens(refreshToken: string): Promise<{ accessToken: string; refreshToken: string } | null> {
  const authApiUrl = String(environment.authApiUrl || '').replace(/\/$/, '');
  if (!authApiUrl) return null;

  try {
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
  } catch {
    return null;
  }
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const sessionService = inject(SessionService);
  const current = sessionService.session;
  const isRefreshCall = req.url.includes('/auth/refresh');

  if (!isRefreshCall && current?.refreshToken) {
    if (!refreshInFlight) {
      refreshInFlight = refreshTokens(current.refreshToken).finally(() => {
        refreshInFlight = null;
      });
    }

    return from(refreshInFlight).pipe(
      switchMap((tokens) => {
        // Best-effort: si refresh falla, continuar con token actual y dejar que API decida.
        const tokenToUse = tokens?.accessToken || current.token;

        if (tokens?.accessToken && tokens?.refreshToken) {
          sessionService.saveTokens(tokens.accessToken, tokens.refreshToken);
        }

        const authReq = req.clone({
          setHeaders: {
            Authorization: `Bearer ${tokenToUse}`,
          },
        });

        return next(authReq).pipe(
          catchError((error: HttpErrorResponse) => {
            if (error?.status === 401) {
              sessionService.clear();
              window.location.href = environment.authPortalUrl;
            }
            return throwError(() => error);
          }),
        );
      }),
      catchError(() => {
        const fallbackReq = req.clone({
          setHeaders: {
            Authorization: `Bearer ${current.token}`,
          },
        });
        return next(fallbackReq).pipe(
          catchError((error: HttpErrorResponse) => {
            if (error?.status === 401) {
              sessionService.clear();
              window.location.href = environment.authPortalUrl;
            }
            return throwError(() => error);
          }),
        );
      }),
    );
  }

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error?.status === 401) {
        sessionService.clear();
        window.location.href = environment.authPortalUrl;
      }

      return throwError(() => error);
    }),
  );
};
