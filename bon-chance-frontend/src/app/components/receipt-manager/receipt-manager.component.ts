import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, QueryList, signal, ViewChild, ViewChildren } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatAccordion, MatExpansionModule, MatExpansionPanel } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { Receipt } from '../../models/receipt.model';
import { AuthService } from '../../services/auth.service';
import { ReceiptBackendService } from '../../services/receipt-backend.service';
import { ReceiptDetailComponent } from '../receipt-detail/receipt-detail.component';
import { SpendingAnalysisComponent } from '../spending-analysis/spending-analysis.component';

interface MonthGroup {
  key: string;
  label: string;
  receipts: Receipt[];
  totalAmount: number;
}

@Component({
  selector: 'app-receipt-manager',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatCheckboxModule,
    MatDialogModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatToolbarModule,
    MatTooltipModule,
  ],
  templateUrl: './receipt-manager.component.html',
  styleUrl: './receipt-manager.component.scss',
})
export class ReceiptManagerComponent implements OnInit {
  @ViewChild('accordion') accordion!: MatAccordion;
  @ViewChildren(MatExpansionPanel) panels!: QueryList<MatExpansionPanel>;
  
  private receiptService = inject(ReceiptBackendService);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  protected authService = inject(AuthService);

  // Data signals
  receipts = this.receiptService.receipts;
  isLoading = () => this.receiptService.isLoading();

  // Filter signals
  searchTerm = signal<string>('');
  statusFilter = signal<string>('');
  dateFilter = signal<string>('');
  amountFilter = signal<string>('');
  sortBy = signal<string>('date-desc');

  // Bulk selection signals
  selectedReceiptIds = signal<Set<string>>(new Set());
  isDeleting = signal<boolean>(false);
  
  // Expand/collapse state
  allExpanded = signal<boolean>(false);

  // Computed signals
  filteredReceipts = computed(() => this.applyFilters());
  
