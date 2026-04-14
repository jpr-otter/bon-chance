import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Receipt, ReceiptItem } from '../../models/receipt.model';

@Component({
  selector: 'app-receipt-display',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './receipt-display.component.html',
  styleUrls: ['./receipt-display.component.scss'],
})
export class ReceiptDisplayComponent {
  @Input() receipt: Receipt | null = null;
  @Input() isEditable: boolean = true;

  @Output() itemCorrection = new EventEmitter<{ itemId: string; updates: Partial<ReceiptItem> }>();
  @Output() saveReceipt = new EventEmitter<Receipt>();
  @Output() deleteReceipt = new EventEmitter<string>();
  @Output() newScan = new EventEmitter<void>();

  showRawText = signal(false);
  editingItem: string | null = null;
  editingValues: Partial<ReceiptItem> = {};

  startEditItem(item: ReceiptItem): void {
    this.editingItem = item.id;
    this.editingValues = {
      descriptionRaw: item.descriptionRaw,
      price: item.price,
      quantity: item.quantity,
      categoryId: item.categoryId,
    };
  }

  saveEditItem(): void {
    if (this.editingItem && this.editingValues) {
      this.itemCorrection.emit({
        itemId: this.editingItem,
        updates: this.editingValues,
      });
      this.cancelEditItem();
    }
  }

  cancelEditItem(): void {
    this.editingItem = null;
    this.editingValues = {};
  }

  deleteItem(itemId: string): void {
    if (this.receipt && this.receipt.items) {
      const updatedItems = this.receipt.items.filter((item) => item.id !== itemId);
      const updatedReceipt = { ...this.receipt, items: updatedItems };
      this.saveReceipt.emit(updatedReceipt);
    }
  }

  trackByItemId(index: number, item: ReceiptItem): string {
    return item.id;
  }

  onItemUpdate(item: ReceiptItem): void {
    // This method is called when an item is updated
    // Emit the changes to parent component
    this.itemCorrection.emit({
      itemId: item.id,
      updates: {
        descriptionRaw: item.descriptionRaw,
        price: item.price,
        quantity: item.quantity,
        categoryId: item.categoryId,
        unitType: item.unitType,
      },
    });
  }

  addManualItem(): void {
    if (this.receipt) {
      const newItem: ReceiptItem = {
        id: Date.now().toString(),
        receiptId: this.receipt.id,
        descriptionRaw: 'Neuer Artikel',
        isCorrectedByUser: true,
        quantity: 1,
        unitType: 'stk',
        price: 0,
        categoryId: 'other',
      };

      const updatedItems = [...(this.receipt.items || []), newItem];
      const updatedReceipt = { ...this.receipt, items: updatedItems };
      this.saveReceipt.emit(updatedReceipt);
    }
  }

  hasValidItems(): boolean {
    return this.validItemsCount() > 0;
  }

  validItemsCount(): number {
    if (!this.receipt?.items) return 0;
    return this.receipt.items.filter(
      (item) =>
        item.descriptionRaw &&
        item.descriptionRaw.trim() !== '' &&
        item.price > 0 &&
        item.quantity > 0
    ).length;
  }

  calculatedTotal(): number {
    if (!this.receipt?.items) return 0;
    return this.receipt.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }

  onNewScan(): void {
    this.newScan.emit();
  }

  onSave(): void {
    if (this.receipt) {
      this.saveReceipt.emit(this.receipt);
    }
  }

  onDelete(): void {
    if (this.receipt) {
      this.deleteReceipt.emit(this.receipt.id);
    }
  }

  getTotalPrice(): number {
    return this.receipt?.items?.reduce((sum, item) => sum + item.price * item.quantity, 0) || 0;
  }

  formatDate(date: Date): string {
    return date.toLocaleDateString('de-DE');
  }

  formatPrice(price: number): string {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(price);
  }
}
