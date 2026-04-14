import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { AdminService, AdminUser, ReceiptSummary } from '../../services/admin.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatToolbarModule,
    MatTableModule,
    MatExpansionModule,
    MatChipsModule,
    MatDividerModule,
    MatDialogModule,
    MatTooltipModule,
  ],
  templateUrl: './admin-dashboard.component.html',
  styles: [
    `
      .admin-container {
        min-height: 100vh;
        background: #f5f5f5;
      }

      .page-header {
        position: sticky;
        top: 0;
        z-index: 100;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      }

      .page-header .header-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 1.25rem;
        font-weight: 500;
        margin-left: 8px;
      }

      .page-header .spacer {
        flex: 1;
      }

      .page-header .user-menu-btn {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .page-header .welcome-text {
        max-width: 150px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .page-header .avatar-icon {
        font-size: 28px;
        width: 28px;
        height: 28px;
      }

      .page-header .arrow-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }

      .stats-container {
        display: flex;
        gap: 20px;
        margin: 20px;
      }

      .stat-card {
        min-width: 200px;
      }

      .stat-content {
        display: flex;
        align-items: center;
        gap: 16px;
      }

      .stat-info {
        display: flex;
        flex-direction: column;
      }

      .stat-number {
        font-size: 2rem;
        font-weight: bold;
        line-height: 1;
      }

      .stat-label {
        color: rgba(0, 0, 0, 0.6);
        font-size: 0.875rem;
      }

      .loading-container,
      .error-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 40px;
        text-align: center;
      }

      .error-container mat-icon {
        font-size: 48px;
        width: 48px;
        height: 48px;
        margin-bottom: 16px;
      }

      .users-section {
        margin-top: 20px;
      }

      .card-actions {
        margin-left: auto;
      }

      .user-title {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .username {
        font-weight: 500;
      }

      .admin-chip {
        font-size: 0.75rem;
        font-weight: bold;
      }

      .user-details {
        padding: 16px 0;
      }

      .user-info {
        margin-bottom: 16px;
      }

      .user-info p {
        margin: 8px 0;
      }

      .user-actions {
        padding: 16px 0;
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
      }

      .delete-button[disabled] {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .receipts-section {
        margin-top: 16px;
        padding-top: 16px;
        border-top: 1px solid #e0e0e0;
      }

      .receipts-section h4 {
        margin-bottom: 16px;
        color: rgba(0, 0, 0, 0.7);
      }

      .no-receipts {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 20px;
        color: rgba(0, 0, 0, 0.5);
      }

      .no-receipts mat-icon {
        font-size: 32px;
        width: 32px;
        height: 32px;
        margin-bottom: 8px;
      }

      .receipt-item {
        margin-bottom: 8px;
      }

      .receipt-card {
        background: #f5f5f5;
      }

      .receipt-info {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .receipt-amount {
        font-weight: bold;
        color: #2e7d32;
      }
    `,
  ],
})
export class AdminDashboardComponent implements OnInit {
  private adminService = inject(AdminService);
  protected authService = inject(AuthService);
  private router = inject(Router);
  private dialog = inject(MatDialog);

  users = signal<AdminUser[]>([]);
  userReceipts = signal<{ [userId: string]: ReceiptSummary[] }>({});
  isLoading = signal(false);
  error = signal<string | null>(null);

  ngOnInit() {
    // Check if user is admin
    if (!this.authService.isAdmin()) {
      this.router.navigate(['/dashboard']);
      return;
    }

    this.loadUsers();
  }

  loadUsers() {
    this.isLoading.set(true);
    this.error.set(null);

    this.adminService.getAllUsers().subscribe({
      next: (users) => {
        this.users.set(users);
        this.isLoading.set(false);
        console.log('Loaded users:', users);
      },
      error: (error) => {
        this.error.set('Fehler beim Laden der Benutzerdaten: ' + error.message);
        this.isLoading.set(false);
        console.error('Error loading users:', error);
      },
    });
  }

  loadUserReceipts(userId: string) {
    this.adminService.getUserReceipts(userId).subscribe({
      next: (receipts) => {
        this.userReceipts.update((current) => ({
          ...current,
          [userId]: receipts,
        }));
        console.log(`Loaded receipts for user ${userId}:`, receipts);
      },
      error: (error) => {
        console.error(`Error loading receipts for user ${userId}:`, error);
        // For now, set empty array on error
        this.userReceipts.update((current) => ({
          ...current,
          [userId]: [],
        }));
      },
    });
  }

  getUserReceiptCount(userId: string): number {
    return this.userReceipts()[userId]?.length || 0;
  }

  getTotalReceiptsCount(): number {
    return Object.values(this.userReceipts()).reduce((total, receipts) => {
      return total + (receipts ? receipts.length : 0);
    }, 0);
  }

  getTotalAmount(): string {
    const total = Object.values(this.userReceipts()).reduce((sum, receipts) => {
      if (!receipts) return sum;
      return (
        sum +
        receipts.reduce((receiptSum, receipt) => {
          const amount =
            typeof receipt.total_amount === 'number'
              ? receipt.total_amount
              : parseFloat(receipt.total_amount || '0');
          return receiptSum + amount;
        }, 0)
      );
    }, 0);
    return total.toFixed(2);
  }

  getAdminCount(): number {
    return this.users().filter((user) => user.username === 'admin').length;
  }

  formatDate(dateString?: string): string {
    if (!dateString) return 'Unbekannt';

    const date = new Date(dateString);
    return date.toLocaleDateString('de-DE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  trackByUserId(index: number, user: AdminUser): string {
    return user.id;
  }

  confirmDeleteUser(user: AdminUser) {
    if (user.username === 'admin') {
      return; // Admin cannot be deleted
    }

    const confirmed = confirm(
      `Sind Sie sicher, dass Sie den Benutzer "${
        user.username || user.email
      }" löschen möchten?\n\nDies wird auch alle zugehörigen Kassenbons und Artikel unwiderruflich löschen.`
    );

    if (confirmed) {
      this.deleteUser(user);
    }
  }

  deleteUser(user: AdminUser) {
    this.adminService.deleteUser(user.id).subscribe({
      next: () => {
        // Remove user from the list
        this.users.update((users) => users.filter((u) => u.id !== user.id));

        // Remove user receipts from cache
        this.userReceipts.update((receipts) => {
          const updated = { ...receipts };
          delete updated[user.id];
          return updated;
        });

        console.log('User deleted successfully:', user.username || user.email);
      },
      error: (error) => {
        console.error('Error deleting user:', error);
        alert('Fehler beim Löschen des Benutzers: ' + (error.error?.message || error.message));
      },
    });
  }

  goBack() {
    this.router.navigate(['/dashboard']);
  }

  goToReceiptManager(): void {
    this.router.navigate(['/receipts']);
  }

  goToBudget(): void {
    this.router.navigate(['/budget']);
  }

  goToStatistics(): void {
    this.router.navigate(['/statistics']);
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