  // Group receipts by month
  receiptsByMonth = computed<MonthGroup[]>(() => {
    const receipts = this.filteredReceipts();
    const groups = new Map<string, Receipt[]>();
    
    receipts.forEach(receipt => {
      const date = new Date(receipt.purchaseDate);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(receipt);
    });
    
    // Convert to array and sort by date descending
    return Array.from(groups.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, receipts]) => {
        const [year, month] = key.split('-');
        const monthNames = [
          'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
          'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
        ];
        return {
          key,
          label: `${monthNames[parseInt(month) - 1]} ${year}`,
          receipts,
          totalAmount: receipts.reduce((sum, r) => sum + r.totalAmount, 0)
        };
      });
  });

  totalAmount = computed(() => this.filteredReceipts().reduce((sum, r) => sum + r.totalAmount, 0));
  activeFilterCount = computed(() => {
    let count = 0;
    if (this.searchTerm()) count++;
    if (this.dateFilter()) count++;
    if (this.amountFilter()) count++;
    if (this.sortBy() !== 'date-desc') count++;
    return count;
  });
  
  // Toggle expand/collapse all
  toggleAllPanels(): void {
    if (this.allExpanded()) {
      this.panels?.forEach(panel => panel.close());
      this.allExpanded.set(false);
    } else {
      this.panels?.forEach(panel => panel.open());
      this.allExpanded.set(true);
    }
  }

  // Computed filtered and sorted receipts
  private applyFilters = computed(() => {
    let filtered = [...this.receipts()];
    const search = this.searchTerm().toLowerCase();
    const status = this.statusFilter();
    const dateRange = this.dateFilter();
    const amountRange = this.amountFilter();

    // Apply search filter
    if (search) {
      filtered = filtered.filter(
        (receipt) =>
          receipt.store?.name?.toLowerCase().includes(search) ||
          receipt.totalAmount.toString().includes(search) ||
          receipt.items?.some((item) => item.descriptionRaw.toLowerCase().includes(search)) ||
          receipt.rawText?.toLowerCase().includes(search)
      );
    }

    // Apply status filter
    if (status) {
      filtered = filtered.filter((receipt) => receipt.status === status);
    }

    // Apply date filter
    if (dateRange) {
      const now = new Date();
      let startDate: Date;

      switch (dateRange) {
        case 'today':
          startDate = new Date(now);
          startDate.setHours(0, 0, 0, 0);
          break;
        case 'week':
          startDate = new Date(now);
          startDate.setDate(now.getDate() - 7);
          break;
        case 'month':
          startDate = new Date(now);
          startDate.setMonth(now.getMonth() - 1);
          break;
        case 'year':
          startDate = new Date(now);
          startDate.setFullYear(now.getFullYear() - 1);
          break;
        default:
          startDate = new Date(0);
      }

      filtered = filtered.filter((receipt) => new Date(receipt.purchaseDate) >= startDate);
    }

    // Apply amount filter
    if (amountRange) {
      filtered = filtered.filter((receipt) => {
        const amount = receipt.totalAmount;
        switch (amountRange) {
          case '0-10':
            return amount >= 0 && amount <= 10;
          case '10-25':
            return amount > 10 && amount <= 25;
          case '25-50':
            return amount > 25 && amount <= 50;
          case '50-100':
            return amount > 50 && amount <= 100;
          case '100+':
            return amount > 100;
          default:
            return true;
        }
      });
    }

    // Apply sorting
    const sortBy = this.sortBy();
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'date-desc':
          return new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime();
        case 'date-asc':
          return new Date(a.purchaseDate).getTime() - new Date(b.purchaseDate).getTime();
        case 'amount-desc':
          return b.totalAmount - a.totalAmount;
        case 'amount-asc':
          return a.totalAmount - b.totalAmount;
        case 'store-asc':
          return (a.store?.name || '').localeCompare(b.store?.name || '');
        case 'status-asc':
          return (a.status || '').localeCompare(b.status || '');
        default:
          return 0;
      }
    });

    return filtered;
  });

  ngOnInit(): void {
    this.receiptService.loadReceipts();
  }

  // Filter methods
  onFilterChange() {
    // Filters are reactive through computed signal
  }

  resetFilters() {
    this.searchTerm.set('');
    this.statusFilter.set('');
    this.dateFilter.set('');
    this.amountFilter.set('');
    this.sortBy.set('date-desc');
  }

  clearFilters() {
    this.resetFilters();
  }

  hasActiveFilters(): boolean {
    return !!(
      this.searchTerm() ||
      this.statusFilter() ||
      this.dateFilter() ||
      this.amountFilter() ||
      this.sortBy() !== 'date-desc'
    );
  }

  selectAll() {
    const allIds = this.filteredReceipts().map((r) => r.id);
    this.selectedReceiptIds.set(new Set(allIds));
  }

  toggleSelection(receiptId: string) {
    const currentSelection = new Set(this.selectedReceiptIds());
    if (currentSelection.has(receiptId)) {
      currentSelection.delete(receiptId);
    } else {
      currentSelection.add(receiptId);
    }
    this.selectedReceiptIds.set(currentSelection);
  }

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      DONE: 'Fertig',
      PROCESSING: 'Verarbeitung',
      PENDING: 'Wartend',
      NEEDS_REVIEW: 'Prüfen',
      FAILED: 'Fehler',
    };
    return labels[status] || status;
  }

  trackByReceiptId(index: number, receipt: Receipt): string {
    return receipt.id;
  }
  
  trackByMonthKey(index: number, group: MonthGroup): string {
    return group.key;
  }

  // Navigation methods
  goBack() {
    this.router.navigate(['/dashboard']);
  }

  openReceiptDetail(receipt: Receipt) {
    console.log('Opening receipt detail for:', receipt);
    console.log('Receipt data:', JSON.stringify(receipt, null, 2));

    try {
      const dialogRef = this.dialog.open(ReceiptDetailComponent, {
        width: '800px',
        maxWidth: '95vw',
        maxHeight: '90vh',
        data: receipt,
        panelClass: 'receipt-detail-dialog',
      });

      console.log('Dialog opened successfully');

      dialogRef.afterClosed().subscribe((result) => {
        console.log('Dialog closed with result:', result);
        if (result === 'updated') {
          // Receipt was updated, reload receipts
          this.receiptService.loadReceipts();
        }
      });
    } catch (error) {
      console.error('Error opening dialog:', error);
    }
  }

  openSpendingAnalysis() {
    const dialogRef = this.dialog.open(SpendingAnalysisComponent, {
      width: '1200px',
      maxWidth: '95vw',
      height: '90vh',
      maxHeight: '90vh',
      panelClass: 'spending-analysis-dialog',
    });
  }

  // Statistics methods
  getTotalAmount(): string {
    const total = this.receipts().reduce((sum, receipt) => sum + receipt.totalAmount, 0);
    return total.toFixed(2);
  }

  getTotalItems(): number {
    return this.receipts().reduce((sum, receipt) => sum + (receipt.items?.length || 0), 0);
  }

  // Filtered statistics methods
  getFilteredTotalAmount(): string {
    const total = this.filteredReceipts().reduce((sum, receipt) => sum + receipt.totalAmount, 0);
    return total.toFixed(2);
  }

  getFilteredTotalItems(): number {
    return this.filteredReceipts().reduce((sum, receipt) => sum + (receipt.items?.length || 0), 0);
  }

  // Status handling
  getStatusColor(status: string): 'primary' | 'accent' | 'warn' | 'basic' {
    switch (status) {
      case 'DONE':
        return 'primary';
      case 'PROCESSING':
        return 'basic';
      case 'PENDING':
        return 'warn'; // Orange für wartende Kassenbons
      case 'NEEDS_REVIEW':
        return 'accent';
      case 'FAILED':
        return 'warn';
      default:
        return 'basic';
    }
  }

  getStatusText(status: string): string {
    switch (status) {
      case 'DONE':
        return 'Abgeschlossen';
      case 'PROCESSING':
        return 'Verarbeitung';
      case 'PENDING':
        return 'Wartend'; // Das war das "wartend" - bedeutet ausstehende Verarbeitung
      case 'NEEDS_REVIEW':
        return 'Überprüfung nötig';
      case 'FAILED':
        return 'Fehlgeschlagen';
      default:
        return status || 'Unbekannt';
    }
  }

  formatDate(date: Date | string): string {
    const d = new Date(date);
    return d.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  // Action methods
  editReceipt(receipt: Receipt) {
    // TODO: Navigate to edit view or open dialog
    console.log('Bearbeitung wird demnächst verfügbar sein');
  }

  deleteReceipt(receiptId: string) {
    const receipt = this.receipts().find((r) => r.id === receiptId);
    if (
      receipt &&
      confirm(`Kassenbon von ${receipt.store?.name || 'Unbekannter Laden'} wirklich löschen?`)
    ) {
      this.receiptService.deleteReceipt(receiptId).subscribe({
        next: (success) => {
          if (success) {
            console.log('Kassenbon erfolgreich gelöscht');
            // Remove from selection if it was selected
            if (this.selectedReceiptIds().has(receipt.id)) {
              const newSelection = new Set(this.selectedReceiptIds());
              newSelection.delete(receipt.id);
              this.selectedReceiptIds.set(newSelection);
            }
            // Reload receipts to refresh the view
            this.receiptService.loadReceipts();
          } else {
            console.error('Fehler beim Löschen des Kassenbons');
          }
        },
        error: (error) => {
          console.error('Fehler beim Löschen:', error);
        },
      });
    }
  }

  // Bulk selection methods
  toggleReceiptSelection(receiptId: string, event: any) {
    const newSelection = new Set(this.selectedReceiptIds());
    if (event.checked) {
      newSelection.add(receiptId);
    } else {
      newSelection.delete(receiptId);
    }
    this.selectedReceiptIds.set(newSelection);
  }

  toggleAllSelection(event: any) {
    if (event.checked) {
      // Select all filtered receipts
      const allIds = new Set(this.filteredReceipts().map((receipt) => receipt.id));
      this.selectedReceiptIds.set(allIds);
    } else {
      // Clear selection
      this.selectedReceiptIds.set(new Set());
    }
  }

  isAllSelected(): boolean {
    const filteredIds = this.filteredReceipts().map((receipt) => receipt.id);
    return filteredIds.length > 0 && filteredIds.every((id) => this.selectedReceiptIds().has(id));
  }

  isPartiallySelected(): boolean {
    const filteredIds = this.filteredReceipts().map((receipt) => receipt.id);
    const selectedCount = filteredIds.filter((id) => this.selectedReceiptIds().has(id)).length;
    return selectedCount > 0 && selectedCount < filteredIds.length;
  }

  clearSelection() {
    this.selectedReceiptIds.set(new Set());
  }

  bulkDeleteReceipts() {
    const selectedCount = this.selectedReceiptIds().size;
    if (selectedCount === 0) return;

    const confirmMessage =
      selectedCount === 1
        ? 'Den ausgewählten Kassenbon wirklich löschen?'
        : `Die ${selectedCount} ausgewählten Kassenbons wirklich löschen?`;

    if (confirm(confirmMessage)) {
      this.isDeleting.set(true);
      const selectedIds = Array.from(this.selectedReceiptIds());

      this.receiptService.deleteMultipleReceipts(selectedIds).subscribe({
        next: (success) => {
          this.isDeleting.set(false);
          if (success) {
            console.log(`${selectedCount} Kassenbons erfolgreich gelöscht`);
            this.selectedReceiptIds.set(new Set()); // Clear selection
            this.receiptService.loadReceipts(); // Reload receipts
          } else {
            console.error('Fehler beim Löschen der Kassenbons');
          }
        },
        error: (error) => {
          this.isDeleting.set(false);
          console.error('Fehler beim Bulk-Löschen:', error);
        },
      });
    }
  }

  // Navigation methods
  goToDashboard(): void {
    this.router.navigate(['/dashboard']);
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
