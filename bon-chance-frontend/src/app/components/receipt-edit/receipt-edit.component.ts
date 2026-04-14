import { CommonModule } from '@angular/common';
import { Component, inject, Inject, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Receipt } from '../../models/receipt.model';
import { ReceiptBackendService } from '../../services/receipt-backend.service';

@Component({
  selector: 'app-receipt-edit',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './receipt-edit.component.html',
  styles: [
    `
      .edit-container {
        width: 100%;
        max-width: 900px;
      }

      .edit-content {
        padding: 24px;
        max-height: 75vh;
        overflow-y: auto;
      }

      .form-section {
        margin-bottom: 24px;
      }

      .form-section h3 {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 16px;
        color: #333;
        font-size: 1.1em;
      }

      .form-row {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 16px;
        margin-bottom: 16px;
      }

      .full-width {
        width: 100%;
      }

      .items-list {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .item-card {
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        padding: 16px;
        background: #fafafa;
        position: relative;
      }

      .item-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
      }

      .item-number {
        font-weight: 600;
        color: #666;
      }

      .remove-item-btn {
        color: #d32f2f;
      }

      .add-item-btn {
        margin-top: 12px;
      }

      .total-mismatch-warning {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        background: #fff3e0;
        border: 1px solid #ffb74d;
        border-radius: 8px;
        margin-top: 8px;
        flex-wrap: wrap;
      }

      .total-mismatch-warning mat-icon {
        color: #f57c00;
      }

      .total-mismatch-warning span {
        flex: 1;
        min-width: 200px;
        color: #e65100;
      }

      .total-mismatch-warning button {
        white-space: nowrap;
      }

      .form-actions {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        padding-top: 16px;
        border-top: 1px solid #e0e0e0;
      }

      .save-btn {
        min-width: 120px;
      }

      .category-option {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .category-dot {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        display: inline-block;
      }

      .loading-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(255, 255, 255, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
      }
    `,
  ],
})
export class ReceiptEditComponent {
  private fb = inject(FormBuilder);
  private receiptService = inject(ReceiptBackendService);
  private snackBar = inject(MatSnackBar);
  dialogRef = inject(MatDialogRef<ReceiptEditComponent>);

  isLoading = signal(false);
  receiptForm: FormGroup;
  
  // Store the original total from the scanned receipt
  originalTotal: number;
  // Flag to track if user manually edited the total
  totalManuallyEdited = false;

  categories = [
    'Obst & Gemüse',
    'Milchprodukte',
    'Fleisch & Wurst',
    'Fisch & Meeresfrüchte',
    'Backwaren',
    'Getränke',
    'Süßwaren',
    'Snacks & Knabbereien',
    'Konserven & Fertiggerichte',
    'Nudeln, Reis & Getreide',
    'Gewürze & Saucen',
    'Haushalt',
    'Drogerie & Pflege',
    'Tierbedarf',
    'Sonstiges',
  ];

  constructor(@Inject(MAT_DIALOG_DATA) public receipt: Receipt) {
    // Store original total from the scanned receipt
    this.originalTotal = receipt.totalAmount;
    
    this.receiptForm = this.fb.group({
      storeName: [receipt.store?.name || '', Validators.required],
      purchaseDate: [new Date(receipt.purchaseDate), Validators.required],
      totalAmount: [receipt.totalAmount, [Validators.required, Validators.min(0)]],
      items: this.fb.array([]),
    });

    // Initialize items
    if (receipt.items && receipt.items.length > 0) {
      receipt.items.forEach((item) => this.addItem(item));
    } else {
      this.addItem();
    }
  }

  get items(): FormArray {
    return this.receiptForm.get('items') as FormArray;
  }

  createItemFormGroup(item?: any): FormGroup {
    return this.fb.group({
      description: [item?.descriptionRaw || '', Validators.required],
      quantity: [item?.quantity || 1, [Validators.required, Validators.min(1)]],
      unitPrice: [item?.price || 0, [Validators.required, Validators.min(0)]],
      totalPrice: [item?.price * item?.quantity || 0, [Validators.required, Validators.min(0)]],
      category: [item?.categoryId || 'Sonstiges'],
    });
  }

  addItem(item?: any): void {
    this.items.push(this.createItemFormGroup(item));
  }

  removeItem(index: number): void {
    if (this.items.length > 1) {
      this.items.removeAt(index);
      // Don't update total amount when removing items - preserve original OCR total
      // User can manually adjust if needed
    } else {
      this.snackBar.open('Mindestens ein Artikel ist erforderlich', 'OK', { duration: 3000 });
    }
  }

