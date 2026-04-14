import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { Receipt, ReceiptItem } from '../../models/receipt.model';
import { AuthService } from '../../services/auth.service';
import { ReceiptBackendService } from '../../services/receipt-backend.service';

export interface SpendingAnalysis {
  totalAmount: number;
  transactionCount: number;
  averageTransaction: number;
  topCategories: CategorySpending[];
  topStores: StoreSpending[];
  dailySpending: DailySpending[];
  periodComparison?: PeriodComparison;
}

export interface CategorySpending {
  category: string;
  amount: number;
  count: number;
  percentage: number;
}

export interface StoreSpending {
  store: string;
  amount: number;
  count: number;
  percentage: number;
}

export interface DailySpending {
  date: string;
  amount: number;
  count: number;
}

export interface PeriodComparison {
  currentPeriod: number;
  previousPeriod: number;
  change: number;
  changePercentage: number;
}

@Component({
  selector: 'app-spending-analysis',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatNativeDateModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatTabsModule,
    MatToolbarModule,
    MatTooltipModule,
  ],
  templateUrl: './spending-analysis.component.html',
  styles: [
    `
      .spending-analysis-container {
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

      .page-content {
        padding: 20px;
        max-width: 1200px;
        margin: 0 auto;
      }

      .filters-card {
        margin-bottom: 20px;
      }

      .filters-row {
        display: flex;
        gap: 16px;
        align-items: center;
        flex-wrap: wrap;
      }

      .date-range {
        display: flex;
        gap: 12px;
      }

      .search-field {
        flex: 1;
        min-width: 200px;
      }

      .loading-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 60px 20px;
        gap: 20px;
      }

      .summary-cards {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 16px;
        margin-bottom: 30px;
      }

      .summary-card {
        background: linear-gradient(135deg, #f5f5f5 0%, #ffffff 100%);
      }

      .total-card {
        background: linear-gradient(135deg, #e8f5e8 0%, #f1f8e9 100%);
      }

      .search-card {
        background: linear-gradient(135deg, #e3f2fd 0%, #f0f7ff 100%);
      }

      .card-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 12px;
      }

      .card-header h3 {
        margin: 0;
        font-size: 1em;
        font-weight: 500;
        color: #666;
      }

      .amount-display {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .amount {
        font-size: 1.8em;
        font-weight: bold;
        color: #2e7d32;
      }

      .comparison {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .subtitle {
        margin: 8px 0 0 0;
        color: #666;
        font-size: 0.9em;
      }

      .search-summary .subtitle {
        margin: 4px 0 0 0;
      }

      .analysis-tabs {
        margin-top: 20px;
      }

      .tab-content {
        padding: 20px 0;
      }

      .tab-content h3 {
        margin: 0 0 20px 0;
        color: #333;
      }

      .categories-list,
      .stores-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .category-item,
      .store-item {
        transition: transform 0.2s ease, box-shadow 0.2s ease;
      }

      .category-item:hover,
      .store-item:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      }

      .category-header,
      .store-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
      }

      .category-info h4,
      .store-info h4 {
        margin: 0;
        font-size: 1.1em;
        font-weight: 500;
      }

      .item-count,
      .transaction-count {
        font-size: 0.9em;
        color: #666;
      }

      .category-amount,
      .store-amount {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .percentage-chip {
        font-size: 0.8em;
        background-color: #e3f2fd;
        color: #1976d2;
      }

      .progress-bar {
        width: 100%;
        height: 6px;
        background-color: #e0e0e0;
        border-radius: 3px;
        overflow: hidden;
      }

      .progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #4caf50, #2e7d32);
        transition: width 0.3s ease;
      }

      .search-items {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .search-item {
        border-left: 4px solid #1976d2;
      }

      .item-info {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .item-details h4 {
        margin: 0 0 4px 0;
        font-size: 1em;
        font-weight: 500;
      }

      .item-meta {
        margin: 0;
        font-size: 0.9em;
        color: #666;
      }

      .item-amount {
        display: flex;
        align-items: center;
        gap: 8px;
        text-align: right;
      }

      .quantity {
        font-size: 0.9em;
        color: #666;
      }

      .price {
        font-weight: 500;
      }

      .total {
        font-weight: bold;
        color: #2e7d32;
        min-width: 80px;
      }

      .no-data,
      .no-data-container {
        text-align: center;
        padding: 60px 20px;
        color: #666;
      }

      .no-data mat-icon,
      .no-data-container mat-icon {
        font-size: 64px;
        width: 64px;
        height: 64px;
        margin-bottom: 20px;
        color: #ccc;
      }

      .no-data-container h3 {
        margin: 0 0 8px 0;
        color: #333;
      }

      /* Change indicators */
      .change-positive {
        color: #2e7d32;
      }

      .change-negative {
        color: #d32f2f;
      }

      .change-neutral {
        color: #666;
      }

      @media (max-width: 768px) {
        .spending-analysis-container {
          padding: 16px;
        }

        .filters-row {
          flex-direction: column;
          align-items: stretch;
        }

        .date-range {
          flex-direction: column;
        }

        .summary-cards {
          grid-template-columns: 1fr;
        }

        .item-info {
          flex-direction: column;
          align-items: flex-start;
          gap: 8px;
        }

        .item-amount {
          width: 100%;
          justify-content: space-between;
        }
      }
    `,
  ],
})
export class SpendingAnalysisComponent {
  private receiptService = inject(ReceiptBackendService);
  private router = inject(Router);
  protected authService = inject(AuthService);

