import { Injectable, signal } from '@angular/core';
import { OcrResult, ParsedItem } from '../models/ocr-result.model';
import { Receipt, ReceiptItem } from '../models/receipt.model';

export type ReceiptCategory =
  | 'Lebensmittel'
  | 'Drogerie'
  | 'Haushalt'
  | 'Elektronik'
  | 'Baumarkt'
  | 'Sonstiges';

export interface ReceiptFilter {
  dateFrom?: Date;
  dateTo?: Date;
  store?: string;
  category?: ReceiptCategory;
  minAmount?: number;
  maxAmount?: number;
}

export interface ReceiptStats {
  totalReceipts: number;
  totalAmount: number;
  averageAmount: number;
  categoryBreakdown: Record<ReceiptCategory, number>;
  storeBreakdown: Record<string, number>;
  monthlySpending: Record<string, number>;
}

@Injectable({
  providedIn: 'root',
})
export class ReceiptService {
  private receipts = signal<Receipt[]>([]);
  private currentReceipt = signal<Receipt | null>(null);

  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);
  readonly stats = signal<ReceiptStats | null>(null);

  private readonly storageKey = 'bon-chance-receipts';

  constructor() {
    this.loadFromStorage();
    this.calculateStats();
  }

  // Receipt Management
  createReceiptFromOcr(ocrResult: OcrResult): Receipt {
    const receipt: Receipt = {
      id: this.generateId(),
      userId: 'temp-user', // For MVP
      purchaseDate: ocrResult.date || new Date(),
      totalAmount: ocrResult.total || 0,
      rawText: ocrResult.text,
      imageUrl: undefined, // Will be set separately if needed
      status: 'DONE',
      createdAt: new Date(),
      items: this.mapOcrItemsToReceiptItems(ocrResult.items || []),
      store: ocrResult.store
        ? {
            name: ocrResult.store.name,
            chainId: ocrResult.store.chainType,
            address: ocrResult.store.address,
            location: ocrResult.store.location,
          }
        : undefined,
      metadata: {
        ocrVersion: ocrResult.metadata.ocrEngine,
        processingTime: ocrResult.metadata.processingTime,
        language: ocrResult.metadata.language,
      },
    };

    return receipt;
  }

  async saveReceipt(receipt: Receipt): Promise<boolean> {
    this.isLoading.set(true);
    this.error.set(null);

    try {
      const receipts = this.receipts();
      const existingIndex = receipts.findIndex((r) => r.id === receipt.id);

      if (existingIndex >= 0) {
        // Update existing receipt
        receipts[existingIndex] = {
          ...receipt,
          updatedAt: new Date(),
        };
      } else {
        // Add new receipt and set receiptId on items
        const receiptWithIds = {
          ...receipt,
          items: receipt.items?.map((item) => ({ ...item, receiptId: receipt.id })),
        };
        receipts.push(receiptWithIds);
      }

      this.receipts.set([...receipts]);
      this.saveToStorage();
      this.calculateStats();

      return true;
    } catch (error) {
      console.error('Fehler beim Speichern des Belegs:', error);
      this.error.set('Beleg konnte nicht gespeichert werden');
      return false;
    } finally {
      this.isLoading.set(false);
    }
  }

  async deleteReceipt(receiptId: string): Promise<boolean> {
    this.isLoading.set(true);
    this.error.set(null);

    try {
      const receipts = this.receipts().filter((r) => r.id !== receiptId);
      this.receipts.set(receipts);
      this.saveToStorage();
      this.calculateStats();

      return true;
    } catch (error) {
      console.error('Fehler beim Löschen des Belegs:', error);
      this.error.set('Beleg konnte nicht gelöscht werden');
      return false;
    } finally {
      this.isLoading.set(false);
    }
  }

  getReceipt(id: string): Receipt | null {
    return this.receipts().find((r) => r.id === id) || null;
  }

  getAllReceipts(): Receipt[] {
    return this.receipts();
  }

  setCurrentReceipt(receipt: Receipt | null): void {
    this.currentReceipt.set(receipt);
  }

  getCurrentReceipt(): Receipt | null {
    return this.currentReceipt();
  }

  // Private Methods
  private mapOcrItemsToReceiptItems(ocrItems: ParsedItem[]): ReceiptItem[] {
    return ocrItems.map((item) => ({
      id: this.generateId(),
      receiptId: '', // Will be set when saving the receipt
      descriptionRaw: item.description,
      price: item.price,
      quantity: item.quantity || 1,
      categoryId: item.category || 'Sonstiges',
      isCorrectedByUser: false,
      confidenceScore: item.confidence,
    }));
  }

  private calculateStats(): void {
    const receipts = this.receipts();

    if (receipts.length === 0) {
      this.stats.set(null);
      return;
    }

    const totalAmount = receipts.reduce((sum, r) => sum + r.totalAmount, 0);

    this.stats.set({
      totalReceipts: receipts.length,
      totalAmount,
      averageAmount: totalAmount / receipts.length,
      categoryBreakdown: {} as Record<ReceiptCategory, number>,
      storeBreakdown: {},
      monthlySpending: {},
    });
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const data = JSON.parse(stored);
        // Convert date strings back to Date objects
        const receipts = data.map((r: any) => ({
          ...r,
          purchaseDate: new Date(r.purchaseDate),
          createdAt: new Date(r.createdAt),
          updatedAt: r.updatedAt ? new Date(r.updatedAt) : undefined,
          metadata: r.metadata
            ? {
                ...r.metadata,
                processedAt: new Date(r.metadata.processedAt),
              }
            : undefined,
        }));
        this.receipts.set(receipts);
      }
    } catch (error) {
      console.error('Fehler beim Laden der Belege:', error);
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.receipts()));
    } catch (error) {
      console.error('Fehler beim Speichern der Belege:', error);
    }
  }
}
