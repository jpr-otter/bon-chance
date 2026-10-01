import { HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { Receipt } from '../../models/receipt.model';
import { ReceiptBackendService } from '../../services/receipt-backend.service';
import { ReceiptScannerComponent } from './receipt-scanner.component';

function receipt(total: number, items: [number, number][]): Receipt {
  return {
    id: 'r1',
    userId: 'u1',
    purchaseDate: new Date('2025-07-14T12:32:00Z'),
    totalAmount: total,
    status: 'NEEDS_REVIEW',
    createdAt: new Date(),
    store: { name: 'REWE' },
    items: items.map(([price, quantity], i) => ({
      id: `i${i}`,
      receiptId: 'r1',
      descriptionRaw: `Artikel ${i}`,
      price,
      quantity,
      isCorrectedByUser: false,
    })),
  } as Receipt;
}

describe('ReceiptScannerComponent', () => {
  let upload: jasmine.Spy;
  const photo = new File(['x'], 'bon.jpg', { type: 'image/jpeg' });

  beforeEach(async () => {
    upload = jasmine.createSpy('uploadReceipt');
    await TestBed.configureTestingModule({
      imports: [ReceiptScannerComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: ReceiptBackendService, useValue: { uploadReceipt: upload, loadReceipts: () => {} } },
        { provide: MatDialog, useValue: { open: jasmine.createSpy('open') } },
      ],
    }).compileComponents();
  });

  it('shows the recognised receipt and accepts it when items add up to the total', async () => {
    upload.and.returnValue(of(receipt(4.47, [[1.49, 3]])));
    const component = TestBed.createComponent(ReceiptScannerComponent).componentInstance;

    await component.onImageCaptured(photo);

    expect(upload).toHaveBeenCalledWith(photo);
    expect(component.currentStep()).toBe('result');
    expect(component.itemsSum()).toBeCloseTo(4.47, 2);
    expect(component.sumMatchesTotal()).toBeTrue();
  });

  it('flags receipts whose items do not add up to the total', async () => {
    upload.and.returnValue(of(receipt(15.99, [[0.99, 1], [2.29, 1]])));
    const component = TestBed.createComponent(ReceiptScannerComponent).componentInstance;

    await component.onImageCaptured(photo);

    expect(component.sumMatchesTotal()).toBeFalse();
  });

  it('returns to the camera step with a helpful message when the image is unreadable', async () => {
    upload.and.returnValue(throwError(() => new HttpErrorResponse({ status: 400 })));
    const component = TestBed.createComponent(ReceiptScannerComponent).componentInstance;

    await component.onImageCaptured(photo);

    expect(component.currentStep()).toBe('camera');
    expect(component.error()).toContain('nicht gelesen');
  });
});