  // Filter signals
  selectedPeriod = signal<string>('month');
  customStartDate = signal<Date | null>(null);
  customEndDate = signal<Date | null>(null);
  searchTerm = signal<string>('');

  // Data signals
  isLoading = signal<boolean>(false);
  private receipts = toSignal(this.receiptService.receipts$);

  // Computed analysis
  analysis = computed(() => {
    const receipts = this.receipts();
    if (!receipts || receipts.length === 0) return null;

    const filteredReceipts = this.getFilteredReceipts(receipts);
    return this.calculateAnalysis(filteredReceipts);
  });

  // Search results
  searchResults = computed(() => {
    const receipts = this.receipts();
    const searchTerm = this.searchTerm().toLowerCase().trim();

    if (!receipts || !searchTerm) return [];

    const filteredReceipts = this.getFilteredReceipts(receipts);
    const items: (ReceiptItem & { receipt: Receipt })[] = [];

    filteredReceipts.forEach((receipt) => {
      if (receipt.items) {
        receipt.items.forEach((item) => {
          if (item.descriptionRaw?.toLowerCase().includes(searchTerm)) {
            items.push({ ...item, receipt });
          }
        });
      }
    });

    return items.sort(
      (a, b) =>
        new Date(b.receipt.purchaseDate).getTime() - new Date(a.receipt.purchaseDate).getTime()
    );
  });

  constructor() {
    // Load receipts on init
    this.loadData();
  }

  private async loadData(): Promise<void> {
    this.isLoading.set(true);
    try {
      await this.receiptService.loadReceipts();
    } finally {
      this.isLoading.set(false);
    }
  }

  private getFilteredReceipts(receipts: Receipt[]): Receipt[] {
    const now = new Date();
    let startDate: Date;
    let endDate: Date = now;

    switch (this.selectedPeriod()) {
      case 'week':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'quarter':
        const quarterStart = Math.floor(now.getMonth() / 3) * 3;
        startDate = new Date(now.getFullYear(), quarterStart, 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      case 'custom':
        startDate = this.customStartDate() || new Date(0);
        endDate = this.customEndDate() || now;
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    return receipts.filter((receipt) => {
      const receiptDate = new Date(receipt.purchaseDate);
      return receiptDate >= startDate && receiptDate <= endDate;
    });
  }

  private calculateAnalysis(receipts: Receipt[]): SpendingAnalysis {
    const totalAmount = receipts.reduce((sum, receipt) => sum + receipt.totalAmount, 0);
    const transactionCount = receipts.length;
    const averageTransaction = transactionCount > 0 ? totalAmount / transactionCount : 0;

    // Category analysis
    const categoryMap = new Map<string, { amount: number; count: number }>();
    const storeMap = new Map<string, { amount: number; count: number }>();

    receipts.forEach((receipt) => {
      // Store analysis
      const storeName = receipt.store?.name || 'Unbekannt';
      const storeData = storeMap.get(storeName) || { amount: 0, count: 0 };
      storeData.amount += receipt.totalAmount;
      storeData.count += 1;
      storeMap.set(storeName, storeData);

      // Category analysis from items
      if (receipt.items) {
        receipt.items.forEach((item) => {
          const category = item.categoryId || 'Unkategorisiert';
          const categoryData = categoryMap.get(category) || { amount: 0, count: 0 };
          categoryData.amount += item.price * item.quantity;
          categoryData.count += item.quantity;
          categoryMap.set(category, categoryData);
        });
      }
    });

    // Convert to sorted arrays
    const topCategories: CategorySpending[] = Array.from(categoryMap.entries())
      .map(([category, data]) => ({
        category,
        amount: data.amount,
        count: data.count,
        percentage: totalAmount > 0 ? (data.amount / totalAmount) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    const topStores: StoreSpending[] = Array.from(storeMap.entries())
      .map(([store, data]) => ({
        store,
        amount: data.amount,
        count: data.count,
        percentage: totalAmount > 0 ? (data.amount / totalAmount) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    return {
      totalAmount,
      transactionCount,
      averageTransaction,
      topCategories,
      topStores,
      dailySpending: [], // TODO: Implement daily breakdown
    };
  }

  getSearchTotal(): number {
    return this.searchResults().reduce((sum, item) => sum + item.price * item.quantity, 0);
  }

  onPeriodChange(): void {
    // Analysis will auto-update due to computed signal
  }

  onDateChange(): void {
    // Analysis will auto-update due to computed signal
  }

  onSearchChange(): void {
    // Search results will auto-update due to computed signal
  }

  getChangeIcon(changePercentage: number): string {
    if (changePercentage > 0) return 'trending_up';
    if (changePercentage < 0) return 'trending_down';
    return 'trending_flat';
  }

  getChangeIconClass(changePercentage: number): string {
    if (changePercentage > 0) return 'change-negative'; // More spending is negative
    if (changePercentage < 0) return 'change-positive'; // Less spending is positive
    return 'change-neutral';
  }

  getChangeClass(changePercentage: number): string {
    return this.getChangeIconClass(changePercentage);
  }

  // Navigation methods
  goBack(): void {
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

  goToAdmin(): void {
    this.router.navigate(['/admin']);
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
