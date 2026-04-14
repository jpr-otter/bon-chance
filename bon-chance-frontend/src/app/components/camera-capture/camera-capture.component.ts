import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, Output, signal, ViewChild } from '@angular/core';
import { CameraService } from '../../services/camera.service';

@Component({
  selector: 'app-camera-capture',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './camera-capture.component.html',
  styleUrls: ['./camera-capture.component.scss'],
})
export class CameraCaptureComponent {
  @ViewChild('videoElement') videoElement!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvasElement') canvasElement!: ElementRef<HTMLCanvasElement>;

  @Output() imageCapture = new EventEmitter<File>();
  @Output() cancelAction = new EventEmitter<void>();

  readonly isStarting = signal(false);

  constructor(public cameraService: CameraService) {}

  async startCamera(): Promise<void> {
    this.isStarting.set(true);

    try {
      const hasPermission = await this.cameraService.requestPermission();

      if (hasPermission) {
        const stream = this.cameraService.getStream();
        if (stream && this.videoElement) {
          this.videoElement.nativeElement.srcObject = stream;
        }
      }
    } catch (error) {
      console.error('Kamera-Start fehlgeschlagen:', error);
    } finally {
      this.isStarting.set(false);
    }
  }

  async takePhoto(): Promise<void> {
    if (!this.videoElement || !this.canvasElement) return;

    try {
      const photoResult = await this.cameraService.capturePhoto(this.videoElement.nativeElement);

      if (photoResult) {
        // Convert data URL to File
        const file = await this.dataUrlToFile(photoResult.imageData, 'receipt-photo.jpg');
        this.imageCapture.emit(file);
      }
    } catch (error) {
      console.error('Foto-Aufnahme fehlgeschlagen:', error);
    }
  }

  private async dataUrlToFile(dataUrl: string, filename: string): Promise<File> {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    return new File([blob], filename, { type: blob.type });
  }

  cancel(): void {
    this.cameraService.stopCamera();
    this.cancelAction.emit();
  }
}
