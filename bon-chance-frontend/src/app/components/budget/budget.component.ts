import { CommonModule, CurrencyPipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialogModule } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { Budget, BudgetService, SpendingSummary } from '../../services/budget.service';

@Component({
  selector: 'app-budget',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatProgressBarModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatMenuModule,
    MatSelectModule,
    MatDialogModule,
    MatSnackBarModule,
    MatToolbarModule,
    MatTooltipModule,
    MatDividerModule,
    CurrencyPipe,
  ],
  templateUrl: './budget.component.html',
  styleUrls: ['./budget.component.scss'],
})
export class BudgetComponent implements OnInit {
  private budgetService = inject(BudgetService);
  private snackBar = inject(MatSnackBar);
  private router = inject(Router);
  protected authService = inject(AuthService);

  budgets = this.budgetService.budgets;
  spendingSummary = this.budgetService.spendingSummary;
  isLoading = this.budgetService.isLoading;
  error = this.budgetService.error;
  categories = this.budgetService.categories;

  // Edit mode state
  editingCategory = signal<string | null>(null);
  editAmount = signal<number>(0);
  
  // Add new budget state
  showAddForm = signal<boolean>(false);
  newCategory = signal<string>('');
  newAmount = signal<number>(0);

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    forkJoin([
      this.budgetService.getBudgets(),
      this.budgetService.getSpendingSummary()
    ]).subscribe();
  }

  // Get budget for a specific category
  getBudgetForCategory(categoryName: string): Budget | undefined {
    return this.budgets().find(b => b.categoryName === categoryName);
  }

  // Get spending for a specific category
  getSpendingForCategory(categoryName: string): SpendingSummary | undefined {
    return this.spendingSummary().find(s => s.categoryName === categoryName);
  }

  // Get combined view data
  getCombinedData(): Array<{
    categoryName: string;
    color: string;
    spent: number;
    limit: number | null;
    percentage: number;
    hasBudget: boolean;
  }> {
    const result: Array<{
      categoryName: string;
      color: string;
      spent: number;
      limit: number | null;
      percentage: number;
      hasBudget: boolean;
    }> = [];

    // Start with spending data
    for (const spending of this.spendingSummary()) {
      const budget = this.getBudgetForCategory(spending.categoryName);
      const limit = budget?.monthlyLimit ?? spending.budgetLimit;
      const percentage = limit && limit > 0 
        ? Math.min((spending.totalSpent / limit) * 100, 100)
        : 0;
      
      result.push({
        categoryName: spending.categoryName,
        color: this.budgetService.getCategoryColor(spending.categoryName),
        spent: spending.totalSpent,
        limit,
        percentage,
        hasBudget: !!budget || !!spending.budgetLimit,
      });
    }

    // Add budgets for categories without spending
    for (const budget of this.budgets()) {
      if (!result.find(r => r.categoryName === budget.categoryName)) {
        result.push({
          categoryName: budget.categoryName,
          color: this.budgetService.getCategoryColor(budget.categoryName),
          spent: budget.currentSpent,
          limit: budget.monthlyLimit,
          percentage: budget.percentageUsed,
          hasBudget: true,
        });
      }
    }

    // Sort by spent amount descending
    return result.sort((a, b) => b.spent - a.spent);
  }

  // Get categories without budgets (for add dropdown)
  getAvailableCategories(): Array<{ name: string; color: string }> {
    const existingCategories = new Set(this.budgets().map(b => b.categoryName));
    return this.categories.filter(c => !existingCategories.has(c.name));
  }

  // Progress bar color based on percentage
  getProgressColor(percentage: number): 'primary' | 'accent' | 'warn' {
    if (percentage >= 90) return 'warn';
    if (percentage >= 70) return 'accent';
    return 'primary';
  }

  // Start editing a budget
  startEdit(categoryName: string): void {
    const budget = this.getBudgetForCategory(categoryName);
    this.editingCategory.set(categoryName);
    this.editAmount.set(budget?.monthlyLimit ?? 100);
  }

  // Cancel editing
  cancelEdit(): void {
    this.editingCategory.set(null);
    this.editAmount.set(0);
  }

  // Save edited budget
  saveEdit(): void {
    const category = this.editingCategory();
    const amount = this.editAmount();
    
    if (!category || amount <= 0) return;

    this.budgetService.setBudget(category, amount).subscribe(result => {
      if (result) {
        this.snackBar.open('Budget gespeichert', 'OK', { duration: 2000 });
        this.cancelEdit();
        this.loadData();
      }
    });
  }

  // Show add form
  toggleAddForm(): void {
    this.showAddForm.update(v => !v);
    if (this.showAddForm()) {
      const available = this.getAvailableCategories();
      if (available.length > 0) {
        this.newCategory.set(available[0].name);
      }
      this.newAmount.set(100);
    }
  }

  // Add new budget
  addBudget(): void {
    const category = this.newCategory();
    const amount = this.newAmount();

    if (!category || amount <= 0) return;

    this.budgetService.setBudget(category, amount).subscribe(result => {
      if (result) {
        this.snackBar.open('Budget hinzugefügt', 'OK', { duration: 2000 });
        this.showAddForm.set(false);
        this.newCategory.set('');
        this.newAmount.set(0);
        this.loadData();
      }
    });
  }

  // Delete a budget
  deleteBudget(categoryName: string): void {
    if (confirm(`Budget für "${categoryName}" wirklich löschen?`)) {
      this.budgetService.deleteBudget(categoryName).subscribe(success => {
        if (success) {
          this.snackBar.open('Budget gelöscht', 'OK', { duration: 2000 });
          this.loadData();
        }
      });
    }
  }

  // Calculate total budget
  getTotalBudget(): number {
    return this.budgets().reduce((sum, b) => sum + b.monthlyLimit, 0);
  }

  // Calculate total spent
  getTotalSpent(): number {
    return this.spendingSummary().reduce((sum, s) => sum + s.totalSpent, 0);
  }

  // Calculate overall percentage
  getOverallPercentage(): number {
    const total = this.getTotalBudget();
    if (total <= 0) return 0;
    return Math.min((this.getTotalSpent() / total) * 100, 100);
  }

  // Navigation methods
  goBack(): void {
    this.router.navigate(['/dashboard']);
  }

  goToReceiptManager(): void {
    this.router.navigate(['/receipts']);
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
