import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ReceiptBackendService } from '../../services/receipt-backend.service';

interface ItemStatistic {
  itemName: string;
  totalQuantity: number;
  totalPurchases: number;
  averagePrice: number;
  minPrice: number;
  maxPrice: number;
  totalSpent: number;
  stores: StoreItemStats[];
}

interface StoreItemStats {
  storeName: string;
  quantity: number;
  averagePrice: number;
  minPrice: number;
  maxPrice: number;
  purchases: number;
}

interface StoreStatistic {
  storeName: string;
  totalVisits: number;
  totalSpent: number;
  averageReceiptAmount: number;
  itemCount: number;
  firstVisit: Date;
  lastVisit: Date;
}

interface MonthlyStatistic {
  month: string;
  year: number;
  totalSpent: number;
  receiptCount: number;
  averagePerReceipt: number;
}

interface CategoryStatistic {
  categoryName: string;
  itemCount: number;
  totalSpent: number;
  percentage: number;
}

@Component({
  selector: 'app-statistics',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatSelectModule,
    MatTableModule,
    MatTabsModule,
    MatToolbarModule,
    MatTooltipModule,
    MatSortModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './statistics.component.html',
  styleUrl: './statistics.component.scss',
})
export class StatisticsComponent implements OnInit {
  private receiptService = inject(ReceiptBackendService);
  private router = inject(Router);
  protected authService = inject(AuthService);

  receipts = this.receiptService.receipts;
  isLoading = () => this.receiptService.isLoading();

  // Filter states
  searchTerm = signal('');
  selectedStore = signal<string>('all');
  sortBy = signal<'name' | 'quantity' | 'avgPrice' | 'total'>('quantity');
  sortDirection = signal<'asc' | 'desc'>('desc');

  // Computed statistics
  itemStatistics = computed(() => this.calculateItemStatistics());
  storeStatistics = computed(() => this.calculateStoreStatistics());
  monthlyStatistics = computed(() => this.calculateMonthlyStatistics());
  categoryStatistics = computed(() => this.calculateCategoryStatistics());

  // Summary stats
  totalSpent = computed(() => this.receipts().reduce((sum, r) => sum + r.totalAmount, 0));
  totalReceipts = computed(() => this.receipts().length);
  uniqueStores = computed(
    () =>
      new Set(
        this.receipts()
          .map((r) => r.store?.name)
          .filter(Boolean)
      ).size
  );
  uniqueItems = computed(() => {
    const items = new Set<string>();
    this.receipts().forEach((r) => {
      r.items?.forEach((item) => items.add(item.descriptionRaw.toLowerCase()));
    });
    return items.size;
  });

  // Filtered item statistics
  filteredItemStats = computed(() => {
    let stats = this.itemStatistics();

    // Filter by search term
    if (this.searchTerm()) {
      const term = this.searchTerm().toLowerCase();
      stats = stats.filter((item) => item.itemName.toLowerCase().includes(term));
    }

    // Filter by store
    if (this.selectedStore() !== 'all') {
      stats = stats.filter((item) => item.stores.some((s) => s.storeName === this.selectedStore()));
    }

    // Sort
    stats = [...stats].sort((a, b) => {
      let compareValue = 0;

      switch (this.sortBy()) {
        case 'name':
          compareValue = a.itemName.localeCompare(b.itemName);
          break;
        case 'quantity':
          compareValue = a.totalQuantity - b.totalQuantity;
          break;
        case 'avgPrice':
          compareValue = a.averagePrice - b.averagePrice;
          break;
        case 'total':
          compareValue = a.totalSpent - b.totalSpent;
          break;
      }

      return this.sortDirection() === 'desc' ? -compareValue : compareValue;
    });

    return stats;
  });

  // Available stores for filter
  availableStores = computed(() => {
    const stores = new Set<string>();
    this.receipts().forEach((r) => {
      if (r.store?.name) stores.add(r.store.name);
    });
    return Array.from(stores).sort();
  });

  ngOnInit() {
    this.receiptService.loadReceipts();
  }

  private calculateItemStatistics(): ItemStatistic[] {
    const itemMap = new Map<
      string,
      {
        prices: number[];
        quantities: number[];
        stores: Map<string, { prices: number[]; quantities: number[] }>;
      }
    >();

    // Collect all item data
    this.receipts().forEach((receipt) => {
      const storeName = receipt.store?.name || 'Unbekannter Laden';

      receipt.items?.forEach((item) => {
        const itemName = item.descriptionRaw;

        if (!itemMap.has(itemName)) {
          itemMap.set(itemName, {
            prices: [],
            quantities: [],
            stores: new Map(),
          });
        }

        const itemData = itemMap.get(itemName)!;
        itemData.prices.push(item.price);
        itemData.quantities.push(item.quantity || 1);

        if (!itemData.stores.has(storeName)) {
          itemData.stores.set(storeName, { prices: [], quantities: [] });
        }

        const storeData = itemData.stores.get(storeName)!;
        storeData.prices.push(item.price);
        storeData.quantities.push(item.quantity || 1);
      });
    });

    // Convert to statistics
    const statistics: ItemStatistic[] = [];

    itemMap.forEach((data, itemName) => {
      const totalQuantity = data.quantities.reduce((sum, q) => sum + q, 0);
      const totalSpent = data.prices.reduce((sum, p) => sum + p, 0);
      const averagePrice = totalSpent / data.prices.length;

      const stores: StoreItemStats[] = [];
      data.stores.forEach((storeData, storeName) => {
        const storeTotal = storeData.prices.reduce((sum, p) => sum + p, 0);
        const storeQuantity = storeData.quantities.reduce((sum, q) => sum + q, 0);

        stores.push({
          storeName,
          quantity: storeQuantity,
          averagePrice: storeTotal / storeData.prices.length,
          minPrice: Math.min(...storeData.prices),
          maxPrice: Math.max(...storeData.prices),
          purchases: storeData.prices.length,
        });
      });

      statistics.push({
        itemName,
        totalQuantity,
        totalPurchases: data.prices.length,
        averagePrice,
        minPrice: Math.min(...data.prices),
        maxPrice: Math.max(...data.prices),
        totalSpent,
        stores: stores.sort((a, b) => b.quantity - a.quantity),
      });
    });

    return statistics;
  }

