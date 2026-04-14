import { CommonModule } from '@angular/common';
import { Component, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { OcrResult } from '../../models/ocr-result.model';
import { Receipt } from '../../models/receipt.model';
import { CameraService } from '../../services/camera.service';
import { OcrService } from '../../services/ocr.service';
import { ReceiptService } from '../../services/receipt.service';

import { CameraCaptureComponent } from '../camera-capture/camera-capture.component';
import { ReceiptDisplayComponent } from '../receipt-display/receipt-display.component';

@Component({
  selector: 'app-receipt-scanner',
  standalone: true,
  imports: [CommonModule, FormsModule, CameraCaptureComponent, ReceiptDisplayComponent],
  templateUrl: './receipt-scanner.component.html',
  styleUrls: ['./receipt-scanner.component.scss'],
})
export class ReceiptScannerComponent implements OnDestroy {
  // Signals für den Zustand
  readonly currentStep = signal<'camera' | 'processing' | 'result'>('camera');
  readonly capturedImage = signal<string | null>(null);
  readonly ocrResult = signal<OcrResult | null>(null);
  readonly finalReceipt = signal<Receipt | null>(null);
  readonly error = signal<string | null>(null);
  readonly processingMessage = signal<string>('Verarbeitung startet...');

  constructor(
    private cameraService: CameraService,
    public ocrService: OcrService,
    private receiptService: ReceiptService
  ) {}

  async onImageCaptured(imageFile: File): Promise<void> {
    // Convert file to data URL for display
    const imageData = await this.fileToDataUrl(imageFile);
    this.capturedImage.set(imageData);
    this.currentStep.set('processing');
    this.error.set(null);

    try {
      this.processingMessage.set('Initialisiere OCR...');
      const result = await this.ocrService.processImage(imageFile);

      if (result) {
        this.ocrResult.set(result);

        // Receipt-Objekt erstellen
        const receipt = this.receiptService.createReceiptFromOcr(result);
        const saved = await this.receiptService.saveReceipt(receipt);

        if (saved) {
          this.finalReceipt.set(receipt);
          this.currentStep.set('result');
        } else {
          throw new Error('Beleg konnte nicht gespeichert werden');
        }
      } else {
        throw new Error('OCR-Verarbeitung fehlgeschlagen');
      }
    } catch (error) {
      console.error('OCR-Verarbeitung fehlgeschlagen:', error);
      this.error.set('Texterkennung fehlgeschlagen. Bitte versuche es erneut.');
      this.currentStep.set('camera');
    }
  }

  onCancel(): void {
    this.startNewScan();
  }

  retakePhoto(): void {
    this.capturedImage.set(null);
    this.currentStep.set('camera');
  }

  async reprocessImage(): Promise<void> {
    const imageData = this.capturedImage();
    if (imageData) {
      // Convert data URL back to file for reprocessing
      const file = await this.dataUrlToFile(imageData, 'reprocessed-receipt.jpg');
      this.currentStep.set('processing');
      await this.onImageCaptured(file);
    }
  }

  onItemCorrection(event: { itemId: string; updates: any }): void {
    const receipt = this.finalReceipt();
    if (receipt && receipt.items) {
      // Update the item in the receipt
      const updatedItems = receipt.items.map((item) =>
        item.id === event.itemId ? { ...item, ...event.updates } : item
      );

      const updatedReceipt = { ...receipt, items: updatedItems };
      this.receiptService.saveReceipt(updatedReceipt);
      this.finalReceipt.set(updatedReceipt);
    }
  }

  onSaveReceipt(): void {
    // In MVP: Bereits gespeichert
    // Später: Backend-Sync
    this.startNewScan();
  }

  startNewScan(): void {
    this.capturedImage.set(null);
    this.ocrResult.set(null);
    this.finalReceipt.set(null);
    this.error.set(null);
    this.currentStep.set('camera');
    this.cameraService.stopCamera();
  }

  clearError(): void {
    this.error.set(null);
  }

  private async fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  private async dataUrlToFile(dataUrl: string, filename: string): Promise<File> {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    return new File([blob], filename, { type: blob.type });
  }

  ngOnDestroy(): void {
    this.cameraService.stopCamera();
    this.ocrService.cleanup();
  }
}
