import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { BudgetService } from '../../services/budget.service';
import { LoggerService } from '../../services/logger.service';
import { ReceiptBackendService } from '../../services/receipt-backend.service';
import { ReceiptDetailComponent } from '../receipt-detail/receipt-detail.component';
import { DashboardChartsComponent } from './dashboard-charts.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatToolbarModule,
    MatMenuModule,
    MatChipsModule,
    MatDialogModule,
    MatDividerModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    DashboardChartsComponent,
  ],
  templateUrl: './dashboard.component.html',
  styles: [
    `
      .dashboard-container {
        min-height: 100vh;
        background-color: #f5f5f5;
      }

      .dashboard-header {
        position: sticky;
        top: 0;
        z-index: 100;
      }

      .header-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 1.2em;
      }

      .spacer {
        flex: 1 1 auto;
      }

      .user-menu {
        display: flex;
        align-items: center;
      }

      .user-menu-btn {
        color: white;
        display: flex;
        align-items: center;
        padding: 0 8px 0 16px;
        height: 48px;
        border-radius: 24px;
        background: rgba(255, 255, 255, 0.1);
        transition: background 0.2s;
      }

      .user-menu-btn:hover {
        background: rgba(255, 255, 255, 0.2);
      }

      .welcome-text {
        font-size: 0.95em;
        margin-right: 8px;
        font-weight: 500;
      }

      .avatar-icon {
        margin-right: 4px;
      }

      .arrow-icon {
        font-size: 20px;
        height: 20px;
        width: 20px;
        opacity: 0.8;
      }

      .stats-container {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 16px;
        padding: 16px 2%;
        max-width: 100%;
      }

      .stat-card {
        transition: transform 0.2s ease-in-out;
      }

      .stat-card:hover {
        transform: translateY(-2px);
      }

      .stat-content {
        display: flex;
        align-items: center;
        gap: 16px;
      }

      .stat-content mat-icon {
        font-size: 2em;
        height: 2em;
        width: 2em;
      }

      .stat-number {
        font-size: 1.8em;
        font-weight: bold;
        color: #333;
      }

      .stat-label {
        font-size: 0.9em;
        color: #666;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      /* Budget Section Styles */
      .budget-section {
        padding: 0 2% 20px;
        max-width: 100%;
      }

      .budget-overview-card {
        max-width: 600px;
      }

      .budget-overview-card mat-card-header {
        margin-bottom: 16px;
      }

      .budget-overview-card mat-icon[mat-card-avatar] {
        background: #3f51b5;
        color: white;
        padding: 8px;
        border-radius: 50%;
        font-size: 24px;
        width: 40px;
        height: 40px;
      }

      .total-budget-section {
        margin-bottom: 20px;
      }

      .budget-summary-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
      }

      .budget-label {
        font-weight: 500;
        color: #333;
      }

      .budget-value {
        font-weight: 600;
        color: #666;
      }

      .budget-percentage {
        text-align: right;
        font-size: 0.85em;
        color: #666;
        margin-top: 4px;
      }

      .critical-budgets {
        border-top: 1px solid #eee;
        padding-top: 16px;
      }

      .critical-label {
        font-size: 0.9em;
        color: #666;
        margin-bottom: 12px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .budget-item {
        margin-bottom: 12px;
      }

      .budget-item-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 4px;
      }

      .category-dot {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        flex-shrink: 0;
      }

      .category-name {
        flex: 1;
        font-weight: 500;
      }

      .category-amount {
        font-size: 0.85em;
        color: #666;
      }

      .charts-section {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
        gap: 16px;
        padding: 0 2% 20px;
        max-width: 100%;
      }

      .chart-card {
        height: 500px;
        display: flex;
        flex-direction: column;
      }

      .chart-header-with-controls {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding-right: 16px;
      }

      .chart-wrapper {
        height: 420px;
        width: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
        overflow: hidden;
      }

      .receipts-section {
        padding: 0 2% 20px;
        max-width: 100%;
      }

      .section-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
        padding: 0 8px;
      }

      .section-header h2 {
        margin: 0;
        color: #333;
      }

      .loading-container,
      .error-container,
      .empty-state,
      .no-results-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 40px;
        text-align: center;
      }

      .search-filter-section {
        margin-bottom: 24px;
        padding: 16px;
        background: #f8f9fa;
        border-radius: 8px;
      }

      .search-row {
        display: flex;
        gap: 16px;
        align-items: center;
        flex-wrap: wrap;
      }

      .search-field {
        flex: 2;
        min-width: 250px;
      }

      .filter-field {
        flex: 1;
        min-width: 150px;
      }

      .results-summary {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 16px;
        padding-top: 16px;
        border-top: 1px solid #e0e0e0;
        color: #666;
        font-size: 0.9em;
      }

      .clear-filters {
        color: #1976d2 !important;
      }

      .no-results-state {
        background: white;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        margin-top: 20px;
      }

      .no-results-state mat-icon {
        font-size: 64px;
        height: 64px;
        width: 64px;
        color: #9e9e9e;
        margin-bottom: 24px;
      }

      .no-results-state h3 {
        margin: 0 0 8px 0;
        font-size: 1.2em;
        font-weight: 500;
      }

      .no-results-state p {
        margin: 0 0 24px 0;
        color: #666;
        max-width: 400px;
      }

      .empty-state mat-icon {
        font-size: 4em;
        height: 4em;
        width: 4em;
        color: #ccc;
        margin-bottom: 16px;
      }

      .expand-collapse-bar {
        display: flex;
        justify-content: flex-end;
        padding: 8px 0;
        margin-bottom: 8px;
      }

      .expand-collapse-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        color: #666;
      }

      .expand-collapse-btn:hover {
        color: #333;
        background: rgba(0, 0, 0, 0.04);
      }

      .receipts-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: 16px;
      }

      .receipts-groups {
        display: flex;
        flex-direction: column;
        gap: 24px;
      }

      .receipt-group {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .group-header {
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        user-select: none;
        padding: 8px 0;
        border-bottom: 1px solid rgba(0,0,0,0.08);
      }

      .group-header:hover h3 {
        color: #3f51b5;
      }

      .group-header h3 {
        margin: 0;
        font-size: 1.1rem;
        font-weight: 500;
        color: #444;
        transition: color 0.2s ease;
      }

      .group-count {
        color: #888;
        font-size: 0.9rem;
      }

      .receipt-card {
        transition: transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out;
      }

      .receipt-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
      }

      .receipt-details {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
      }

      .total-amount {
        font-size: 1.4em;
        font-weight: bold;
        color: #2e7d32;
      }

      .item-count {
        font-size: 0.9em;
        color: #666;
      }

      .fab-button {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 1000;
      }

      mat-chip {
        font-size: 0.8em;
      }

      @media (max-width: 768px) {
        .stats-container {
          grid-template-columns: 1fr;
          padding: 12px;
        }

        .receipts-section {
          padding: 0 12px 16px;
        }

        .receipts-grid {
          grid-template-columns: 1fr;
        }

        .section-header {
          flex-direction: column;
          align-items: stretch;
          gap: 12px;
        }
      }
    `,
  ],
})
export class DashboardComponent implements OnInit {
  protected authService = inject(AuthService);
  protected receiptService = inject(ReceiptBackendService);
  protected budgetService = inject(BudgetService);
  private router = inject(Router);
  private logger = inject(LoggerService);
  private dialog = inject(MatDialog);

