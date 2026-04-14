import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatIconModule,
  ],
  templateUrl: './login.component.html',
  styles: [
    `
      .login-container {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        padding: 20px;
      }

      .login-card {
        width: 100%;
        max-width: 420px;
        padding: 30px;
        box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
        border-radius: 16px;
      }

      .card-title {
        display: flex;
        align-items: center;
        gap: 12px;
        justify-content: center;
        margin-bottom: 24px;
        font-size: 1.4em;
        font-weight: 500;
      }

      .title-icon {
        color: #3f51b5;
        font-size: 1.8em;
      }

      .full-width {
        width: 100%;
        margin-bottom: 20px;
      }

      .form-actions {
        margin: 24px 0;
      }

      .login-button {
        height: 48px;
        font-size: 1.1em;
        font-weight: 500;
        border-radius: 8px;
      }

      .error-message {
        background-color: #ffebee;
        border: 1px solid #f8bbd9;
        color: #c62828;
        padding: 16px;
        border-radius: 8px;
        margin: 16px 0;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 0.9em;
      }

      .register-link {
        text-align: center;
        margin-top: 24px;
        padding-top: 20px;
        border-top: 1px solid #e0e0e0;
      }

      .register-link p {
        margin: 0;
        color: #666;
        font-size: 0.95em;
      }

      .register-link a {
        margin-left: 8px;
        font-weight: 500;
      }

      .inline-spinner {
        margin-right: 8px;
      }

      mat-card-header {
        margin-bottom: 20px;
      }

      mat-form-field {
        margin-bottom: 12px;
      }
    `,
  ],
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private router = inject(Router);

  protected authService = inject(AuthService);
  protected hidePassword = true;

  protected loginForm = this.fb.group({
    login: ['', [Validators.required]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  constructor() {
    // Redirect if already authenticated
    if (this.authService.isAuthenticated()) {
      this.router.navigate(['/dashboard']);
    }
  }

  protected onSubmit(): void {
    if (this.loginForm.valid) {
      const { login, password } = this.loginForm.value;

      this.authService.login({ login: login!, password: password! }).subscribe({
        next: (success) => {
          if (success) {
            this.router.navigate(['/dashboard']);
          }
        },
        error: (error) => {
          console.error('Login error:', error);
        },
      });
    }
  }
}
