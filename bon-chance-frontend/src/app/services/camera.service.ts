import { Injectable, signal } from '@angular/core';

export interface CameraCapabilities {
  facingMode: string[];
  zoom: boolean;
  torch: boolean;
  focus: boolean;
  maxResolution: { width: number; height: number };
}

export interface CameraConfig {
  facingMode: 'user' | 'environment';
  width: number;
  height: number;
  frameRate?: number;
  torch?: boolean;
  zoom?: number;
}

export interface PhotoMetadata {
  timestamp: Date;
  resolution: { width: number; height: number };
  fileSize: number;
  quality: number;
  deviceInfo?: string;
}

@Injectable({
  providedIn: 'root',
})
export class CameraService {
  private stream = signal<MediaStream | null>(null);
  private capabilities = signal<CameraCapabilities | null>(null);
  private currentConfig = signal<CameraConfig | null>(null);

  readonly isActive = signal(false);
  readonly hasPermission = signal<boolean | null>(null);
  readonly isProcessing = signal(false);
  readonly error = signal<string | null>(null);

  async requestPermission(config?: Partial<CameraConfig>): Promise<boolean> {
    this.error.set(null);
    this.isProcessing.set(true);

    try {
      const defaultConfig: CameraConfig = {
        facingMode: 'environment',
        width: 1920,
        height: 1080,
        frameRate: 30,
        ...config,
      };

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: defaultConfig.facingMode,
          width: { ideal: defaultConfig.width },
          height: { ideal: defaultConfig.height },
          frameRate: { ideal: defaultConfig.frameRate },
        },
      };

      // Add torch constraint if supported and requested
      if (defaultConfig.torch !== undefined) {
        (constraints.video as any).torch = defaultConfig.torch;
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      this.stream.set(stream);
      this.hasPermission.set(true);
      this.isActive.set(true);
      this.currentConfig.set(defaultConfig);

      // Get camera capabilities
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack && typeof videoTrack.getCapabilities === 'function') {
        await this.updateCapabilities(videoTrack);
      }

      return true;
    } catch (error) {
      console.error('Kamera-Zugriff verweigert:', error);
      this.hasPermission.set(false);
      this.handleError(error as Error);
      return false;
    } finally {
      this.isProcessing.set(false);
    }
  }

  private async updateCapabilities(videoTrack: MediaStreamTrack): Promise<void> {
    try {
      const capabilities = videoTrack.getCapabilities() as any;
      const settings = videoTrack.getSettings() as any;

      this.capabilities.set({
        facingMode: capabilities.facingMode || [],
        zoom: !!capabilities.zoom,
        torch: !!capabilities.torch,
        focus: !!capabilities.focusMode,
        maxResolution: {
          width: capabilities.width?.max || settings.width || 1920,
          height: capabilities.height?.max || settings.height || 1080,
        },
      });
    } catch (error) {
      console.warn('Konnte Kamera-Capabilities nicht abrufen:', error);
    }
  }

  async switchCamera(): Promise<boolean> {
    const currentConfig = this.currentConfig();
    if (!currentConfig) return false;

    const newConfig: CameraConfig = {
      ...currentConfig,
      facingMode: currentConfig.facingMode === 'environment' ? 'user' : 'environment',
    };

    this.stopCamera();
    return await this.requestPermission(newConfig);
  }

  async setTorch(enabled: boolean): Promise<boolean> {
    const stream = this.stream();
    if (!stream) return false;

    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack || !this.capabilities()?.torch) return false;

    try {
      await videoTrack.applyConstraints({
        advanced: [{ torch: enabled } as any],
      });
      return true;
    } catch (error) {
      console.error('Konnte Blitzlicht nicht setzen:', error);
      return false;
    }
  }

  async setZoom(zoomLevel: number): Promise<boolean> {
    const stream = this.stream();
    if (!stream) return false;

    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack || !this.capabilities()?.zoom) return false;

    try {
      await videoTrack.applyConstraints({
        advanced: [{ zoom: Math.max(1, Math.min(zoomLevel, 10)) } as any],
      });
      return true;
    } catch (error) {
      console.error('Konnte Zoom nicht setzen:', error);
      return false;
    }
  }

  getStream(): MediaStream | null {
    return this.stream();
  }

  getCapabilities(): CameraCapabilities | null {
    return this.capabilities();
  }

  async capturePhoto(
    videoElement: HTMLVideoElement,
    quality: number = 0.85
  ): Promise<{ imageData: string; metadata: PhotoMetadata } | null> {
    const currentStream = this.stream();
    if (!currentStream || !videoElement.videoWidth) {
      return null;
    }

    this.isProcessing.set(true);

    try {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');

      if (!context) return null;

      // Canvas-Größe auf Video-Größe setzen
      canvas.width = videoElement.videoWidth;
      canvas.height = videoElement.videoHeight;

      // Video-Frame auf Canvas zeichnen
      context.drawImage(videoElement, 0, 0);

      // Als Data URL zurückgeben
      const imageData = canvas.toDataURL('image/jpeg', quality);

      // Metadaten berechnen
      const metadata: PhotoMetadata = {
        timestamp: new Date(),
        resolution: {
          width: canvas.width,
          height: canvas.height,
        },
        fileSize: Math.round(imageData.length * 0.75), // Approximation
        quality: quality,
        deviceInfo: this.getDeviceInfo(),
      };

      return { imageData, metadata };
    } catch (error) {
      console.error('Foto-Aufnahme fehlgeschlagen:', error);
      this.handleError(error as Error);
      return null;
    } finally {
      this.isProcessing.set(false);
    }
  }

  async captureMultipleFrames(count: number = 3, interval: number = 100): Promise<string[]> {
    const frames: string[] = [];
    const video = document.querySelector('video') as HTMLVideoElement;

    if (!video) return frames;

    for (let i = 0; i < count; i++) {
      const result = await this.capturePhoto(video);
      if (result) {
        frames.push(result.imageData);
      }

      if (i < count - 1) {
        await new Promise((resolve) => setTimeout(resolve, interval));
      }
    }

    return frames;
  }

  stopCamera(): void {
    const currentStream = this.stream();
    if (currentStream) {
      currentStream.getTracks().forEach((track) => track.stop());
      this.stream.set(null);
    }
    this.isActive.set(false);
    this.currentConfig.set(null);
    this.error.set(null);
  }

  async getSupportedConstraints(): Promise<MediaTrackSupportedConstraints> {
    return navigator.mediaDevices.getSupportedConstraints();
  }

  async getAvailableDevices(): Promise<MediaDeviceInfo[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((device) => device.kind === 'videoinput');
    } catch (error) {
      console.error('Konnte Geräte nicht auflisten:', error);
      return [];
    }
  }

  private getDeviceInfo(): string {
    return `${navigator.userAgent} - ${screen.width}x${screen.height}`;
  }

  private handleError(error: Error): void {
    let errorMessage = 'Unbekannter Kamera-Fehler';

    if (error.name === 'NotAllowedError') {
      errorMessage = 'Kamera-Berechtigung verweigert';
    } else if (error.name === 'NotFoundError') {
      errorMessage = 'Keine Kamera gefunden';
    } else if (error.name === 'NotSupportedError') {
      errorMessage = 'Kamera nicht unterstützt';
    } else if (error.name === 'OverconstrainedError') {
      errorMessage = 'Kamera-Einstellungen nicht verfügbar';
    } else if (error.name === 'SecurityError') {
      errorMessage = 'HTTPS erforderlich für Kamera-Zugriff';
    }

    this.error.set(errorMessage);
  }

  // Cleanup method
  ngOnDestroy(): void {
    this.stopCamera();
  }
}
