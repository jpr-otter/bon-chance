export interface User {
  id: string;
  email: string;
  username?: string;
  createdAt: Date;
  updatedAt?: Date;
  preferences: UserPreferences;
  statistics: UserStatistics;
}

export interface UserPreferences {
  defaultCurrency: string;
  language: string;
  notifications: NotificationSettings;
  privacy: PrivacySettings;
  ui: UiSettings;
}

export interface NotificationSettings {
  emailNotifications: boolean;
  pushNotifications: boolean;
  weeklyReport: boolean;
  priceAlerts: boolean;
}

export interface PrivacySettings {
  shareAnonymizedData: boolean;
  allowDataCollection: boolean;
  publicProfile: boolean;
}

export interface UiSettings {
  theme: 'light' | 'dark' | 'auto';
  compactMode: boolean;
  showConfidenceScores: boolean;
  autoSave: boolean;
}

export interface UserStatistics {
  totalReceipts: number;
  totalSpent: number;
  averageBasketSize: number;
  mostVisitedStore: string;
  receiptsThisMonth: number;
  lastScanDate?: Date;
}
