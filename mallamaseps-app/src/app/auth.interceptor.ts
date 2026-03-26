import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error?.status === 401) {
        localStorage.removeItem('siriscloud_auth_session');
        window.location.href = 'http://localhost:4200/login';
      }

      return throwError(() => error);
    }),
  );
};