  private calculateStoreStatistics(): StoreStatistic[] {
    const storeMap = new Map<
      string,
      {
        receipts: number;
        totalAmount: number;
        itemCount: number;
        dates: Date[];
      }
    >();

    this.receipts().forEach((receipt) => {
      const storeName = receipt.store?.name || 'Unbekannter Laden';

      if (!storeMap.has(storeName)) {
        storeMap.set(storeName, {
          receipts: 0,
          totalAmount: 0,
          itemCount: 0,
          dates: [],
        });
      }

      const storeData = storeMap.get(storeName)!;
      storeData.receipts++;
      storeData.totalAmount += receipt.totalAmount;
      storeData.itemCount += receipt.items?.length || 0;
      storeData.dates.push(new Date(receipt.purchaseDate));
    });

    const statistics: StoreStatistic[] = [];

    storeMap.forEach((data, storeName) => {
      const sortedDates = data.dates.sort((a, b) => a.getTime() - b.getTime());

      statistics.push({
        storeName,
        totalVisits: data.receipts,
        totalSpent: data.totalAmount,
        averageReceiptAmount: data.totalAmount / data.receipts,
        itemCount: data.itemCount,
        firstVisit: sortedDates[0],
        lastVisit: sortedDates[sortedDates.length - 1],
      });
    });

    return statistics.sort((a, b) => b.totalSpent - a.totalSpent);
  }

  private calculateMonthlyStatistics(): MonthlyStatistic[] {
    const monthMap = new Map<string, { total: number; count: number }>();

    this.receipts().forEach((receipt) => {
      const date = new Date(receipt.purchaseDate);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      if (!monthMap.has(key)) {
        monthMap.set(key, { total: 0, count: 0 });
      }

      const monthData = monthMap.get(key)!;
      monthData.total += receipt.totalAmount;
      monthData.count++;
    });

    const statistics: MonthlyStatistic[] = [];

    monthMap.forEach((data, key) => {
      const [year, month] = key.split('-');
      const monthNames = [
        'Jan',
        'Feb',
        'Mär',
        'Apr',
        'Mai',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Okt',
        'Nov',
        'Dez',
      ];

      statistics.push({
        month: monthNames[parseInt(month) - 1],
        year: parseInt(year),
        totalSpent: data.total,
        receiptCount: data.count,
        averagePerReceipt: data.total / data.count,
      });
    });

    return statistics.sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month.localeCompare(a.month);
    });
  }

  private calculateCategoryStatistics(): CategoryStatistic[] {
    const categoryMap = new Map<string, { count: number; total: number }>();
    let totalAmount = 0;

    this.receipts().forEach((receipt) => {
      receipt.items?.forEach((item) => {
        const category = item.categoryId || 'Unbekannt';

        if (!categoryMap.has(category)) {
          categoryMap.set(category, { count: 0, total: 0 });
        }

        const categoryData = categoryMap.get(category)!;
        categoryData.count++;
        categoryData.total += item.price;
        totalAmount += item.price;
      });
    });

    const statistics: CategoryStatistic[] = [];

    categoryMap.forEach((data, categoryName) => {
      statistics.push({
        categoryName,
        itemCount: data.count,
        totalSpent: data.total,
        percentage: (data.total / totalAmount) * 100,
      });
    });

    return statistics.sort((a, b) => b.totalSpent - a.totalSpent);
  }

  getCheapestStore(item: ItemStatistic): string {
    if (item.stores.length === 0) return '-';
    const cheapest = item.stores.reduce((min, store) =>
      store.minPrice < min.minPrice ? store : min
    );
    return `${cheapest.storeName} (${cheapest.minPrice.toFixed(2)}€)`;
  }

  getMostExpensiveStore(item: ItemStatistic): string {
    if (item.stores.length === 0) return '-';
    const expensive = item.stores.reduce((max, store) =>
      store.maxPrice > max.maxPrice ? store : max
    );
    return `${expensive.storeName} (${expensive.maxPrice.toFixed(2)}€)`;
  }

  getStoreQuantity(item: ItemStatistic, storeName: string): number {
    const store = item.stores.find((s) => s.storeName === storeName);
    return store?.quantity || 0;
  }

  toggleSort(field: 'name' | 'quantity' | 'avgPrice' | 'total') {
    if (this.sortBy() === field) {
      this.sortDirection.set(this.sortDirection() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortBy.set(field);
      this.sortDirection.set('desc');
    }
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

  goToAdmin(): void {
    this.router.navigate(['/admin']);
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
