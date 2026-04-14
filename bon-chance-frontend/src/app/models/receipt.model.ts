export interface Receipt {
  id: string;
  userId: string;
  storeLocationId?: string;
  purchaseDate: Date;
  totalAmount: number;
  rawText?: string;
  imageUrl?: string;
  status: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED' | 'NEEDS_REVIEW';
  createdAt: Date;
  updatedAt?: Date;
  items?: ReceiptItem[];
  store?: StoreInfo;
  metadata?: ReceiptMetadata;
}

export interface ReceiptItem {
  id: string;
  receiptId: string;
  productId?: string;
  descriptionRaw: string;
  price: number;
  quantity: number;
  unitType?: UnitType;
  categoryId?: string;
  isCorrectedByUser: boolean;
  confidenceScore?: number;
  position?: ItemPosition;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface StoreInfo {
  name: string;
  location?: string;
  address?: string;
  chainId?: string;
  storeNumber?: string;
}

export interface ReceiptMetadata {
  deviceInfo?: string;
  ocrVersion?: string;
  processingTime?: number;
  imageQuality?: number;
  language?: string;
}

export interface ItemPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type UnitType = 'stk' | 'kg' | 'g' | 'l' | 'ml' | 'm' | 'cm';

export type ReceiptStatus = 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED' | 'NEEDS_REVIEW';

// Utility Types
export interface ReceiptSummary {
  id: string;
  storeName: string;
  totalAmount: number;
  purchaseDate: Date;
  itemCount: number;
  status: ReceiptStatus;
}

export interface ReceiptItemUpdate {
  descriptionRaw?: string;
  price?: number;
  quantity?: number;
  unitType?: UnitType;
  categoryId?: string;
  isCorrectedByUser?: boolean;
}