  // Search and Filter State
  searchTerm = signal('');
  sortBy = signal<'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc' | 'store'>('date-desc');
  statusFilter = signal<'' | 'DONE' | 'PENDING' | 'PROCESSING' | 'NEEDS_REVIEW'>('');

  // Grouping State
  collapsedGroups = signal<Set<string>>(new Set());
  allExpanded = signal<boolean>(true);

  protected receipts = computed(() => this.receiptService.receipts());

  // Filtered and sorted receipts
  protected filteredReceipts = computed(() => {
    let filtered = this.receipts();
    this.logger.log('[Dashboard] filteredReceipts computed - raw receipts: ' + filtered.length);
    this.logger.log('[Dashboard] searchTerm: ' + this.searchTerm());
    this.logger.log('[Dashboard] statusFilter: ' + this.statusFilter());

    // Apply search filter
    if (this.searchTerm().trim()) {
      const term = this.searchTerm().toLowerCase().trim();
      filtered = filtered.filter(
        (receipt) =>
          receipt.store?.name?.toLowerCase().includes(term) ||
          receipt.items?.some((item) => item.descriptionRaw.toLowerCase().includes(term))
      );
      this.logger.log('[Dashboard] after search filter: ' + filtered.length);
    }

    // Apply status filter
    if (this.statusFilter()) {
      filtered = filtered.filter((receipt) => {
        const receiptStatus = receipt.status || 'PENDING';
        return receiptStatus === this.statusFilter();
      });
      this.logger.log('[Dashboard] after status filter: ' + filtered.length);
    }

    // Apply sorting
    const sorted = filtered.sort((a, b) => {
      switch (this.sortBy()) {
        case 'date-desc':
          return new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime();
        case 'date-asc':
          return new Date(a.purchaseDate).getTime() - new Date(b.purchaseDate).getTime();
        case 'amount-desc':
          return b.totalAmount - a.totalAmount;
        case 'amount-asc':
          return a.totalAmount - b.totalAmount;
        case 'store':
          return (a.store?.name || '').localeCompare(b.store?.name || '');
        default:
          return 0;
      }
    });

    this.logger.log('[Dashboard] final filtered receipts: ' + sorted.length);
    return sorted;
  });

