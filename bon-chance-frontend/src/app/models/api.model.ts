export interface ApiResponse<T> {
  data: T;
  success: boolean;
  message?: string;
  errors?: ApiError[];
  metadata?: ResponseMetadata;
}

export interface ApiError {
  code: string;
  message: string;
  field?: string;
  details?: any;
}

export interface ResponseMetadata {
  timestamp: string;
  requestId: string;
  version: string;
  processingTime?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationInfo;
  success: boolean;
  message?: string;
}

export interface PaginationInfo {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

// HTTP Request/Response Types
export interface UploadRequest {
  image: Blob | File;
  metadata?: UploadMetadata;
}

export interface UploadMetadata {
  filename?: string;
  contentType?: string;
  deviceInfo?: string;
  location?: GeoCoordinates;
  timestamp?: string;
}

export interface UploadResponse {
  receiptId: string;
  imageUrl: string;
  status: 'UPLOADED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  estimatedProcessingTime?: number;
}

// WebSocket Message Types
export interface WebSocketMessage {
  type: MessageType;
  receiptId?: string;
  data: any;
  timestamp: string;
}

export type MessageType =
  | 'RECEIPT_STATUS_UPDATE'
  | 'OCR_PROGRESS'
  | 'PARSING_COMPLETE'
  | 'ERROR'
  | 'PING'
  | 'PONG';

export interface ReceiptStatusUpdate {
  receiptId: string;
  status: 'PROCESSING' | 'DONE' | 'FAILED' | 'NEEDS_REVIEW';
  progress?: number;
  itemsFound?: number;
  confidence?: number;
}

// Coordinates for location-based features
export interface GeoCoordinates {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp?: Date;
}
