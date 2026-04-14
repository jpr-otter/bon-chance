import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';

// Budget DTOs
export interface BudgetDTO {
  id: string;
  category_name: string;
  monthly_limit: number;
  current_spending: number;
  percentage_used: number;
}

export interface SetBudgetRequest {
  category_name: string;
  monthly_limit: number;
}

export interface SpendingSummaryDTO {
  category_name: string;
  total_spent: number;
  budget_limit: number | null;
  percentage_used: number | null;
}

export interface Budget {
  id: string;
  categoryName: string;
  monthlyLimit: number;
  currentSpent: number;
  percentageUsed: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SpendingSummary {
  categoryName: string;
  totalSpent: number;
  budgetLimit: number | null;
  percentageUsed: number | null;
}

@Injectable({
  providedIn: 'root',
})
export class BudgetService {
  private readonly http = inject(HttpClient);
  private readonly API_BASE_URL = '/api/v1';

  // Reactive state
  private _budgets = signal<Budget[]>([]);
  private _spendingSummary = signal<SpendingSummary[]>([]);
  private _isLoading = signal(false);
  private _error = signal<string | null>(null);

  public budgets = computed(() => this._budgets());
  public spendingSummary = computed(() => this._spendingSummary());
  public isLoading = computed(() => this._isLoading());
  public error = computed(() => this._error());

  // Categories with colors for UI
  public readonly categories = [
    { name: 'Lebensmittel', color: '#4CAF50' },
    { name: 'Getränke', color: '#2196F3' },
    { name: 'Milchprodukte', color: '#FFC107' },
    { name: 'Fleisch & Wurst', color: '#F44336' },
    { name: 'Backwaren', color: '#8D6E63' },
    { name: 'Obst', color: '#FF9800' },
    { name: 'Gemüse', color: '#8BC34A' },
    { name: 'Tiefkühlkost', color: '#00BCD4' },
    { name: 'Süßwaren', color: '#E91E63' },
    { name: 'Snacks', color: '#9C27B0' },
    { name: 'Hygiene & Pflege', color: '#3F51B5' },
    { name: 'Haushalt', color: '#607D8B' },
    { name: 'Tiernahrung', color: '#795548' },
    { name: 'Tabakwaren', color: '#9E9E9E' },
    { name: 'Sonstiges', color: '#757575' },
  ];

  getCategoryColor(categoryName: string): string {
    const category = this.categories.find((c) => c.name === categoryName);
    return category?.color || '#757575';
  }

  // Get all budgets for the current user
  getBudgets(): Observable<Budget[]> {
    this._isLoading.set(true);
    this._error.set(null);

    return this.http.get<BudgetDTO[]>(`${this.API_BASE_URL}/budgets`).pipe(
      map((dtos) => dtos.map((dto) => this.mapBudgetFromDTO(dto))),
      tap((budgets) => {
        this._budgets.set(budgets);
        this._isLoading.set(false);
      }),
      catchError((error) => {
        console.error('Error fetching budgets:', error);
        this._error.set('Budgets konnten nicht geladen werden');
        this._isLoading.set(false);
        return of([]);
      }),
    );
  }

  // Set or update a budget for a category
  setBudget(category: string, monthlyLimit: number): Observable<Budget | null> {
    this._isLoading.set(true);
    this._error.set(null);

    const request: SetBudgetRequest = {
      category_name: category,
      monthly_limit: monthlyLimit,
    };

    return this.http.post<BudgetDTO>(`${this.API_BASE_URL}/budgets`, request).pipe(
      map((dto) => this.mapBudgetFromDTO(dto)),
      tap((budget) => {
        // Update local state
        const current = this._budgets();
        const index = current.findIndex((b) => b.categoryName === category);
        if (index >= 0) {
          const updated = [...current];
          updated[index] = budget;
          this._budgets.set(updated);
        } else {
          this._budgets.set([...current, budget]);
        }
        this._isLoading.set(false);
      }),
      catchError((error) => {
        console.error('Error setting budget:', error);
        this._error.set('Budget konnte nicht gespeichert werden');
        this._isLoading.set(false);
        return of(null);
      }),
    );
  }

  // Delete a budget for a category
  deleteBudget(category: string): Observable<boolean> {
    this._isLoading.set(true);
    this._error.set(null);

    return this.http.delete(`${this.API_BASE_URL}/budgets/${encodeURIComponent(category)}`).pipe(
      map(() => true),
      tap(() => {
        // Remove from local state
        const current = this._budgets();
        this._budgets.set(current.filter((b) => b.categoryName !== category));
        this._isLoading.set(false);
      }),
      catchError((error) => {
        console.error('Error deleting budget:', error);
        this._error.set('Budget konnte nicht gelöscht werden');
        this._isLoading.set(false);
        return of(false);
      }),
    );
  }

  // Get spending summary for all categories
  getSpendingSummary(): Observable<SpendingSummary[]> {
    this._isLoading.set(true);
    this._error.set(null);

    return this.http.get<SpendingSummaryDTO[]>(`${this.API_BASE_URL}/spending/current`).pipe(
      map((dtos) => dtos.map((dto) => this.mapSpendingSummaryFromDTO(dto))),
      tap((summary) => {
        this._spendingSummary.set(summary);
        this._isLoading.set(false);
      }),
      catchError((error) => {
        console.error('Error fetching spending summary:', error);
        this._error.set('Ausgabenübersicht konnte nicht geladen werden');
        this._isLoading.set(false);
        return of([]);
      }),
    );
  }

  // Mapping functions
  private mapBudgetFromDTO(dto: BudgetDTO): Budget {
    return {
      id: dto.id,
      categoryName: dto.category_name,
      monthlyLimit: dto.monthly_limit,
      currentSpent: dto.current_spending,
      percentageUsed: dto.percentage_used,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  private mapSpendingSummaryFromDTO(dto: SpendingSummaryDTO): SpendingSummary {
    return {
      categoryName: dto.category_name,
      totalSpent: dto.total_spent,
      budgetLimit: dto.budget_limit,
      percentageUsed: dto.percentage_used,
    };
  }
}