  protected groupedReceipts = computed(() => {
    const receipts = this.filteredReceipts();
    const groups = new Map<string, { label: string; date: Date; receipts: any[] }>();

    receipts.forEach((receipt) => {
      const date = new Date(receipt.purchaseDate);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      const label = date.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

      if (!groups.has(key)) {
        groups.set(key, { label, date, receipts: [] });
      }
      groups.get(key)!.receipts.push(receipt);
    });

    // Sort groups by date descending
    return Array.from(groups.values()).sort((a, b) => b.date.getTime() - a.date.getTime());
  });

  protected totalReceipts = computed(() => this.receipts().length);
  protected totalSpent = computed(() =>
    this.receipts()
      .reduce((total, receipt) => total + receipt.totalAmount, 0)
      .toFixed(2)
  );
  protected averageBasket = computed(() => {
    const receipts = this.receipts();
    if (receipts.length === 0) return '0.00';
    return (
      receipts.reduce((total, receipt) => total + receipt.totalAmount, 0) / receipts.length
    ).toFixed(2);
  });

  // Budget computed properties
  protected budgets = this.budgetService.budgets;
  protected spendingSummary = this.budgetService.spendingSummary;
  
  protected totalBudget = computed(() => 
    this.budgets().reduce((sum, b) => sum + b.monthlyLimit, 0)
  );
  
  protected totalBudgetSpent = computed(() => 
    this.spendingSummary().reduce((sum, s) => sum + s.totalSpent, 0)
  );
  
  protected budgetPercentage = computed(() => {
    const total = this.totalBudget();
    if (total <= 0) return 0;
    return Math.min((this.totalBudgetSpent() / total) * 100, 100);
  });
  
  protected budgetProgressColor = computed(() => {
    const pct = this.budgetPercentage();
    if (pct >= 90) return 'warn';
    if (pct >= 70) return 'accent';
    return 'primary';
  });

  // Top 3 critical budgets (highest percentage used)
  protected criticalBudgets = computed(() => {
    const budgetsWithSpending = this.budgets().map(b => {
      const spending = this.spendingSummary().find(s => s.categoryName === b.categoryName);
      const spent = spending?.totalSpent ?? b.currentSpent;
      const percentage = b.monthlyLimit > 0 ? (spent / b.monthlyLimit) * 100 : 0;
      return {
        categoryName: b.categoryName,
        spent,
        limit: b.monthlyLimit,
        percentage,
        color: this.budgetService.getCategoryColor(b.categoryName)
      };
    });
    return budgetsWithSpending
      .filter(b => b.percentage > 0)
      .sort((a, b) => b.percentage - a.percentage)
      .slice(0, 3);
  });

  ngOnInit(): void {
    this.logger.log('[Dashboard] ngOnInit');
    this.loadReceipts();
    this.loadBudgets();
  }

  loadBudgets(): void {
    this.budgetService.getBudgets().subscribe();
    this.budgetService.getSpendingSummary().subscribe();
  }

  toggleGroup(groupLabel: string) {
    this.collapsedGroups.update((set) => {
      const newSet = new Set(set);
      if (newSet.has(groupLabel)) {
        newSet.delete(groupLabel);
      } else {
        newSet.add(groupLabel);
      }
      return newSet;
    });
  }

  isGroupCollapsed(groupLabel: string): boolean {
    return this.collapsedGroups().has(groupLabel);
  }

  toggleAllGroups(): void {
    const groups = this.groupedReceipts();
    if (this.allExpanded()) {
      // Collapse all - add all group labels to collapsedGroups
      const allLabels = new Set(groups.map(g => g.label));
      this.collapsedGroups.set(allLabels);
      this.allExpanded.set(false);
    } else {
      // Expand all - clear collapsedGroups
      this.collapsedGroups.set(new Set());
      this.allExpanded.set(true);
    }
  }

  protected loadReceipts(): void {
    this.receiptService.loadReceipts();
  }

  protected logout(): void {
    this.authService.logout();
  }

