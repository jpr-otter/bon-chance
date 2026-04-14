import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { BehaviorSubject, forkJoin, Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { Receipt, ReceiptItem } from '../models/receipt.model';

// ===== Backend API DTOs (align with Rust backend shared model) =====
// Rust CreateReceiptRequest: purchase_date (optional), total_amount, store_name, note, items[]
export interface CreateReceiptRequest {
  purchase_date?: string; // ISO date string
  total_amount: number; // number (Rust Decimal)
  store_name?: string; // currently optional/unused mostly
  note?: string; // optional
  items: CreateReceiptItemRequest[];
}

// Rust CreateReceiptItemRequest: description, price, quantity, category_name
export interface CreateReceiptItemRequest {
  description: string; // becomes description_raw in DB
  price: number;
  quantity: number;
  category_name?: string; // optional category
}

// Rust ReceiptResponse
export interface ReceiptResponseDTO {
  id: string;
  user_id: string;
  purchase_date: string; // ISO
  total_amount: number; // Decimal serialized as number (assumed)
  store_name?: string;
  raw_text?: string;
  status: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED' | 'NEEDS_REVIEW';
  created_at: string;
  items: ReceiptItemResponseDTO[];
}

// Rust ReceiptItemResponse
export interface ReceiptItemResponseDTO {
  id: string;
  description: string; // Backend sends description
  price: number;
  quantity: number;
  category_name?: string; // Backend sends category_name
  is_corrected_by_user?: boolean;
  confidence_score?: number;
}

@Injectable({
  providedIn: 'root',
})
export class ReceiptBackendService {
  private readonly http = inject(HttpClient);
  private readonly API_BASE_URL = '/api/v1';

  // --- Reactive State ---
  private _receipts = signal<Receipt[]>([]);
  private _isLoading = signal(false);
  private _error = signal<string | null>(null);
  private receiptsSubject = new BehaviorSubject<Receipt[]>([]); // legacy compatibility
  public receipts$ = this.receiptsSubject.asObservable();
  public receipts = computed(() => this._receipts());

  // Template usage expects functions: receiptService.isLoading() / error()
  public isLoading(): boolean {
    return this._isLoading();
  }
  public error(): string | null {
    return this._error();
  }

  constructor() {
    this.loadReceipts();
  }

  // ---- Public API ----
  loadReceipts(): void {
    this.startLoading();
    this.http
      .get<ReceiptResponseDTO[]>(`${this.API_BASE_URL}/receipts`)
      .pipe(
        map((list) => list.map((r) => this.mapReceipt(r))),
        tap((receipts) => this.setReceipts(receipts)),
        catchError((err) => {
          // Nur als Fehler behandeln wenn es ein echter HTTP-Fehler ist
          if (err.status === 401 || err.status === 403) {
            return this.handleListError(err, 'Zugriff verweigert. Bitte erneut anmelden.');
          } else if (err.status >= 500) {
            return this.handleListError(err, 'Server-Fehler beim Laden der Belege');
          } else if (err.status === 0) {
            return this.handleListError(err, 'Keine Verbindung zum Server');
          } else {
            // Bei anderen Fehlern (z.B. 404) einfach leeres Array zurückgeben ohne Fehler
            console.warn('[ReceiptBackendService] HTTP error, returning empty list:', err);
            this.setReceipts([]);
            return of<Receipt[]>([]);
          }
        }),
      )
      .subscribe();
  }

  createReceipt(req: CreateReceiptRequest): Observable<Receipt> {
    this.startLoading();
    // Transform to backend schema (already aligned) and post
    return this.http.post<ReceiptResponseDTO>(`${this.API_BASE_URL}/receipts`, req).pipe(
      map((dto) => this.mapReceipt(dto)),
      tap((receipt) => this.prependReceipt(receipt)),
      catchError((err) => this.handleErrorAndRethrow(err, 'Fehler beim Erstellen des Belegs')),
    );
  }

  createQuickReceipt(totalAmount: number, storeName?: string): Observable<Receipt> {
    // Simple synthetic 3-item receipt for fast UX testing
    const base = totalAmount / 3;
    const req: CreateReceiptRequest = {
      purchase_date: new Date().toISOString(),
      total_amount: Number(totalAmount.toFixed(2)),
      store_name: storeName,
      items: [
        {
          description: 'Apfel Bio 1kg',
          price: round2(base * 0.8),
          quantity: 2,
          category_name: 'Obst & Gemüse',
        },
        {
          description: 'Vollmilch 1L',
          price: round2(base * 0.6),
          quantity: 1,
          category_name: 'Milchprodukte',
        },
        {
          description: storeName ? `Sonstiges bei ${storeName}` : 'Brot Vollkorn',
          price: round2(totalAmount - round2(base * 0.8) * 2 - round2(base * 0.6)),
          quantity: 1,
          category_name: storeName ? 'Sonstiges' : 'Backwaren',
        },
      ],
    };
    return this.createReceipt(req);
  }

  uploadReceipt(file: File): Observable<Receipt> {
    this.startLoading();
    const formData = new FormData();
    formData.append('image', file);

    return this.http
      .post<ReceiptResponseDTO>(`${this.API_BASE_URL}/receipts/upload`, formData)
      .pipe(
        map((dto) => this.mapReceipt(dto)),
        tap((receipt) => this.prependReceipt(receipt)),
        catchError((err) => this.handleErrorAndRethrow(err, 'Fehler beim Hochladen des Belegs')),
      );
  }

  deleteReceipt(receiptId: string): Observable<boolean> {
    this.startLoading();
    return this.http.delete(`${this.API_BASE_URL}/receipts/${receiptId}`).pipe(
      map(() => {
        this.removeReceipts([receiptId]);
        this.finishLoading();
        return true;
      }),
      catchError((err) => this.handleBooleanError(err, 'Fehler beim Löschen des Belegs')),
    );
  }

  updateReceipt(receiptId: string, receipt: Receipt): Promise<Receipt> {
    this.startLoading();

    // Transform Receipt to update request format
    const updateRequest = {
      purchase_date: receipt.purchaseDate.toISOString(),
      total_amount: receipt.totalAmount,
      store_name: receipt.store?.name,
      items: (receipt.items || []).map((item) => ({
        description: item.descriptionRaw || '',
        price: item.price,
        quantity: item.quantity,
        category_name: item.categoryId || 'Sonstiges',
      })),
    };

    return this.http
      .put<ReceiptResponseDTO>(`${this.API_BASE_URL}/receipts/${receiptId}`, updateRequest)
      .pipe(
        map((dto) => this.mapReceipt(dto)),
        tap((updatedReceipt) => {
          // Update in local state
          const receipts = this._receipts();
          const index = receipts.findIndex((r) => r.id === receiptId);
          if (index !== -1) {
            receipts[index] = updatedReceipt;
            this._receipts.set([...receipts]);
            this.receiptsSubject.next([...receipts]);
          }
          this.finishLoading();
        }),
        catchError((err) =>
          this.handleErrorAndRethrow(err, 'Fehler beim Aktualisieren des Belegs'),
        ),
      )
      .toPromise() as Promise<Receipt>;
  }

  deleteMultipleReceipts(ids: string[]): Observable<boolean> {
    if (ids.length === 0) return of(true);
    if (ids.length === 1) {
      return this.deleteReceipt(ids[0]);
    }
    this.startLoading();

    // Primär: Bulk Endpoint nutzen
    return this.http
      .post<{
        success: boolean;
        deleted: number;
        invalid_ids?: number;
      }>(`${this.API_BASE_URL}/receipts/bulk-delete`, { ids })
      .pipe(
        map((res) => {
          if (res.success && res.deleted > 0) {
            // Entferne nur wirklich gelöschte (konservativ alle angeforderten, Backend löscht exakt diese IDs wenn gültig)
            this.removeReceipts(ids);
            this.finishLoading();
            if (res.deleted === ids.length) return true;
            this._error.set(`${res.deleted} von ${ids.length} Belegen gelöscht`);
            return true; // Teil-Erfolg
          }
          this.finishLoading();
          this._error.set('Keine Belege gelöscht');
          return false;
        }),
        catchError((err) => {
          console.warn(
            '[ReceiptBackendService] Bulk delete failed, fallback auf Einzel-DELETE',
            err,
          );
          // Fallback: parallel Einzel-DELETE wie vorher
          const deletes = ids.map((id) =>
            this.http.delete(`${this.API_BASE_URL}/receipts/${id}`).pipe(
              map(() => ({ id, ok: true })),
              catchError((e) => {
                console.error('Fallback delete Fehler', id, e);
                return of({ id, ok: false });
              }),
            ),
          );
          return forkJoin(deletes).pipe(
            map((results) => {
              const successIds = results.filter((r) => r.ok).map((r) => r.id);
              if (successIds.length) {
                this.removeReceipts(successIds);
              }
              this.finishLoading();
              if (successIds.length === ids.length) return true;
              if (successIds.length > 0) {
                this._error.set(
                  `${successIds.length} von ${ids.length} Belegen gelöscht (Fallback)`,
                );
                return true;
              }
              this._error.set('Fehler beim Löschen der Belege');
              return false;
            }),
            catchError((e2) => this.handleBooleanError(e2, 'Fehler beim Löschen der Belege')),
          );
        }),
      );
  }

  clearError(): void {
    this._error.set(null);
  }

  // ---- Mapping Helpers ----
  private mapReceipt(dto: ReceiptResponseDTO): Receipt {
    return {
      id: dto.id,
      userId: dto.user_id,
      purchaseDate: new Date(dto.purchase_date),
      totalAmount: dto.total_amount,
      status: dto.status,
      createdAt: new Date(dto.created_at),
      items: dto.items?.map((i) => this.mapReceiptItem(i, dto.id)) || [],
      store: dto.store_name ? { name: dto.store_name } : undefined,
      rawText: dto.raw_text,
    };
  }

  private mapReceiptItem(i: ReceiptItemResponseDTO, receiptId: string): ReceiptItem {
    return {
      id: i.id,
      receiptId,
      descriptionRaw: i.description,
      price: i.price,
      quantity: i.quantity,
      categoryId: i.category_name,
      isCorrectedByUser: i.is_corrected_by_user ?? false,
      confidenceScore: i.confidence_score,
    };
  }

  // ---- State Mutators ----
  private setReceipts(list: Receipt[]) {
    this._receipts.set(list);
    this.receiptsSubject.next(list);
    this.finishLoading();
  }

  private prependReceipt(r: Receipt) {
    const updated = [r, ...this._receipts()];
    this._receipts.set(updated);
    this.receiptsSubject.next(updated);
    this.finishLoading();
  }

  private removeReceipts(ids: string[]) {
    const filtered = this._receipts().filter((r) => !ids.includes(r.id));
    this._receipts.set(filtered);
    this.receiptsSubject.next(filtered);
  }

  // ---- Loading/Error helpers ----
  private startLoading() {
    this._isLoading.set(true);
    this.clearError();
  }
  private finishLoading() {
    this._isLoading.set(false);
  }

  private handleListError(err: any, msg: string) {
    console.error('[ReceiptBackendService]', msg, err);
    this._error.set(`${msg}`);
    this.finishLoading();
    return of<Receipt[]>([]);
  }

  private handleBooleanError(err: any, msg: string): Observable<boolean> {
    console.error('[ReceiptBackendService]', msg, err);
    this._error.set(msg);
    this.finishLoading();
    return of(false);
  }

  private handleErrorAndRethrow(err: any, msg: string): Observable<never> {
    console.error('[ReceiptBackendService]', msg, err);
    this._error.set(msg);
    this.finishLoading();
    throw err;
  }
}

// --- Utility ---
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
