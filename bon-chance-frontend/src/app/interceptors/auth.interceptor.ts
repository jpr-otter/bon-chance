import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const token = authService.getToken();

  if (token) {
    // Decode token to check user_id
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      console.log('[AuthInterceptor] Request to:', req.url);
      console.log('[AuthInterceptor] Token payload:', { sub: payload.sub, exp: payload.exp });
    } catch (e) {
      console.error('[AuthInterceptor] Failed to decode token:', e);
    }

    req = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`,
      },
    });
  } else {
    console.log('[AuthInterceptor] No token found for request:', req.url);
  }

  return next(req);
};