  protected addTestReceipt(): void {
    console.log('[Dashboard] Starting test receipt creation...');

    // Check if user is authenticated
    const token = this.authService.getToken();
    console.log('[Dashboard] Auth token exists:', !!token);

    const testAmount = Math.floor(Math.random() * 50) + 10;
    const stores = ['REWE', 'EDEKA', 'ALDI', 'LIDL', 'Netto'];
    const randomStore = stores[Math.floor(Math.random() * stores.length)];
    console.warn('[Dashboard] addTestReceipt', { testAmount, randomStore });
    console.log('[Dashboard] Current receipts count before:', this.receipts().length);

    this.receiptService.createQuickReceipt(testAmount, randomStore).subscribe({
      next: (receipt) => {
        console.log('[Dashboard] Test-Kassenbon erfolgreich erstellt:', receipt);
        console.log('[Dashboard] Current receipts count after:', this.receipts().length);
        alert('Test-Kassenbon erfolgreich erstellt!');
      },
      error: (error) => {
        console.error('[Dashboard] Fehler beim Erstellen des Test-Kassenbons:', error);
        alert(
          `Fehler beim Erstellen des Test-Kassenbons: ${error.message || JSON.stringify(error)}`
        );
      },
    });
  }

  protected downloadDebugLogs(): void {
    // Trigger a fresh computation to get current state
    this.logger.log('=== DEBUG LOG EXPORT ===');
    this.logger.log('Current receipts count: ' + this.receipts().length);
    this.logger.log('Filtered receipts count: ' + this.filteredReceipts().length);
    this.logger.log('Search term: ' + this.searchTerm());
    this.logger.log('Status filter: ' + this.statusFilter());
    this.logger.log('Sort by: ' + this.sortBy());

    // Sample some receipts for debugging
    const receipts = this.receipts().slice(0, 3);
    receipts.forEach((receipt, index) => {
      this.logger.log(
        `Receipt ${index + 1}: ${receipt.id} - Status: ${receipt.status} - Amount: ${
          receipt.totalAmount
        }`
      );
    });

    this.logger.downloadLogs();
  }

  protected scanReceipt(): void {
    this.router.navigate(['/scan']);
  }

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      input.value = ''; // allow selecting the same file again
      this.receiptService.uploadReceipt(file).subscribe({
        next: (receipt) => {
          console.log('[Dashboard] Receipt uploaded successfully:', receipt);
          // Optionally open the receipt detail view
          this.viewReceipt(receipt.id);
        },
        error: (error) => {
          console.error('[Dashboard] Upload failed:', error);
        }
      });
    }
  }

  protected viewReceipt(receiptId: string): void {
    // Find the receipt by ID
    const receipt = this.receipts().find((r) => r.id === receiptId);
    if (!receipt) {
      console.error('Receipt not found:', receiptId);
      return;
    }

    // Open the receipt detail dialog
    const dialogRef = this.dialog.open(ReceiptDetailComponent, {
      width: '800px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      data: receipt,
      panelClass: 'receipt-detail-dialog',
    });

    dialogRef.afterClosed().subscribe((result) => {
      console.log('Dialog closed with result:', result);
      if (result === 'updated') {
        // Receipt was updated, reload receipts
        this.receiptService.loadReceipts();
      }
    });
  }

  protected goToAdmin(): void {
    this.router.navigate(['/admin']);
  }

  protected goToReceiptManager(): void {
    this.router.navigate(['/receipts']);
  }

  protected goToStatistics(): void {
    this.router.navigate(['/statistics']);
  }

  protected goToBudget(): void {
    this.router.navigate(['/budget']);
  }

  // Search and Filter Methods
  onSearchChange(): void {
    // The computed property will automatically update
  }

  onSortChange(): void {
    // The computed property will automatically update
  }

  onFilterChange(): void {
    // The computed property will automatically update
  }

  clearFilters(): void {
    this.searchTerm.set('');
    this.statusFilter.set('');
    this.sortBy.set('date-desc');
  }

  protected getStatusColor(status: string): string {
    switch (status) {
      case 'DONE':
        return 'primary';
      case 'PROCESSING':
        return 'accent';
      case 'PENDING':
        return 'warn';
      case 'FAILED':
        return 'warn';
      case 'NEEDS_REVIEW':
        return 'accent';
      default:
        return 'basic';
    }
  }

  protected getStatusText(status: string): string {
    switch (status) {
      case 'DONE':
        return 'Fertig';
      case 'PROCESSING':
        return 'Verarbeitung';
      case 'PENDING':
        return 'Wartend';
      case 'FAILED':
        return 'Fehler';
      case 'NEEDS_REVIEW':
        return 'Prüfung';
      default:
        return status;
    }
  }
}
