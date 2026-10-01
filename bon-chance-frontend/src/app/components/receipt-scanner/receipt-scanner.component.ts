import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { Receipt } from '../../models/receipt.model';
import { CameraService } from '../../services/camera.service';
import { ReceiptBackendService } from '../../services/receipt-backend.service';

import { CameraCaptureComponent } from '../camera-capture/camera-capture.component';
import { ReceiptDetailComponent } from '../receipt-detail/receipt-detail.component';

/**
 * Scan flow: take a photo (or pick one), let the backend OCR service read it
 * and show what was recognised. Recognition runs server side (same pipeline
 * as the dashboard upload), so the result is stored like every other receipt.
 */
@Component({
  selector: 'app-receipt-scanner',
  standalone: true,
  imports: [CommonModule, CameraCaptureComponent],
  templateUrl: './receipt-scanner.component.html',
  styleUrls: ['./receipt-scanner.component.scss'],
})
export class ReceiptScannerComponent implements OnDestroy {
  private readonly cameraService = inject(CameraService);
  private readonly receiptService = inject(ReceiptBackendService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);

  readonly currentStep = signal<'camera' | 'processing' | 'result'>('camera');
  readonly capturedImage = signal<string | null>(null);
  readonly receipt = signal<Receipt | null>(null);
  readonly error = signal<string | null>(null);
  readonly elapsedSeconds = signal(0);

  /** Sum of the recognised items; differs from the total when OCR missed or misread lines. */
  readonly itemsSum = computed(() =>
    (this.receipt()?.items ?? []).reduce((sum, item) => sum + item.price * item.quantity, 0),
  );
  readonly sumMatchesTotal = computed(() => {
    const r = this.receipt();
    return !!r && (r.items?.length ?? 0) > 0 && Math.abs(this.itemsSum() - r.totalAmount) < 0.015;
  });

  private lastFile: File | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  async onImageCaptured(imageFile: File): Promise<void> {
    this.lastFile = imageFile;
    this.cameraService.stopCamera();
    this.capturedImage.set(URL.createObjectURL(imageFile));
    this.error.set(null);
    this.receipt.set(null);
    this.currentStep.set('processing');
    this.startTimer();

    try {
      const receipt = await firstValueFrom(this.receiptService.uploadReceipt(imageFile));
      this.receipt.set(receipt);
      this.currentStep.set('result');
    } catch (err) {
      console.error('Kassenbon-Erkennung fehlgeschlagen:', err);
      this.error.set(this.errorMessage(err));
      this.currentStep.set('camera');
    } finally {
      this.stopTimer();
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow choosing the same file again
    if (file) {
      void this.onImageCaptured(file);
    }
  }

  retry(): void {
    if (this.lastFile) {
      void this.onImageCaptured(this.lastFile);
    }
  }

  openDetails(): void {
    const receipt = this.receipt();
    if (!receipt) return;
    const ref = this.dialog.open(ReceiptDetailComponent, {
      width: '800px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      data: receipt,
      panelClass: 'receipt-detail-dialog',
    });
    ref.afterClosed().subscribe((result) => {
      if (result === 'updated') {
        this.receiptService.loadReceipts();
      }
    });
  }

  startNewScan(): void {
    this.releaseImage();
    this.receipt.set(null);
    this.error.set(null);
    this.lastFile = null;
    this.currentStep.set('camera');
  }

  goToDashboard(): void {
    void this.router.navigate(['/dashboard']);
  }

  clearError(): void {
    this.error.set(null);
  }

  ngOnDestroy(): void {
    this.cameraService.stopCamera();
    this.stopTimer();
    this.releaseImage();
  }

  private errorMessage(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 0) return 'Keine Verbindung zum Server. Bitte später erneut versuchen.';
      if (err.status === 400) return 'Das Bild konnte nicht gelesen werden. Bitte ein anderes Foto verwenden.';
      if (err.status === 413) return 'Das Bild ist zu groß.';
      if (err.status === 401 || err.status === 403) return 'Sitzung abgelaufen. Bitte erneut anmelden.';
    }
    return 'Texterkennung fehlgeschlagen. Bitte versuche es erneut.';
  }

  private startTimer(): void {
    this.stopTimer();
    this.elapsedSeconds.set(0);
    this.timer = setInterval(() => this.elapsedSeconds.update((s) => s + 1), 1000);
  }

  private stopTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private releaseImage(): void {
    const url = this.capturedImage();
    if (url) URL.revokeObjectURL(url);
    this.capturedImage.set(null);
  }
}
