import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface AdminUser {
  id: string;
  email: string;
  username?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ReceiptSummary {
  id: string;
  purchase_date: string;
  total_amount: number;
  items_count: number;
}

@Injectable({
  providedIn: 'root',
})
export class AdminService {
  private http = inject(HttpClient);
  private readonly API_BASE_URL = '/api/v1';

  getAllUsers(): Observable<AdminUser[]> {
    return this.http.get<AdminUser[]>(`${this.API_BASE_URL}/admin/users`);
  }

  getUserReceipts(userId: string): Observable<ReceiptSummary[]> {
    return this.http.get<ReceiptSummary[]>(`${this.API_BASE_URL}/admin/users/${userId}/receipts`);
  }

  deleteUser(userId: string): Observable<void> {
    return this.http.delete<void>(`${this.API_BASE_URL}/admin/users/${userId}`);
  }
}
