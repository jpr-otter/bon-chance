export interface Store {
  id: string;
  name: string;
  chainId: string;
  address: string;
  coordinates: GeoCoordinates;
  openingHours: OpeningHours[];
  contact: StoreContact;
  features: StoreFeatures;
}

export interface StoreChain {
  id: string;
  name: string;
  logo?: string;
  website?: string;
  country: string;
  storeCount: number;
  parsingRules: StoreParsingRules;
}

export interface GeoCoordinates {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export interface OpeningHours {
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, etc.
  openTime: string; // HH:mm format
  closeTime: string; // HH:mm format
  isClosed: boolean;
}

export interface StoreContact {
  phone?: string;
  email?: string;
  website?: string;
}

export interface StoreFeatures {
  hasParking: boolean;
  hasWifi: boolean;
  acceptsCards: boolean;
  hasDelivery: boolean;
  has24Hours: boolean;
}

export interface StoreParsingRules {
  namePatterns: string[];
  addressPatterns: string[];
  itemPatterns: string[];
  pricePatterns: string[];
  totalPatterns: string[];
  datePatterns: string[];
  skipLines: string[];
}

// Store search and filtering
export interface StoreSearchParams {
  query?: string;
  coordinates?: GeoCoordinates;
  radius?: number; // in kilometers
  chainId?: string;
  features?: Partial<StoreFeatures>;
}

export interface StoreSearchResult {
  store: Store;
  distance?: number; // in kilometers
  relevanceScore: number;
}
