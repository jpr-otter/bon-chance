import { CommonModule } from '@angular/common';
import { Component, inject, Inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import {
    MAT_DIALOG_DATA,
    MatDialog,
    MatDialogModule,
    MatDialogRef,
} from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { Receipt } from '../../models/receipt.model';
import { ReceiptEditComponent } from '../receipt-edit/receipt-edit.component';

@Component({
  selector: 'app-receipt-detail',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatDialogModule,
    MatDividerModule,
    MatIconModule,
    MatListModule,
  ],
  templateUrl: './receipt-detail.component.html',
  styles: [
    `
      .receipt-detail-container {
        width: 100%;
        max-width: 900px;
      }

      .detail-content {
        padding: 24px;
        margin: 0;
      }

      .receipt-header {
        margin-bottom: 16px;
      }

      .receipt-summary {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .summary-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .label {
        font-weight: 500;
        color: #666;
      }

      .total-amount {
        font-size: 1.2em;
        font-weight: bold;
        color: #2e7d32;
      }

      .count {
        font-weight: 500;
      }

      .items-section {
        padding: 16px 0;
      }

      .items-section h3 {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 16px;
        color: #333;
      }

      .items-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .item-card {
        border-left: 4px solid #e0e0e0;
        transition: border-color 0.2s ease;
      }

      .item-card:hover {
        border-left-color: #1976d2;
      }

      .item-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 12px;
      }

      .item-description {
        margin: 0;
        font-size: 1.1em;
        font-weight: 500;
        flex: 1;
        margin-right: 16px;
      }

      .item-price {
        font-size: 1.1em;
        font-weight: bold;
        color: #1976d2;
      }

      .item-details {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .detail-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .detail-label {
        font-size: 0.9em;
        color: #666;
        font-weight: 500;
      }

      .detail-value {
        font-weight: 500;
      }

      .item-total {
        color: #2e7d32;
        font-weight: bold;
      }

      .category-chip {
        font-size: 0.8em;
      }

      .confidence-score {
        font-weight: 500;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 0.9em;
      }

      .confidence-score.high {
        background-color: #c8e6c9;
        color: #2e7d32;
      }

      .confidence-score.medium {
        background-color: #fff3e0;
        color: #f57c00;
      }

      .confidence-score.low {
        background-color: #ffcdd2;
        color: #d32f2f;
      }

      .no-items {
        text-align: center;
        padding: 40px 20px;
        color: #666;
      }

      .no-items mat-icon {
        font-size: 48px;
        width: 48px;
        height: 48px;
        margin-bottom: 16px;
        color: #ccc;
      }

      .status-pending {
        background-color: #fff3e0;
        color: #f57c00;
      }

      .status-done {
        background-color: #c8e6c9;
        color: #2e7d32;
      }

      .status-processing {
        background-color: #e3f2fd;
        color: #1976d2;
      }

      .raw-text-section {
        padding: 16px 0;
      }

      .raw-text-section h3 {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 16px;
        color: #333;
      }

      .raw-text-card {
        background-color: #f5f5f5;
      }

      .raw-text-content {
        white-space: pre-wrap;
        font-family: monospace;
        font-size: 0.9em;
        color: #444;
        margin: 0;
        max-height: 300px;
        overflow-y: auto;
      }

      @media (max-width: 600px) {
        .receipt-detail-container {
          width: 100vw;
          height: 100vh;
          max-width: none;
        }

        .item-header {
          flex-direction: column;
          align-items: flex-start;
          gap: 8px;
        }
      }
    `,
  ],
})
export class ReceiptDetailComponent {
  private dialogRef = inject(MatDialogRef<ReceiptDetailComponent>);
  private dialog = inject(MatDialog);

  constructor(@Inject(MAT_DIALOG_DATA) public receipt: Receipt) {
    console.log('ReceiptDetailComponent constructor - received data:', this.receipt);
    console.log('Receipt properties:', {
      id: this.receipt?.id,
      store: this.receipt?.store,
      totalAmount: this.receipt?.totalAmount,
      purchaseDate: this.receipt?.purchaseDate,
      status: this.receipt?.status,
      items: this.receipt?.items,
    });
  }

  trackByItemId(index: number, item: any): string {
    return item.id || index;
  }

  getStatusLabel(status: string | undefined): string {
    switch (status?.toLowerCase()) {
      case 'done':
        return 'Verarbeitet';
      case 'pending':
        return 'Ausstehend';
      case 'processing':
        return 'In Bearbeitung';
      case 'failed':
        return 'Fehlgeschlagen';
      default:
        return 'Unbekannt';
    }
  }

  getConfidenceClass(score: number | undefined): string {
    if (!score) return 'low';
    if (score >= 0.8) return 'high';
    if (score >= 0.6) return 'medium';
    return 'low';
  }

  getCategoryColor(category: string | undefined): string {
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
    return categoryColors[category || ''] || '#9e9e9e';
  }

  close(): void {
    this.dialogRef.close();
  }

  editReceipt(): void {
    const editDialogRef = this.dialog.open(ReceiptEditComponent, {
      data: this.receipt,
      width: '900px',
      maxWidth: '95vw',
      disableClose: true,
    });

    editDialogRef.afterClosed().subscribe((result) => {
      if (result) {
        // Receipt was updated, close this dialog and refresh
        this.dialogRef.close('updated');
      }
    });
  }
}
