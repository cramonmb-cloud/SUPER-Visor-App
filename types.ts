
export enum UserRole {
  ADMIN = 'ADMIN', // Super Admin (Cristobal)
  VIEWER = 'VIEWER', // Registered System User with limited access
  SUPERVISOR = 'SUPERVISOR',
}

export interface DeviceMetadata {
  timestamp: number; // For sorting and historical analysis
  ip?: string;
  userAgent: string;
  browser: string; // NEW: Explicit browser name
  os: string;
  deviceType: string;
  screenResolution: string;
  windowSize: string;
  timezone: string;
  language: string;
  cpuCores: number | string;
  memory: number | string;
  isTouch: boolean;
  localTime: string;
}

export interface Supervisor {
  id: string;
  name: string;
  pin: string; // 4 digits
  createdAt: number;
  lastLoginMetadata?: DeviceMetadata; // Kept for quick access
  loginHistory?: DeviceMetadata[]; // Full audit trail
  canEditClients?: boolean; // NEW: Permission to edit clients
  canArchiveClients?: boolean; // NEW: Permission to archive clients
  canEditPhotos?: boolean; // NEW: Permission to edit client/aval photos
  financieraId?: string; // NEW: Link to Financiera
}

export interface SystemUser {
  id: string;
  name: string;
  pin: string;
  role: UserRole; // NEW: Distinguish between ADMIN and VIEWER
  assignedSupervisorIds: string[]; // IDs of supervisors they can monitor (only for VIEWER)
  createdAt: number;
  canCreateSupervisors?: boolean;
  canManageWeeks?: boolean;
  assignedFinancieraIds?: string[]; // NEW: Link to one or more Financieras (only for VIEWER)
}

export interface GuarantorRange {
  minAmount: number;
  maxAmount: number;
  requiredGuarantors: number;
}

export interface Financiera {
  id: string;
  name: string;
  createdAt: number;
  minGuarantees?: number; // NEW: Minimum number of guarantees required for this financiera
  requireClientPhoto?: boolean; // NEW: Whether to require a photo of the client
  requireFacade?: boolean; // NEW: Whether to require a photo of the facade
  logoUrl?: string; // NEW: Logo URL for the financiera
  logoGifUrl?: string; // NEW: Animated Logo URL
  guarantorRules?: GuarantorRange[]; // NEW: Amount-based guarantor requirements
  requireGuaranteesForAval?: boolean; // NEW: Whether to require guarantees for the guarantor
  minGuaranteesForAval?: number; // NEW: Minimum number of guarantees required for the guarantor
  requireGuarantorPhoto?: boolean; // NEW: Whether to require a photo of the guarantor (person)
  requireGuarantorFacade?: boolean; // NEW: Whether to require a photo of the guarantor's facade
  maxClientActiveLoans?: number; // NEW: Maximum active loans/registrations a client can have
  maxAvalRegistrations?: number; // NEW: Maximum registrations an aval can have
  maxClientAsAval?: number; // NEW: Maximum registrations a client can have as an aval
}

export interface Guarantee {
  description: string;
  photoUrl?: string; // Optional URL from Storage (keeping for compatibility, but user asked for text only)
}

export interface Guarantor {
  name: string;
  address?: string;
  cellphone?: string;
  facadeUrl?: string;
  photoUrl?: string; // Photo of the actual person (guarantor)
  latitude?: number;
  longitude?: number;
  visitTimestamp?: number;
  guarantees?: Guarantee[]; // NEW: Guarantees registered by the guarantor
}

export interface Client {
  id: string; // This is the QR Code content
  name: string;
  address?: string; // NEW
  creditAmount?: number; // NEW
  cellphone?: string; // NEW (10 digits)
  supervisorId: string;
  financieraId?: string; // NEW: Link to Financiera
  guarantees: Guarantee[];
  facadeUrl?: string; 
  clientPhotoUrl?: string; // NEW: Photo of the client captured during registration
  registeredAt: number;
  latitude?: number;
  longitude?: number; // Home location
  
  // AVAL DATA (Backwards Compatibility)
  avalName?: string;
  avalAddress?: string;
  avalCellphone?: string;
  avalFacadeUrl?: string; // Captured during aval visit
  avalPhotoUrl?: string; // NEW: Photo of the guarantor captured during visit
  avalLatitude?: number;
  avalLongitude?: number;
  avalVisitTimestamp?: number;
  
  // SUPPORT FOR MULTIPLE AVALES
  avales?: Guarantor[]; // NEW: List of all guarantors
  
  isArchived?: boolean;
  comments?: string; // NEW: Optional comments about the client
  weekId?: string; // NEW: Links client to the week they were registered in
  registeredBySupervisorId?: string; // NEW: Track who originally registered the client
}

export interface WorkWeek {
  id: string; // Format: YYYY-WW (e.g. 2025-05)
  name: string; // Friendly name "Semana del 1 al 7 Feb"
  startDate: number; // Timestamp Saturday 00:00
  endDate: number; // Timestamp Friday 23:59
  isActive: boolean;
  createdAt: number;
  financieraId?: string; // NEW: Link to Financiera
}

export interface Visit {
  id: string;
  clientId: string;
  supervisorId: string;
  weekId: string; // NEW: Links visit to a specific WorkWeek
  timestamp: number;
  latitude: number;
  longitude: number;
  deviceMetadata?: DeviceMetadata; // Metadatos capturados en el momento de la visita
  isRenewal?: boolean; // NEW: Mark if this visit was a renewal registration
}

export interface QRCodeBatch {
  id: string;
  codes: string[];
  createdAt: number;
  financieraId?: string; // NEW: Link to Financiera
}

export interface RegistrationRules {
  requireFacade: boolean;
  requireGuarantee: boolean;
  minGuarantees?: number; // NEW: Minimum number of guarantees required
}

export interface SystemSettings {
  qrPrefix: string;
  nextSequence: string; // Changed from number to string to support leading zeros
  appName?: string; // Customizable App Name
  logoUrl?: string; // NEW: Custom Logo URL for PWA
  logoGifUrl?: string; // NEW: Animated Logo URL
  versionName?: string; // NEW: Custom version text (e.g. "V5.0")
  versionColor?: string; // NEW: Hex color or tailwind class for banner
  registrationRules?: RegistrationRules; // NEW: Validation settings
  adminDesignVersion?: 'v1' | 'v2'; // NEW: Template version for Admin Panel
  footerLogoUrl?: string; // NEW
  footerInfoHtml?: string; // NEW
}

export enum ApiPermission {
  READ_CLIENTS = 'read:clients',
  READ_VISITS = 'read:visits',
  READ_SUPERVISORS = 'read:supervisors',
  READ_WEEKS = 'read:weeks',
}

export interface ApiKey {
  id: string;
  name: string;
  key: string;
  permissions: ApiPermission[];
  assignedFinancieraIds: string[]; // NEW: Restrict access to these financieras
  active: boolean;
  createdAt: number;
  lastUsedAt?: number;
}

export interface AppState {
  supervisors: Supervisor[];
  clients: Client[];
  visits: Visit[];
  qrBatches: QRCodeBatch[];
  settings: SystemSettings;
  systemUsers: SystemUser[];
  weeks: WorkWeek[]; // NEW: History of weeks
  financieras: Financiera[]; // NEW: List of financial entities
  apiKeys: ApiKey[]; // NEW: External API access keys
}
