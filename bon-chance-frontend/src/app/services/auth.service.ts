import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';

export interface LoginRequest {
  login: string; // Can be email or username
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  username: string; // Now required
}

export interface AuthResponse {
  token: string;
  user?: {
    id: string;
    email: string;
    username?: string;
  };
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);

  private readonly API_BASE_URL = '/api/v1';
  private readonly TOKEN_KEY = 'bon-chance-auth-token';

  private currentUserSubject = new BehaviorSubject<AuthResponse['user'] | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  private readonly _isAuthenticated = signal(false);
  private readonly _isLoading = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _currentUser = signal<AuthResponse['user'] | null>(null);

  readonly isAuthenticated = computed(() => this._isAuthenticated());
  readonly isLoading = computed(() => this._isLoading());
  readonly error = computed(() => this._error());
  readonly currentUser = computed(() => this._currentUser());
  readonly isAdmin = computed(() => this._currentUser()?.username === 'admin');

  constructor() {
    // Sync signal with subject
    this.currentUserSubject.subscribe((user) => this._currentUser.set(user));
    this.initializeAuth();
  }

  private initializeAuth(): void {
    const token = this.getToken();
    if (token) {
      // Try to extract user info from token
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        console.log('[AuthService] Token payload:', payload);

        if (payload.exp * 1000 > Date.now()) {
          // Token is valid
          this._isAuthenticated.set(true);

          // Extract user info from token if available
          if (payload.user_id || payload.sub) {
            const user = {
              id: payload.user_id || payload.sub,
              email: payload.email || '',
              username: payload.username || payload.name || '',
            };
            console.log('[AuthService] Setting user from token:', user);
            this.currentUserSubject.next(user);
          }
        } else {
          // Token expired
          console.log('[AuthService] Token expired');
          this.logout();
        }
      } catch (error) {
        console.error('[AuthService] Failed to parse token:', error);
        this.logout();
      }
    }
  }

  login(credentials: LoginRequest): Observable<boolean> {
    this._isLoading.set(true);
    this._error.set(null);

    return this.http.post<AuthResponse>(`${this.API_BASE_URL}/user/login`, credentials).pipe(
      tap((response) => {
        console.log('[AuthService] Login response:', response);

        // Clear old user data first
        this.currentUserSubject.next(null);

        this.setToken(response.token);
        if (response.user) {
          console.log('[AuthService] Setting user from login:', response.user);
          this.currentUserSubject.next(response.user);
        }
        this._isAuthenticated.set(true);
        this._isLoading.set(false);
      }),
      map(() => true),
      catchError((error) => {
        this._error.set(error.error?.message || 'Login fehlgeschlagen');
        this._isLoading.set(false);
        this._isAuthenticated.set(false);
        return of(false);
      }),
    );
  }

  register(userData: RegisterRequest): Observable<boolean> {
    this._isLoading.set(true);
    this._error.set(null);

    return this.http.post<AuthResponse>(`${this.API_BASE_URL}/user/register`, userData).pipe(
      tap((response) => {
        // Clear old user data first
        this.currentUserSubject.next(null);

        this.setToken(response.token);
        if (response.user) {
          this.currentUserSubject.next(response.user);
        }
        this._isAuthenticated.set(true);
        this._isLoading.set(false);
      }),
      map(() => true),
      catchError((error) => {
        this._error.set(error.error?.message || 'Registrierung fehlgeschlagen');
        this._isLoading.set(false);
        this._isAuthenticated.set(false);
        return of(false);
      }),
    );
  }

  logout(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    this.currentUserSubject.next(null);
    this._isAuthenticated.set(false);
    this._error.set(null);
    this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  private setToken(token: string): void {
    localStorage.setItem(this.TOKEN_KEY, token);
  }

  private validateToken(): Observable<boolean> {
    const token = this.getToken();
    if (!token) {
      return of(false);
    }

    // Simple token validation - check if it's expired
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const isExpired = payload.exp * 1000 < Date.now();
      return of(!isExpired);
    } catch {
      return of(false);
    }
  }

  clearError(): void {
    this._error.set(null);
  }
}