  onItemPriceChange(index: number): void {
    const itemGroup = this.items.at(index) as FormGroup;
    const quantity = itemGroup.get('quantity')?.value || 1;
    const unitPrice = itemGroup.get('unitPrice')?.value || 0;
    const totalPrice = quantity * unitPrice;

    itemGroup.patchValue({ totalPrice }, { emitEvent: false });
    // Don't auto-update total - let user decide
  }

  // Calculate sum of all items (for display purposes)
  getCalculatedTotal(): number {
    let total = 0;
    this.items.controls.forEach((control) => {
      const totalPrice = control.get('totalPrice')?.value || 0;
      total += parseFloat(totalPrice);
    });
    return Math.round(total * 100) / 100;
  }

  // Check if calculated total differs from the form's total
  hasTotalMismatch(): boolean {
    const formTotal = this.receiptForm.get('totalAmount')?.value || 0;
    const calculatedTotal = this.getCalculatedTotal();
    return Math.abs(formTotal - calculatedTotal) > 0.01;
  }

  // Allow user to sync total with calculated sum
  syncTotalWithItems(): void {
    const calculatedTotal = this.getCalculatedTotal();
    this.receiptForm.patchValue({ totalAmount: calculatedTotal });
    this.totalManuallyEdited = true;
  }

  // Restore original OCR total
  restoreOriginalTotal(): void {
    this.receiptForm.patchValue({ totalAmount: this.originalTotal });
    this.totalManuallyEdited = false;
  }

  updateTotalAmount(): void {
    // Only auto-update if user explicitly wants it
    // This method is kept for backwards compatibility but doesn't auto-update anymore
  }

  async save(): Promise<void> {
    if (this.receiptForm.invalid) {
      this.snackBar.open('Bitte alle Pflichtfelder ausfüllen', 'OK', { duration: 3000 });
      return;
    }

    this.isLoading.set(true);

    try {
      const formValue = this.receiptForm.value;

      const updatedReceipt: Partial<Receipt> = {
        id: this.receipt.id,
        store: {
          name: formValue.storeName,
          address: this.receipt.store?.address || '',
        },
        purchaseDate: formValue.purchaseDate,
        totalAmount: formValue.totalAmount,
        items: formValue.items.map((item: any, index: number) => ({
          id: this.receipt.items?.[index]?.id || `item-${Date.now()}-${index}`,
          receiptId: this.receipt.id,
          descriptionRaw: item.description,
          quantity: item.quantity,
          price: item.totalPrice,
          categoryId: item.category,
          isCorrectedByUser: true,
        })),
        status: this.receipt.status,
        userId: this.receipt.userId,
      };

      await this.receiptService.updateReceipt(this.receipt.id, updatedReceipt as Receipt);

      this.snackBar.open('Kassenbon erfolgreich aktualisiert', 'OK', { duration: 3000 });
      this.dialogRef.close(true);
    } catch (error) {
      console.error('Error updating receipt:', error);
      this.snackBar.open('Fehler beim Aktualisieren des Kassenbons', 'OK', { duration: 3000 });
    } finally {
      this.isLoading.set(false);
    }
  }

  getCategoryId(categoryName: string): number {
    const categoryMap: { [key: string]: number } = {
      'Obst & Gemüse': 1,
      'Milchprodukte': 2,
      'Fleisch & Wurst': 3,
      'Fisch & Meeresfrüchte': 4,
      'Backwaren': 5,
      'Getränke': 6,
      'Süßwaren': 7,
      'Snacks & Knabbereien': 8,
      'Konserven & Fertiggerichte': 9,
      'Nudeln, Reis & Getreide': 10,
      'Gewürze & Saucen': 11,
      'Haushalt': 12,
      'Drogerie & Pflege': 13,
      'Tierbedarf': 14,
      'Sonstiges': 15,
    };
    return categoryMap[categoryName] || 15;
  }

  getCategoryColor(category: string): string {
    const categoryColors: { [key: string]: string } = {
      'Obst & Gemüse': '#4caf50',
      'Milchprodukte': '#2196f3',
      'Fleisch & Wurst': '#e53935',
      'Fisch & Meeresfrüchte': '#00bcd4',
      'Backwaren': '#ff9800',
      'Getränke': '#9c27b0',
      'Süßwaren': '#e91e63',
      'Snacks & Knabbereien': '#ffc107',
      'Konserven & Fertiggerichte': '#795548',
      'Nudeln, Reis & Getreide': '#cddc39',
      'Gewürze & Saucen': '#ff5722',
      'Haushalt': '#607d8b',
      'Drogerie & Pflege': '#03a9f4',
      'Tierbedarf': '#8bc34a',
      'Sonstiges': '#9e9e9e',
    };
    return categoryColors[category] || '#9e9e9e';
  }

  cancel(): void {
    this.dialogRef.close(false);
  }
}
