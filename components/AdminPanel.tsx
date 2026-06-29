import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Supervisor, Client, Visit, QRCodeBatch, AppState, SystemUser, RegistrationRules, DeviceMetadata, WorkWeek, Guarantee, Financiera, UserRole, GuarantorRange, Guarantor, ApiPermission, ApiKey } from '../types';
import { Users, User, QrCode, MapPin, Plus, RefreshCw, Trash2, Printer, FileText, Settings, Save, Archive, Camera, Shield, UserPlus, UserCheck, Pencil, X, Map as MapIcon, Filter, Eye, ImageIcon, Globe, Home, Calendar, PlayCircle, StopCircle, Clock, CheckCircle, Palette, Info, Monitor, Cpu, HardDrive, Smartphone, AlertTriangle, ArrowRight, ShieldCheck, ShieldAlert, ChevronDown, ChevronUp, DollarSign, Download, FileJson, Hash, Loader2, Image as ImageIconLucide, Zap, Activity, History, UserCog, CheckSquare, Square, Search, RotateCcw, Terminal, Key, Fingerprint, ChevronLeft, ChevronRight, Building2, LayoutGrid } from 'lucide-react';
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import QRCode from "qrcode";
import JSZip from "jszip";
import { VisitsMap } from './VisitsMap';
import { CachedImage } from './CachedImage';
import { AdminPanelV2 } from './AdminPanelV2';

interface AdminPanelProps {
  data: AppState;
  isSuperAdmin: boolean;
  isViewer?: boolean;
  viewerCanCreateSups?: boolean;
  viewerCanManageWeeks?: boolean;
  onAddSupervisor: (name: string, pin: string, canEditClients: boolean, canArchiveClients: boolean, canEditPhotos: boolean, financieraId: string) => void;
  onUpdateSupervisor: (id: string, name: string, pin: string, canEditClients: boolean, canArchiveClients: boolean, canEditPhotos: boolean, financieraId: string) => void;
  onGenerateQR: (count: number, prefix: string, financieraId: string) => void;
  onDeleteSupervisor: (id: string) => void;
  onUpdateSettings: (prefix: string, nextSeq: string, appName: string, rules?: RegistrationRules, verName?: string, verColor?: string, logoUrl?: string, designVersion?: 'v1' | 'v2', logoGifUrl?: string, footerLogoUrl?: string, footerInfoHtml?: string) => void;
  onUpdateClient: (clientId: string, data: Partial<Client>) => void;
  onDeleteClient: (clientId: string) => void;
  onFetchClient: (clientId: string) => Promise<Client | null>;
  onSearchClientsByName: (query: string) => Promise<Client[]>;
  onAddSystemUser: (name: string, pin: string, supervisorIds: string[], canCreateSupervisors: boolean, canManageWeeks: boolean, assignedFinancieraIds: string[], role: UserRole) => void;
  onUpdateSystemUser: (id: string, name: string, pin: string, supervisorIds: string[], canCreateSupervisors: boolean, canManageWeeks: boolean, assignedFinancieraIds: string[], role: UserRole) => void;
  onDeleteSystemUser: (id: string) => void;
  onAddFinanciera: (name: string, minGuarantees?: number, requireClientPhoto?: boolean, requireFacade?: boolean, logoUrl?: string, guarantorRules?: GuarantorRange[], logoGifUrl?: string, requireGuaranteesForAval?: boolean, minGuaranteesForAval?: number, requireGuarantorPhoto?: boolean, requireGuarantorFacade?: boolean, maxClientActiveLoans?: number, maxAvalRegistrations?: number, maxClientAsAval?: number) => void;
  onUpdateFinanciera: (id: string, name: string, minGuarantees?: number, requireClientPhoto?: boolean, requireFacade?: boolean, logoUrl?: string, guarantorRules?: GuarantorRange[], logoGifUrl?: string, requireGuaranteesForAval?: boolean, minGuaranteesForAval?: number, requireGuarantorPhoto?: boolean, requireGuarantorFacade?: boolean, maxClientActiveLoans?: number, maxAvalRegistrations?: number, maxClientAsAval?: number) => void;
  onDeleteFinanciera: (id: string) => void;
  onDeleteQRBatch: (batchId: string) => void;
  onBatchUpdateSupervisors: (ids: string[], data: Partial<Supervisor>) => void;
  onMoveClientsToWeek: (clientIds: string[], targetWeekId: string) => void;
  onMoveClientsToFinanciera: (clientIds: string[], targetFinancieraId: string) => void;
  fullSupervisorsList: Supervisor[];
  onCreateWeek: (financieraId: string) => void;
  onCloseWeek: (financieraId: string) => void;
  onReopenWeek: (weekId: string, financieraId: string) => void;
  onAddManualWeek: (name: string, startDateTs: number, financieraId: string) => void;
  onDeleteWeek: (weekId: string) => void;
  onMigrateWeeksToLaFortuna: () => void;
  onAddApiKey: (name: string, permissions: ApiPermission[], assignedFinancieraIds: string[]) => void;
  onUpdateApiKey: (id: string, active: boolean, permissions: ApiPermission[], assignedFinancieraIds: string[]) => void;
  onDeleteApiKey: (id: string) => void;
}

const BANNER_COLORS = [
    { name: 'Indigo', hex: '#4f46e5', class: 'bg-indigo-600' },
    { name: 'Rojo', hex: '#dc2626', class: 'bg-red-600' },
    { name: 'Verde', hex: '#16a34a', class: 'bg-green-600' },
    { name: 'Morado', hex: '#9333ea', class: 'bg-purple-600' },
    { name: 'Ámbar', hex: '#d97706', class: 'bg-amber-600' },
    { name: 'Azul', hex: '#2563eb', class: 'bg-blue-600' },
    { name: 'Negro', hex: '#1e293b', class: 'bg-slate-800' },
];

export interface CheckClientCompletionResult {
    isComplete: boolean;
    missing: string[];
}

export const checkClientCompleteness = (client: Client, financiera?: Financiera): CheckClientCompletionResult => {
    const missing: string[] = [];
    if (!client.name || client.name.trim() === '') missing.push('Nombre');
    if (!client.address || client.address.trim() === '') missing.push('Domicilio');
    if (!client.cellphone || client.cellphone.trim() === '') missing.push('Teléfono');
    if (!client.creditAmount || client.creditAmount <= 0) missing.push('Monto Crédito');
    
    if (financiera?.requireClientPhoto && !client.clientPhotoUrl) missing.push('Foto Cliente');
    if (financiera?.requireFacade !== false && !client.facadeUrl) missing.push('Foto Fachada (P.D)');
    
    // Guarantors logic
    const creditAmount = client.creditAmount || 0;
    let requiredGuarantors = 1;
    if (financiera?.guarantorRules && financiera.guarantorRules.length > 0) {
        const match = financiera.guarantorRules.find(r => creditAmount >= r.minAmount && creditAmount <= r.maxAmount);
        if (match) requiredGuarantors = match.requiredGuarantors;
        else {
            const sortedRules = [...financiera.guarantorRules].sort((a,b) => b.minAmount - a.minAmount);
            if (creditAmount > sortedRules[0].maxAmount) {
                requiredGuarantors = sortedRules[0].requiredGuarantors;
            }
        }
    }

    const hasGuarantorsArray = client.avales && client.avales.length > 0;
    const hasSingleAval = client.avalName && client.avalName.trim() !== '';

    if (!hasGuarantorsArray && !hasSingleAval && requiredGuarantors > 0) {
        missing.push(`Avales Registrados (Req: ${requiredGuarantors})`);
    } else {
        let providedGuarantors = 0;
        
        if (hasGuarantorsArray && client.avales) {
            providedGuarantors = client.avales.length;
            client.avales.forEach((g, i) => {
                if (!g.name || !g.address || !g.cellphone) {
                    missing.push(`Datos incompletos Aval ${i+1}`);
                }
                if (financiera?.requireGuarantorFacade !== false && !g.facadeUrl) {
                    missing.push(`Fachada Aval ${i+1}`);
                }
            });
        } else if (hasSingleAval) {
            providedGuarantors = 1;
            if (!client.avalAddress || !client.avalCellphone) {
                 missing.push('Datos Aval Principal');
            }
            if (financiera?.requireGuarantorFacade !== false && !client.avalFacadeUrl && !client.avalVisitTimestamp) {
                 missing.push(`Fachada Aval Principal`);
            }
        }
        
        if (providedGuarantors < requiredGuarantors) {
            missing.push(`Faltan Avales (Req: ${requiredGuarantors}, Hay: ${providedGuarantors})`);
        }
    }
    
    return {
        isComplete: missing.length === 0,
        missing
    };
};

export const AdminPanel: React.FC<AdminPanelProps> = (props) => {
  const { 
    data, isSuperAdmin, isViewer, viewerCanCreateSups, viewerCanManageWeeks, onAddSupervisor, onUpdateSupervisor, onGenerateQR, onDeleteSupervisor, onUpdateSettings, onAddSystemUser, onUpdateSystemUser, onDeleteSystemUser, onAddFinanciera, onUpdateFinanciera, onDeleteFinanciera, onDeleteQRBatch, onBatchUpdateSupervisors, onUpdateClient, onDeleteClient, onFetchClient, onSearchClientsByName, onMoveClientsToWeek, onMoveClientsToFinanciera, fullSupervisorsList, onCreateWeek, onCloseWeek, onReopenWeek, onAddManualWeek, onDeleteWeek, onMigrateWeeksToLaFortuna, onAddApiKey, onUpdateApiKey, onDeleteApiKey
  } = props;

  // DESIGN SWITCHER - Permite renderizar la nueva v2 si está activa
  if (data.settings?.adminDesignVersion === 'v2') {
    return <AdminPanelV2 {...props} />;
  }

  const [activeTab, setActiveTab] = useState<'supervisors' | 'qrs' | 'clients' | 'settings' | 'map' | 'avales'>('supervisors');
  const [settingsSubTab, setSettingsSubTab] = useState<'general' | 'financieras' | 'semanas' | 'usuarios' | 'administradores' | 'api' | 'mantenimiento'>('general');
  const [isSettingsMenuExpanded, setIsSettingsMenuExpanded] = useState(false);
  const [isSearchingGlobal, setIsSearchingGlobal] = useState(false);
  
  // MODALS STATE
  const [selectedSupervisorDetails, setSelectedSupervisorDetails] = useState<Supervisor | null>(null);
  const [selectedClientForDetails, setSelectedClientForDetails] = useState<Client | null>(null);
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  
  // Settings Tab States
  const [prefix, setPrefix] = useState(data.settings?.qrPrefix || 'TP');
  const [sequence, setSequence] = useState(data.settings?.nextSequence || '100000');
  const [appName, setAppName] = useState(data.settings?.appName || 'SUPER VisorApp');
  const [logoUrl, setLogoUrl] = useState(data.settings?.logoUrl || '');
  const [logoGifUrl, setLogoGifUrl] = useState(data.settings?.logoGifUrl || '');
  const [versionName, setVersionName] = useState(data.settings?.versionName || 'SISTEMA V1.0');
  const [versionColor, setVersionColor] = useState(data.settings?.versionColor || '#4f46e5');
  const [footerLogoUrl, setFooterLogoUrl] = useState(data.settings?.footerLogoUrl || '');
  const [footerInfoHtml, setFooterInfoHtml] = useState(data.settings?.footerInfoHtml || '');
  const [designVersion, setDesignVersion] = useState<'v1' | 'v2'>(data.settings?.adminDesignVersion || 'v1');
  const [reqFacade, setReqFacade] = useState(data.settings?.registrationRules?.requireFacade ?? true);
  const [minGuarantees, setMinGuarantees] = useState(data.settings?.registrationRules?.minGuarantees ?? (data.settings?.registrationRules?.requireGuarantee ? 1 : 0));

  // Supervisor Form State
  const [supName, setSupName] = useState('');
  const [supPin, setSupPin] = useState('');
  const [supCanEdit, setSupCanEdit] = useState(false);
  const [supCanArchive, setSupCanArchive] = useState(false);
  const [supCanEditPhotos, setSupCanEditPhotos] = useState(false);
  const [supFinId, setSupFinId] = useState('');
  const [editingSup, setEditingSup] = useState<Supervisor | null>(null);

  // System User Form State
  const [sysUserName, setSysUserName] = useState('');
  const [sysUserPin, setSysUserPin] = useState('');
  const [sysUserSelectedSups, setSysUserSelectedSups] = useState<string[]>([]);
  const [sysUserSelectedFins, setSysUserSelectedFins] = useState<string[]>([]);
  const [sysUserCanCreateSups, setSysUserCanCreateSups] = useState(false);
  const [sysUserCanManageWeeks, setSysUserCanManageWeeks] = useState(false);
  const [editingSysUser, setEditingSysUser] = useState<SystemUser | null>(null);

  // Financiera Form State
  const [finName, setFinName] = useState('');
  const [finMinGuarantees, setFinMinGuarantees] = useState<number>(0);
  const [finRequireClientPhoto, setFinRequireClientPhoto] = useState(false);
  const [finRequireFacade, setFinRequireFacade] = useState(false);
  const [finLogoUrl, setFinLogoUrl] = useState('');
  const [finLogoGifUrl, setFinLogoGifUrl] = useState('');
  const [finGuarantorRules, setFinGuarantorRules] = useState<GuarantorRange[]>([]);
  const [finRequireGuaranteesForAval, setFinRequireGuaranteesForAval] = useState(false);
  const [finMinGuaranteesForAval, setFinMinGuaranteesForAval] = useState<number>(0);
  const [finRequireGuarantorPhoto, setFinRequireGuarantorPhoto] = useState(false);
  const [finRequireGuarantorFacade, setFinRequireGuarantorFacade] = useState(true);
  const [finMaxClientActiveLoans, setFinMaxClientActiveLoans] = useState<number>(1);
  const [finMaxAvalRegistrations, setFinMaxAvalRegistrations] = useState<number>(2);
  const [finMaxClientAsAval, setFinMaxClientAsAval] = useState<number>(2);
  const [ruleMin, setRuleMin] = useState('');
  const [ruleMax, setRuleMax] = useState('');
  const [ruleGuarantors, setRuleGuarantors] = useState('1');
  const [editingFin, setEditingFin] = useState<Financiera | null>(null);

  // QR States
  const [tempPrefix, setTempPrefix] = useState(data.settings?.qrPrefix || 'TP');
  const [qrCount, setQrCount] = useState<number>(10);
  const [qrFinId, setQrFinId] = useState('');
  const [exportUnusedOnly, setExportUnusedOnly] = useState(false);

  // Week Forms
  const [selectedFinancieraForWeeks, setSelectedFinancieraForWeeks] = useState<string>('');
  const [manualWeekName, setManualWeekName] = useState('');
  const [manualWeekDate, setManualWeekDate] = useState('');

  // Client Edit State
  const [isEditingClient, setIsEditingClient] = useState(false);
  const [editClientName, setEditClientName] = useState('');
  const [editClientAddress, setEditClientAddress] = useState('');
  const [editClientPhone, setEditClientPhone] = useState('');
  const [editClientCredit, setEditClientCredit] = useState(0);
  const [editClientAvalName, setEditClientAvalName] = useState('');
  const [editClientAvalAddress, setEditClientAvalAddress] = useState('');
  const [editClientAvalPhone, setEditClientAvalPhone] = useState('');
  const [editClientGuarantees, setEditClientGuarantees] = useState<Guarantee[]>([]);
  const [newGuaranteeDesc, setNewGuaranteeDesc] = useState('');

  // Bulk Actions State
  const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(new Set());
  const [showMoveWeekModal, setShowMoveWeekModal] = useState(false);
  const [targetMoveWeekId, setTargetMoveWeekId] = useState<string>('');
  const [showMoveFinancieraModal, setShowMoveFinancieraModal] = useState(false);
  const [targetMoveFinancieraId, setTargetMoveFinancieraId] = useState<string>('');
  const [showSupModal, setShowSupModal] = useState(false);
  const [showSysUserModal, setShowSysUserModal] = useState(false);
  const [selectedSupervisorIds, setSelectedSupervisorIds] = useState<string[]>([]);
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [bulkFinId, setBulkFinId] = useState('');
  const [bulkCanEdit, setBulkCanEdit] = useState<boolean | null>(null);
  const [bulkCanArchive, setBulkCanArchive] = useState<boolean | null>(null);

  // API Key Form State
  const [apiKeyName, setApiKeyName] = useState('');
  const [apiKeyPermissions, setApiKeyPermissions] = useState<ApiPermission[]>([ApiPermission.READ_CLIENTS]);
  const [apiKeyFinancieras, setApiKeyFinancieras] = useState<string[]>([]);
  const [editingApiKey, setEditingApiKey] = useState<ApiKey | null>(null);
  const [isCreatingApiKey, setIsCreatingApiKey] = useState(false);

  // FILTERS
  const [filterSupervisorId, setFilterSupervisorId] = useState<string>('ALL');
  const [filterWeekId, setFilterWeekId] = useState<string>('CURRENT');
  const [filterFinancieraId, setFilterFinancieraId] = useState<string>('ALL');
  const [clientSearchTerm, setClientSearchTerm] = useState('');
  const [activeCompletionFilters, setActiveCompletionFilters] = useState<('COMPLETE' | 'INCOMPLETE' | 'RENEWAL')[]>([]);
  const [guarantorSearchTerm, setGuarantorSearchTerm] = useState('');
  const [clientsPage, setClientsPage] = useState(1);
  const [clientsPerPage, setClientsPerPage] = useState(40);
  const [supSearchTerm, setSupSearchTerm] = useState('');

  const [guarantorsPage, setGuarantorsPage] = useState(1);
  const [guarantorsPerPage, setGuarantorsPerPage] = useState<number | 'ALL'>(20);
  const [guarantorsSortOrder, setGuarantorsSortOrder] = useState<'DESC' | 'ASC'>('DESC');

  // Reset pagination when filters change
  useEffect(() => {
    setClientsPage(1);
  }, [clientSearchTerm, filterWeekId, filterFinancieraId, filterSupervisorId, activeCompletionFilters]);

  useEffect(() => {
    setGuarantorsPage(1);
  }, [guarantorSearchTerm, filterWeekId, filterFinancieraId, filterSupervisorId, guarantorsSortOrder]);

  // CASCADE FILTER RESETS
  useEffect(() => {
    if (filterFinancieraId === 'ALL') return;
    
    // Validate supervisor belongs to financiera
    if (filterSupervisorId !== 'ALL') {
      const sup = data.supervisors.find(s => s.id === filterSupervisorId);
      if (sup && sup.financieraId !== filterFinancieraId) {
        setFilterSupervisorId('ALL');
      }
    }
    
    // Validate week belongs to financiera
    if (filterWeekId !== 'ALL' && filterWeekId !== 'CURRENT') {
      const week = data.weeks.find(w => w.id === filterWeekId);
      if (week && week.financieraId !== filterFinancieraId) {
        setFilterWeekId('CURRENT');
      }
    }
  }, [filterFinancieraId]);

  useEffect(() => {
    if (filterSupervisorId === 'ALL') return;
    const sup = data.supervisors.find(s => s.id === filterSupervisorId);
    if (!sup || !sup.financieraId) return;

    // Validate week against supervisor's financiera
    if (filterWeekId !== 'ALL' && filterWeekId !== 'CURRENT') {
      const week = data.weeks.find(w => w.id === filterWeekId);
      if (week && week.financieraId !== sup.financieraId) {
        setFilterWeekId('CURRENT');
      }
    }
  }, [filterSupervisorId]);

  const [supFinIdFilter, setSupFinIdFilter] = useState('ALL');

  // Filtered lists for dropdowns (Cascading)
  const [isMapFullScreen, setIsMapFullScreen] = useState(false);

  // Link filters: Financiera -> Supervisor -> Week
  useEffect(() => {
    // If we select a specific financiera, ensure the current supervisor belongs to it
    if (filterFinancieraId !== 'ALL') {
      const currentSup = data.supervisors.find(s => s.id === filterSupervisorId);
      if (currentSup && currentSup.financieraId !== filterFinancieraId) {
        setFilterSupervisorId('ALL');
      }
    }
  }, [filterFinancieraId, data.supervisors, filterSupervisorId]);

  useEffect(() => {
    // If we select a specific supervisor, ensure the current week belongs to their financiera
    if (filterSupervisorId !== 'ALL') {
      const sup = data.supervisors.find(s => s.id === filterSupervisorId);
      if (sup && sup.financieraId) {
        const currentWeek = data.weeks.find(w => w.id === filterWeekId);
        if (currentWeek && currentWeek.financieraId !== sup.financieraId) {
          setFilterWeekId('ALL');
        }
      }
    }
  }, [filterSupervisorId, data.weeks, filterWeekId]);

  const filteredWeeksForDropdown = data.weeks.filter(w => {
    if (filterFinancieraId !== 'ALL' && w.financieraId !== filterFinancieraId) return false;
    if (filterSupervisorId !== 'ALL') {
      const sup = data.supervisors.find(s => s.id === filterSupervisorId);
      if (sup && sup.financieraId && w.financieraId !== sup.financieraId) return false;
    }
    return true;
  }).sort((a,b) => b.startDate - a.startDate);

  const filteredSupervisorsForDropdown = data.supervisors.filter(s => {
    if (filterFinancieraId !== 'ALL' && s.financieraId !== filterFinancieraId) return false;
    return true;
  });

  // Mejoramos la lógica de filtrado para manejar ciclos independientes por financiera
  const uniqueGuarantors = React.useMemo(() => {
    const guarantorMap: Record<string, {
        name: string;
        address: string;
        cellphone: string;
        guarantorInstance: Guarantor;
        clients: { id: string, name: string }[];
        linkedClientId?: string;
    }> = {};

    // Filter clients based on current selection to build the guarantor directory contextually
    const sourceClients = data.clients.filter(c => {
        // 1. Filtro por Supervisor
        if (filterSupervisorId !== 'ALL' && c.supervisorId !== filterSupervisorId) return false;
        
        // 2. Filtro por Financiera
        if (filterFinancieraId !== 'ALL' && c.financieraId !== filterFinancieraId) return false;
        
        // 3. Filtro por Semana/Ciclo
        if (filterWeekId !== 'ALL') {
            if (filterWeekId === 'CURRENT') {
                const clientWeek = data.weeks.find(w => w.id === c.weekId);
                if (clientWeek) {
                    if (!clientWeek.isActive) return false;
                } else {
                    const activeWeek = data.weeks.find(w => w.isActive && w.financieraId === c.financieraId);
                    if (!activeWeek) return false;
                    const end = activeWeek.endDate || (activeWeek.startDate + 7 * 24 * 60 * 60 * 1000);
                    if (c.registeredAt < activeWeek.startDate || c.registeredAt > end) return false;
                }
            } else {
                if (c.weekId) {
                    if (c.weekId !== filterWeekId) return false;
                } else {
                    const targetWeek = data.weeks.find(w => w.id === filterWeekId);
                    if (!targetWeek) return false;
                    const end = targetWeek.endDate || (targetWeek.startDate + 7 * 24 * 60 * 60 * 1000);
                    if (c.registeredAt < targetWeek.startDate || c.registeredAt > end) return false;
                }
            }
        }

        // Hide archived by default for the guarantor consolidation to focus on active risks
        if (c.isArchived) return false;
        
        return true;
    });

    sourceClients.forEach(client => {
        // Collect from legacy field
        if (client.avalName) {
            const name = client.avalName.trim().toUpperCase();
            if (!guarantorMap[name]) {
                guarantorMap[name] = {
                    name: client.avalName.toUpperCase(),
                    address: client.avalAddress || '',
                    cellphone: client.avalCellphone || '',
                    guarantorInstance: { 
                        name: client.avalName, 
                        address: client.avalAddress, 
                        cellphone: client.avalCellphone,
                        facadeUrl: client.avalFacadeUrl,
                        photoUrl: client.avalPhotoUrl
                    },
                    clients: [],
                };
            }
            if (!guarantorMap[name].clients.some(c => c.id === client.id)) {
                guarantorMap[name].clients.push({ id: client.id, name: client.name });
            }
            if (!guarantorMap[name].address && client.avalAddress) guarantorMap[name].address = client.avalAddress;
            if (!guarantorMap[name].cellphone && client.avalCellphone) guarantorMap[name].cellphone = client.avalCellphone;
            if (!guarantorMap[name].guarantorInstance.photoUrl && client.avalPhotoUrl) guarantorMap[name].guarantorInstance.photoUrl = client.avalPhotoUrl;
            if (!guarantorMap[name].guarantorInstance.facadeUrl && client.avalFacadeUrl) guarantorMap[name].guarantorInstance.facadeUrl = client.avalFacadeUrl;
        }

        // Collect from modern array
        if (client.avales) {
            client.avales.forEach(aval => {
               if (!aval.name) return;
               const name = aval.name.trim().toUpperCase();
               if (!guarantorMap[name]) {
                   guarantorMap[name] = {
                       name: aval.name.toUpperCase(),
                       address: aval.address || '',
                       cellphone: aval.cellphone || '',
                       guarantorInstance: aval,
                       clients: [],
                   };
               }
               if (!guarantorMap[name].clients.some(c => c.id === client.id)) {
                guarantorMap[name].clients.push({ id: client.id, name: client.name });
               }
               if (!guarantorMap[name].address && aval.address) guarantorMap[name].address = aval.address;
               if (!guarantorMap[name].cellphone && aval.cellphone) guarantorMap[name].cellphone = aval.cellphone;
               if (!guarantorMap[name].guarantorInstance.photoUrl && aval.photoUrl) guarantorMap[name].guarantorInstance.photoUrl = aval.photoUrl;
               if (!guarantorMap[name].guarantorInstance.facadeUrl && aval.facadeUrl) guarantorMap[name].guarantorInstance.facadeUrl = aval.facadeUrl;
            });
        }
    });

    // Link with own credits (using full client list for overall verification)
    Object.keys(guarantorMap).forEach(name => {
        const clientFound = data.clients.find(c => c.name.trim().toUpperCase() === name && !c.isArchived);
        if (clientFound) {
            guarantorMap[name].linkedClientId = clientFound.id;
        }
    });

    const result = Object.values(guarantorMap);
    
    if (guarantorsSortOrder === 'DESC') {
        return result.sort((a,b) => b.clients.length - a.clients.length);
    } else {
        return result.sort((a,b) => a.clients.length - b.clients.length);
    }
  }, [data.clients, filterSupervisorId, filterFinancieraId, filterWeekId, guarantorsSortOrder]);

  const filteredGuarantors = uniqueGuarantors.filter(g => 
    g.name.toUpperCase().includes(guarantorSearchTerm.toUpperCase()) ||
    g.cellphone.includes(guarantorSearchTerm) ||
    g.address.toUpperCase().includes(guarantorSearchTerm.toUpperCase())
  );

  const totalGuarantorPages = React.useMemo(() => {
    if (guarantorsPerPage === 'ALL') return 1;
    return Math.ceil(filteredGuarantors.length / (guarantorsPerPage as number));
  }, [filteredGuarantors.length, guarantorsPerPage]);

  const paginatedGuarantors = React.useMemo(() => {
    if (guarantorsPerPage === 'ALL') return filteredGuarantors;
    const start = (guarantorsPage - 1) * (guarantorsPerPage as number);
    return filteredGuarantors.slice(start, start + (guarantorsPerPage as number));
  }, [filteredGuarantors, guarantorsPage, guarantorsPerPage]);

  const baseFilteredClients = data.clients.filter(c => {
      // 1. Filtro por Supervisor
      if (filterSupervisorId !== 'ALL' && c.supervisorId !== filterSupervisorId) return false;
      
      // 2. Filtro por Financiera
      if (filterFinancieraId !== 'ALL' && c.financieraId !== filterFinancieraId) return false;
      
      // 3. Filtro por Semana/Ciclo
      if (filterWeekId === 'ALL') return true;
      
      if (filterWeekId === 'CURRENT') {
          // Buscamos la semana asociada al cliente
          const clientWeek = data.weeks.find(w => w.id === c.weekId);
          if (clientWeek) {
              return clientWeek.isActive;
          } else {
              // Fallback para datos antiguos sin weekId
              // Buscamos si hay alguna semana activa para la financiera del cliente
              const activeWeek = data.weeks.find(w => w.isActive && w.financieraId === c.financieraId);
              if (!activeWeek) return false;
              const end = activeWeek.endDate || (activeWeek.startDate + 7 * 24 * 60 * 60 * 1000);
              return c.registeredAt >= activeWeek.startDate && c.registeredAt <= end;
          }
      } else {
          // Filtro por una semana específica
          if (c.weekId) return c.weekId === filterWeekId;
          const targetWeek = data.weeks.find(w => w.id === filterWeekId);
          if (!targetWeek) return false;
          const end = targetWeek.endDate || (targetWeek.startDate + 7 * 24 * 60 * 60 * 1000);
          return c.registeredAt >= targetWeek.startDate && c.registeredAt <= end;
      }
  }).filter(c => {
      if (!clientSearchTerm) return true;
      const search = clientSearchTerm.toLowerCase();
      return (
          c.name.toLowerCase().includes(search) ||
          c.id.toLowerCase().includes(search) ||
          (c.address && c.address.toLowerCase().includes(search))
      );
  });

  const filteredClients = baseFilteredClients.filter(c => {
      if (activeCompletionFilters.length === 0) return true;
      return activeCompletionFilters.every(filter => {
          if (filter === 'RENEWAL') {
              return c.isRenewal || data.visits.some(v => v.clientId === c.id && v.isRenewal);
          }
          const fin = data.financieras.find(f => f.id === c.financieraId);
          const isComplete = checkClientCompleteness(c, fin).isComplete;
          return filter === 'COMPLETE' ? isComplete : !isComplete;
      });
  }).sort((a, b) => (b.registeredAt || 0) - (a.registeredAt || 0));

  // Pagination for clients
  const totalClientPages = Math.ceil(filteredClients.length / clientsPerPage);
  const paginatedClients = filteredClients.slice(
      (clientsPage - 1) * clientsPerPage,
      clientsPage * clientsPerPage
  );
  
  const filteredSupervisors = data.supervisors.filter(sup => {
      if (supFinIdFilter !== 'ALL' && sup.financieraId !== supFinIdFilter) return false;
      if (supSearchTerm) {
          const search = supSearchTerm.toLowerCase();
          return (
              sup.name.toLowerCase().includes(search) ||
              sup.id.toLowerCase().includes(search) ||
              sup.pin.includes(search)
          );
      }
      return true;
  });

  const filteredVisits = data.visits.filter(v => {
      if (filterSupervisorId !== 'ALL' && v.supervisorId !== filterSupervisorId) return false;
      
      // Para visitas tambien validamos el ciclo
      if (filterWeekId === 'ALL') return true;
      
      if (filterWeekId === 'CURRENT') {
          const visitWeek = data.weeks.find(w => w.id === v.weekId);
          return visitWeek ? visitWeek.isActive : false;
      } else {
          return v.weekId === filterWeekId;
      }
  });

  const sortedBatches = [...data.qrBatches].sort((a, b) => b.createdAt - a.createdAt);

  useEffect(() => {
    if (data.settings) {
        setPrefix(data.settings.qrPrefix);
        setSequence(data.settings.nextSequence);
        setAppName(data.settings.appName || 'SUPER VisorApp');
        setLogoUrl(data.settings.logoUrl || '');
        setLogoGifUrl(data.settings.logoGifUrl || '');
        setVersionName(data.settings.versionName || 'SISTEMA V1.0');
        setVersionColor(data.settings.versionColor || '#4f46e5');
        setDesignVersion(data.settings.adminDesignVersion || 'v1');
        setFooterLogoUrl(data.settings.footerLogoUrl || '');
        setFooterInfoHtml(data.settings.footerInfoHtml || '');
        setReqFacade(data.settings.registrationRules?.requireFacade ?? true);
        setMinGuarantees(data.settings.registrationRules?.minGuarantees ?? (data.settings.registrationRules?.requireGuarantee ? 1 : 0));
    }
  }, [data.settings]);

  const handleSaveSettings = () => {
    onUpdateSettings(prefix, sequence, appName, { requireFacade: reqFacade, requireGuarantee: minGuarantees > 0, minGuarantees }, versionName, versionColor, logoUrl, designVersion, logoGifUrl, footerLogoUrl, footerInfoHtml);
    alert("Ajustes globales actualizados. La PWA se actualizará en unos instantes.");
  };

  const handleExportJSON = () => {
    try {
      const exportData = {
        tenant: {
          name: "Financiera Migrada",
          slug: "financiera-migrada",
          settings: data.settings,
          adminConfig: {
            name: "Admin",
            pin: "1234",
            permissions: {
              canAccessSettings: true,
              canManageSupervisors: true,
              canViewMap: true,
              canManageSystemUsers: true,
              canManageWeeks: true
            }
          }
        },
        supervisors: data.supervisors,
        clients: data.clients,
        visits: data.visits,
        qr_batches: data.qrBatches,
        system_users: data.systemUsers,
        weeks: data.weeks
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'migracion-datos.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error exporting data:", error);
      alert("Error al exportar los datos.");
    }
  };

  const startEditClient = (client: Client) => {
      setEditClientName(client.name);
      setEditClientAddress(client.address || '');
      setEditClientPhone(client.cellphone || '');
      setEditClientCredit(client.creditAmount || 0);
      setEditClientAvalName(client.avalName || '');
      setEditClientAvalAddress(client.avalAddress || '');
      setEditClientAvalPhone(client.avalCellphone || '');
      setEditClientGuarantees(client.guarantees || []);
      setIsEditingClient(true);
  };

  const handleSaveClient = () => {
      if (!selectedClientForDetails) return;
      onUpdateClient(selectedClientForDetails.id, {
          name: editClientName,
          address: editClientAddress,
          cellphone: editClientPhone,
          creditAmount: editClientCredit,
          avalName: editClientAvalName,
          avalAddress: editClientAvalAddress,
          avalCellphone: editClientAvalPhone,
          guarantees: editClientGuarantees
      });
      setSelectedClientForDetails({
          ...selectedClientForDetails,
          name: editClientName,
          address: editClientAddress,
          cellphone: editClientPhone,
          creditAmount: editClientCredit,
          avalName: editClientAvalName,
          avalAddress: editClientAvalAddress,
          avalCellphone: editClientAvalPhone,
          guarantees: editClientGuarantees
      });
      setIsEditingClient(false);
      alert("Cliente actualizado correctamente.");
  };

  const handleAddGuarantee = () => {
      if (!newGuaranteeDesc.trim()) return;
      setEditClientGuarantees([...editClientGuarantees, { description: newGuaranteeDesc.toUpperCase() }]);
      setNewGuaranteeDesc('');
  };

  const removeGuarantee = (index: number) => {
      setEditClientGuarantees(editClientGuarantees.filter((_, i) => i !== index));
  };

  const handleManualWeekSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualWeekName || !manualWeekDate) return;
    if (!selectedFinancieraForWeeks) {
        alert("Seleccione una financiera primero.");
        return;
    }
    const dateObj = new Date(manualWeekDate + 'T00:00:00');
    onAddManualWeek(manualWeekName, dateObj.getTime(), selectedFinancieraForWeeks);
    setManualWeekName(''); setManualWeekDate('');
    alert("Semana registrada.");
  };

  // SUPERVISOR HANDLERS
  const handleSupervisorSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!supName || !supPin || !supFinId) {
          alert("Complete nombre, PIN y seleccione una financiera.");
          return;
      }
      if (editingSup) {
          onUpdateSupervisor(editingSup.id, supName, supPin, supCanEdit, supCanArchive, supCanEditPhotos, supFinId);
          setEditingSup(null);
      } else {
          onAddSupervisor(supName, supPin, supCanEdit, supCanArchive, supCanEditPhotos, supFinId);
      }
      setSupName(''); setSupPin(''); setSupCanEdit(false); setSupCanArchive(false); setSupCanEditPhotos(false); setSupFinId('');
  };

  const startEditSup = (sup: Supervisor) => {
      setEditingSup(sup);
      setSupName(sup.name);
      setSupPin(sup.pin);
      setSupCanEdit(sup.canEditClients || false);
      setSupCanArchive(sup.canArchiveClients || false);
      setSupCanEditPhotos(sup.canEditPhotos || false);
      setSupFinId(sup.financieraId || '');
      setShowSupModal(true);
  };

  const cancelEditSup = () => {
      setEditingSup(null);
      setSupName('');
      setSupPin('');
      setSupCanEdit(false);
      setSupCanArchive(false);
      setSupCanEditPhotos(false);
      setSupFinId('');
  };

  const toggleSupervisorSelection = (id: string) => {
      setSelectedSupervisorIds(prev => 
          prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
      );
  };

  const toggleAllSupervisors = () => {
      if (selectedSupervisorIds.length === filteredSupervisors.length) {
          setSelectedSupervisorIds([]);
      } else {
          setSelectedSupervisorIds(filteredSupervisors.map(s => s.id));
      }
  };

  const handleBulkUpdate = () => {
      const updateData: Partial<Supervisor> = {};
      if (bulkFinId) updateData.financieraId = bulkFinId;
      if (bulkCanEdit !== null) updateData.canEditClients = bulkCanEdit;
      if (bulkCanArchive !== null) updateData.canArchiveClients = bulkCanArchive;

      if (Object.keys(updateData).length > 0) {
          onBatchUpdateSupervisors(selectedSupervisorIds, updateData);
          setSelectedSupervisorIds([]);
          setShowBulkEditModal(false);
          setBulkFinId('');
          setBulkCanEdit(null);
          setBulkCanArchive(null);
      }
  };

  // SYSTEM USER HANDLERS
  const toggleSysUserSupervisor = (supId: string) => {
      setSysUserSelectedSups(prev => 
        prev.includes(supId) ? prev.filter(id => id !== supId) : [...prev, supId]
      );
  };

  const toggleSysUserFinanciera = (finId: string) => {
      setSysUserSelectedFins(prev => {
        const isRemoving = prev.includes(finId);
        if (isRemoving) {
            const supsToRemove = fullSupervisorsList.filter(s => s.financieraId === finId).map(s => s.id);
            setSysUserSelectedSups(curr => curr.filter(id => !supsToRemove.includes(id)));
            return prev.filter(id => id !== finId);
        } else {
            return [...prev, finId];
        }
      });
  };

  const handleSysUserSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      const isManagingAdmins = settingsSubTab === 'administradores';
      const role = isManagingAdmins ? UserRole.ADMIN : UserRole.VIEWER;

      if (!sysUserName || !sysUserPin) {
          alert("Complete nombre y PIN.");
          return;
      }
      
      if (!isManagingAdmins && sysUserSelectedSups.length === 0 && sysUserSelectedFins.length === 0) {
          alert("Seleccione al menos un supervisor o financiera para el visor.");
          return;
      }

      if (editingSysUser) {
          onUpdateSystemUser(editingSysUser.id, sysUserName, sysUserPin, sysUserSelectedSups, sysUserCanCreateSups, sysUserCanManageWeeks, sysUserSelectedFins, role);
          setEditingSysUser(null);
      } else {
          onAddSystemUser(sysUserName, sysUserPin, sysUserSelectedSups, sysUserCanCreateSups, sysUserCanManageWeeks, sysUserSelectedFins, role);
      }
      setSysUserName(''); setSysUserPin(''); setSysUserSelectedSups([]); setSysUserCanCreateSups(false); setSysUserCanManageWeeks(false); setSysUserSelectedFins([]);
      setShowSysUserModal(false);
  };

  const startEditSysUser = (user: SystemUser) => {
      setEditingSysUser(user);
      setSysUserName(user.name);
      setSysUserPin(user.pin);
      setSysUserSelectedSups(user.assignedSupervisorIds || []);
      setSysUserCanCreateSups(user.canCreateSupervisors || false);
      setSysUserCanManageWeeks(user.canManageWeeks || false);
      setSysUserSelectedFins(user.assignedFinancieraIds || []);
      setShowSysUserModal(true);
  };

  const handleFinancieraSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!finName) return;
      if (editingFin) {
          onUpdateFinanciera(editingFin.id, finName, finMinGuarantees, finRequireClientPhoto, finRequireFacade, finLogoUrl, finGuarantorRules, finLogoGifUrl, finRequireGuaranteesForAval, finMinGuaranteesForAval, finRequireGuarantorPhoto, finRequireGuarantorFacade, finMaxClientActiveLoans, finMaxAvalRegistrations, finMaxClientAsAval);
          setEditingFin(null);
      } else {
          onAddFinanciera(finName, finMinGuarantees, finRequireClientPhoto, finRequireFacade, finLogoUrl, finGuarantorRules, finLogoGifUrl, finRequireGuaranteesForAval, finMinGuaranteesForAval, finRequireGuarantorPhoto, finRequireGuarantorFacade, finMaxClientActiveLoans, finMaxAvalRegistrations, finMaxClientAsAval);
      }
      setFinName('');
      setFinMinGuarantees(0);
      setFinRequireClientPhoto(false);
      setFinRequireFacade(false);
      setFinRequireGuaranteesForAval(false);
      setFinMinGuaranteesForAval(0);
      setFinRequireGuarantorPhoto(false);
      setFinRequireGuarantorFacade(true);
      setFinMaxClientActiveLoans(1);
      setFinMaxAvalRegistrations(2);
      setFinMaxClientAsAval(2);
      setFinLogoUrl('');
      setFinLogoGifUrl('');
      setFinGuarantorRules([]);
  };

  const addGuarantorRule = () => {
    if (!ruleMin || !ruleMax || !ruleGuarantors) return;
    const newRule: GuarantorRange = {
        minAmount: Number(ruleMin),
        maxAmount: Number(ruleMax),
        requiredGuarantors: Number(ruleGuarantors)
    };
    setFinGuarantorRules([...finGuarantorRules, newRule]);
    setRuleMin(''); setRuleMax(''); setRuleGuarantors('1');
  };

  const removeGuarantorRule = (index: number) => {
    setFinGuarantorRules(finGuarantorRules.filter((_, i) => i !== index));
  };

  useEffect(() => {
    if (activeTab === 'settings' && isViewer && viewerCanManageWeeks && !isSuperAdmin) {
      setSettingsSubTab('semanas');
    }
  }, [activeTab, isViewer, viewerCanManageWeeks, isSuperAdmin]);

  // Integrity Detection
  const getIntegrityAlert = (history?: DeviceMetadata[]) => {
    if (!history || history.length < 2) return 'low';
    const sorted = [...history].sort((a, b) => b.timestamp - a.timestamp);
    const last = sorted[0];
    const prev = sorted[1];
    const hardwareMatch = last.os === prev.os && 
                         last.browser === prev.browser && 
                         last.deviceType === prev.deviceType && 
                         last.screenResolution === prev.screenResolution && 
                         last.userAgent === prev.userAgent;
    if (!hardwareMatch) return 'high';
    if (last.ip !== prev.ip) return 'medium';
    return 'low';
  };

  const getIncidenceReasons = (current: DeviceMetadata, previous?: DeviceMetadata): string[] => {
    if (!previous) return [];
    const reasons: string[] = [];
    if (current.os !== previous.os) reasons.push("Sistema Operativo");
    if (current.browser !== previous.browser) reasons.push("Navegador Web");
    if (current.deviceType !== previous.deviceType) reasons.push("Tipo de Equipo");
    if (current.screenResolution !== previous.screenResolution) reasons.push("Resolución Pantalla");
    if (current.userAgent !== previous.userAgent) reasons.push("Hardware (UA)");
    if (current.ip !== previous.ip) reasons.push("Red / IP");
    if (current.memory !== previous.memory) reasons.push("Memoria RAM");
    if (current.cpuCores !== previous.cpuCores) reasons.push("Cores CPU");
    return reasons;
  };

  // QR Exports
  const handleDownloadJPGZip = async (batch: QRCodeBatch) => {
    setIsExporting(true);
    try {
      const zip = new JSZip();
      const folder = zip.folder(`Lote_JPG_${batch.id.substring(0,8)}`);
      if (!folder) return;
      const codesToExport = exportUnusedOnly ? batch.codes.filter(code => !data.clients.some(c => c.id === code)) : batch.codes;
      if (codesToExport.length === 0) { alert("No hay códigos."); return; }
      for (const code of codesToExport) {
          const canvas = document.createElement('canvas');
          await QRCode.toCanvas(canvas, code, { width: 600, margin: 2 });
          const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
          if (blob) folder.file(`${code}.jpg`, blob);
      }
      const content = await zip.generateAsync({ type: "blob" });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = `Lote_QR_JPG_${batch.id.substring(0,8)}.zip`;
      link.click();
    } catch (e) { alert("Error ZIP."); } finally { setIsExporting(false); }
  };

  const handleExportPDFBatch = async (batch: QRCodeBatch) => {
    setIsExporting(true);
    try {
      const doc = new jsPDF();
      let x = 10, y = 10;
      const codesToExport = exportUnusedOnly ? batch.codes.filter(code => !data.clients.some(c => c.id === code)) : batch.codes;
      if (codesToExport.length === 0) { alert("No hay códigos."); return; }
      for (const code of codesToExport) {
          const qrDataUrl = await QRCode.toDataURL(code);
          doc.addImage(qrDataUrl, 'PNG', x, y, 35, 35);
          doc.setFontSize(8);
          doc.text(code, x + 17, y + 38, { align: 'center' });
          x += 45;
          if (x > 160) { x = 10; y += 45; }
          if (y > 250) { doc.addPage(); x = 10; y = 10; }
      }
      doc.save(`PDF_QR_${batch.id.substring(0,8)}.pdf`);
    } catch (e) { alert("Error PDF."); } finally { setIsExporting(false); }
  };

  const handlePrintBatch = async (batch: QRCodeBatch) => {
    const codesToExport = exportUnusedOnly ? batch.codes.filter(code => !data.clients.some(c => c.id === code)) : batch.codes;
    if (codesToExport.length === 0) { alert("No hay códigos."); return; }
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    let html = `<html><head><style>body{display:flex;flex-wrap:wrap;gap:20px;font-family:sans-serif}.q{border:1px solid #eee;padding:10px;text-align:center;width:150px}img{width:130px;height:130px}p{margin:5px;font-weight:bold}</style></head><body>`;
    for (const code of codesToExport) {
      const qrDataUrl = await QRCode.toDataURL(code);
      html += `<div class="q"><img src="${qrDataUrl}" /><p>${code}</p></div>`;
    }
    html += `</body></html>`;
    printWindow.document.write(html); printWindow.document.close(); printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
  };

  // Helper to convert images to Base64 to bypass CORS in canvas
  const convertImgToBase64 = async (url: string): Promise<string> => {
    try {
      const response = await fetch(url, { mode: 'cors' }); // Attempt fetch
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.warn("Could not convert image to base64 (CORS likely):", url);
      return url; // Return original if fail, html2canvas will try its best
    }
  };

  const exportClientPDF = async (client: Client) => {
    setIsExporting(true);
    try {
        const input = document.getElementById('printable-report');
        if (!input) throw new Error("No element");

        // 1. Clonar el nodo para no modificar el DOM real
        const clone = input.cloneNode(true) as HTMLElement;
        clone.style.width = '800px'; // Forzar ancho para PDF consistente
        document.body.appendChild(clone);
        
        // 2. Encontrar todas las imágenes en el clon y convertirlas a Base64
        const images = clone.getElementsByTagName('img');
        for (let i = 0; i < images.length; i++) {
           const img = images[i];
           if (img.src && !img.src.startsWith('data:')) {
               // Show placeholder loading/processing could be nice but invisible here
               const base64 = await convertImgToBase64(img.src);
               img.src = base64;
               img.removeAttribute('crossorigin'); // Limpiar atributos problemáticos
           }
        }

        // 3. Generar Canvas desde el clon procesado
        const canvas = await html2canvas(clone, {
            useCORS: true, 
            scale: 2, 
            backgroundColor: '#ffffff',
            logging: false,
            allowTaint: true 
        });

        // 4. Limpiar
        document.body.removeChild(clone);

        // 5. PDF
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const imgWidth = canvas.width;
        const imgHeight = canvas.height;
        const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
        const imgX = (pdfWidth - imgWidth * ratio) / 2;

        pdf.addImage(imgData, 'PNG', imgX, 10, imgWidth * ratio, imgHeight * ratio);
        pdf.save(`Reporte_Full_${client.name.split(' ')[0]}_${client.id}.pdf`);

    } catch (e) { 
        console.error(e);
        if (confirm("Error generando PDF avanzado. ¿Usar impresión simple del navegador?")) {
             window.print(); // Fallback final
        }
    } finally { 
        setIsExporting(false); 
    }
  };

  const handleExportClientsPDF = () => {
    setIsExporting(true);
    try {
        const doc = new jsPDF();
        let y = 20;
        
        // Header
        doc.setFontSize(16);
        doc.text("Reporte de Supervisiones", 105, y, { align: "center" });
        y += 10;
        
        doc.setFontSize(10);
        doc.text(`Generado: ${new Date().toLocaleString()}`, 105, y, { align: "center" });
        y += 6;
        
        if (filterSupervisorId !== 'ALL') {
            const supName = data.supervisors.find(s => s.id === filterSupervisorId)?.name || 'Desconocido';
            doc.text(`Supervisora: ${supName}`, 105, y, { align: "center" });
            y += 10;
        } else {
            doc.text("Todos los Supervisores", 105, y, { align: "center" });
            y += 10;
        }

        doc.setLineWidth(0.5);
        doc.line(10, y, 200, y);
        y += 10;

        // Content
        doc.setFontSize(9);
        
        filteredClients.forEach((client, index) => {
            if (y > 270) {
                doc.addPage();
                y = 20;
            }

            const supervisorName = data.supervisors.find(s => s.id === client.supervisorId)?.name || 'N/A';
            
            const d = new Date(client.registeredAt);
            const day = d.getDate().toString().padStart(2, '0');
            const month = (d.getMonth() + 1).toString().padStart(2, '0');
            const year = d.getFullYear();
            let hours = d.getHours();
            const minutes = d.getMinutes().toString().padStart(2, '0');
            const ampm = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12;
            hours = hours ? hours : 12;
            const dateStr = `${day} - ${month} - ${year} (${hours.toString().padStart(2, '0')}:${minutes} ${ampm})`;

            const isArchived = client.isArchived ? "(ARCHIVADO)" : "";
            
            // Line 1: Name & ID & Credit
            doc.setFont("helvetica", "bold");
            doc.text(`${index + 1}. ${client.name} ${isArchived}`, 10, y);
            doc.setFont("helvetica", "normal");
            doc.text(`ID del QR: ${client.id}`, 120, y);
            doc.text(`Crédito: $${client.creditAmount || 0}`, 160, y);
            y += 5;

            if (filterSupervisorId === 'ALL') {
                // Line 2: Address & Phone
                doc.text(`Dir: ${client.address || 'Sin dirección'}`, 10, y);
                doc.text(`Tel: ${client.cellphone || 'N/A'}`, 120, y);
                y += 5;

                // Line 3: Supervisor & Date
                doc.text(`Supervisor: ${supervisorName}`, 10, y);
                doc.text(`Fecha Supervisión: ${dateStr}`, 120, y);
                y += 5;
            } else {
                // Line 2: Address (Full width)
                doc.text(`Dir: ${client.address || 'Sin dirección'}`, 10, y);
                y += 5;

                // Line 3: Phone & Date
                doc.text(`Tel: ${client.cellphone || 'N/A'}`, 10, y);
                doc.text(`Fecha Supervisión: ${dateStr}`, 120, y);
                y += 5;
            }

            // Line 4: Guarantees
            const guarantees = client.guarantees.map(g => g.description).join(", ") || "Ninguna";
            const splitGuarantees = doc.splitTextToSize(`Garantías: ${guarantees}`, 190);
            doc.text(splitGuarantees, 10, y);
            y += (splitGuarantees.length * 5);

            // Line 5: Aval
            if (client.avalName) {
                doc.text(`Aval: ${client.avalName} (${client.avalCellphone || 'N/A'}) - ${client.avalAddress || 'Sin dirección'}`, 10, y);
                y += 5;
            }

            // Separator
            doc.setDrawColor(200);
            doc.line(10, y, 200, y);
            y += 7;
        });

        const now = new Date();
        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const year = now.getFullYear();
        const dateStrFilename = `${day}-${month}-${year}`;

        let filterName = "Todos-Sup";
        if (filterSupervisorId !== 'ALL') {
            const sup = data.supervisors.find(s => s.id === filterSupervisorId);
            if (sup) {
                filterName = sup.name.toUpperCase().replace(/\s+/g, '-');
            }
        }

        doc.save(`Reporte_Clientes_${dateStrFilename}_${filterName}.pdf`);
    } catch (e) {
        alert("Error generando PDF");
        console.error(e);
    } finally {
        setIsExporting(false);
    }
  };

  const getWeekName = (weekId: string) => {
    const w = data.weeks.find(wk => wk.id === weekId);
    return w ? w.name : 'Semana Desconocida';
  };

  return (
    <div className="space-y-6">
      {/* Resumen Superior */}
      {activeTab === 'supervisors' && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cartera Total</p>
                <h3 className="text-xl font-black text-slate-800">{data.clients.length} Clientes</h3>
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Equipo</p>
                <h3 className="text-xl font-black text-slate-800">{data.supervisors.length} Supervisores</h3>
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm border border-indigo-100 flex justify-between items-center bg-indigo-50/30 col-span-1 md:col-span-1">
                <div>
                    <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Ciclo Activo</p>
                    <h3 className="text-[11px] font-black text-indigo-900 uppercase">
                        {data.weeks.filter(w => w.isActive).length > 1 
                            ? `${data.weeks.filter(w => w.isActive).length} CICLOS ACTIVOS`
                            : data.weeks.find(w => w.isActive)?.name || 'SISTEMA CERRADO'}
                    </h3>
                </div>
                <Calendar className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex flex-col justify-center col-span-1 md:col-span-1 overflow-hidden">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Accesos</p>
                <div className="flex -space-x-2 items-center">
                    {data.financieras.filter(f => f.logoUrl).map((f) => (
                        <div key={f.id} className="inline-block h-8 w-8 rounded-full ring-2 ring-white overflow-hidden bg-white shadow-sm" title={f.name}>
                            <img 
                                src={f.logoUrl} 
                                alt={f.name} 
                                className="h-full w-full object-contain"
                                referrerPolicy="no-referrer"
                            />
                        </div>
                    ))}
                    {data.financieras.filter(f => f.logoUrl).length === 0 && (
                        <div className="flex gap-1">
                            {data.financieras.slice(0, 3).map(f => (
                                <div key={f.id} className="h-6 px-2 bg-slate-50 border border-slate-200 rounded flex items-center">
                                    <span className="text-[8px] font-black text-slate-500 uppercase">{f.name.substring(0, 3)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 overflow-x-auto no-scrollbar bg-white rounded-t-xl px-2 shadow-sm">
        {[
          { id: 'supervisors', label: 'Supervisores' },
          { id: 'clients', label: 'Clientes' },
          { id: 'avales', label: 'Avales' },
          { id: 'map', label: 'Mapa' },
          { id: 'qrs', label: 'Lotes QR', adminOnly: true },
          { id: 'settings', label: 'Ajustes', adminOnly: true }
        ].map((tab) => {
           const canSee = (!tab.adminOnly) || isSuperAdmin || (tab.id === 'settings' && viewerCanManageWeeks);
           return canSee && (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`px-6 py-4 text-xs font-black uppercase transition-all whitespace-nowrap ${activeTab === tab.id ? 'border-b-4 border-indigo-600 text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>
              {tab.label}
            </button>
           );
        })}
      </div>

      <div className="bg-white rounded-b-xl shadow-sm border border-slate-100 min-h-[500px]">
        {/* SUPERVISORES */}
        {activeTab === 'supervisors' && (
            <div className="p-6">
                <h3 className="text-lg font-black uppercase text-slate-700 mb-6 tracking-tight flex items-center gap-2"><Users className="w-5 h-5"/> Administración de Supervisores</h3>
                
                {/* BUSCADOR Y FILTRO FINANCIERA */}
                <div className="flex flex-col sm:flex-row gap-4 mb-6">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input 
                            type="text" 
                            placeholder="BUSCAR SUPERVISOR POR NOMBRE O PIN..." 
                            value={supSearchTerm}
                            onChange={(e) => setSupSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold uppercase focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                        />
                    </div>
                    <select 
                        value={supFinIdFilter} 
                        onChange={(e) => setSupFinIdFilter(e.target.value)}
                        className="w-full sm:w-64 p-2.5 border border-slate-200 bg-white text-slate-900 text-[10px] font-black uppercase rounded-xl outline-none focus:ring-1 focus:ring-indigo-500 shadow-sm"
                    >
                        <option value="ALL">TODAS LAS FINANCIERAS</option>
                        {data.financieras.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                </div>
                
                {/* BOTÓN REGISTRAR SUPERVISOR */}
                <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        {selectedSupervisorIds.length > 0 && (
                            <div className="flex items-center gap-3 animate-in slide-in-from-left-2">
                                <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-3 py-2 rounded-xl border border-indigo-100 uppercase tracking-widest">
                                    {selectedSupervisorIds.length} Seleccionados
                                </span>
                                <button 
                                    onClick={() => setShowBulkEditModal(true)}
                                    className="bg-amber-500 text-white px-4 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-amber-100 hover:bg-amber-600 active:scale-95 transition-all flex items-center gap-2"
                                >
                                    <UserCog className="w-4 h-4" />
                                    Edición Lote
                                </button>
                                <button 
                                    onClick={() => setSelectedSupervisorIds([])}
                                    className="text-slate-400 hover:text-slate-600 p-2"
                                    title="Limpiar Selección"
                                >
                                    <RotateCcw className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                    </div>
                    
                    {(isSuperAdmin || (isViewer && viewerCanCreateSups)) && (
                        <button 
                            onClick={() => {
                                cancelEditSup();
                                setShowSupModal(true);
                            }}
                            className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-indigo-100 hover:bg-indigo-700 active:scale-95 transition-all flex items-center gap-2"
                        >
                            <UserPlus className="w-5 h-5" />
                            Registrar Supervisor (A)
                        </button>
                    )}
                </div>

                {/* MODAL REGISTRO/EDICIÓN SUPERVISOR */}
                {showSupModal && (
                    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in duration-200">
                            <div className="p-6 border-b flex justify-between items-center bg-indigo-600 text-white">
                                <h3 className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
                                    {editingSup ? <UserCog className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
                                    {editingSup ? 'Editar Supervisor' : 'Nuevo Supervisor'}
                                </h3>
                                <button 
                                    onClick={() => {
                                        setShowSupModal(false);
                                        cancelEditSup();
                                    }} 
                                    className="p-2 bg-white/20 hover:bg-white/30 rounded-full transition-colors"
                                >
                                    <X className="w-5 h-5"/>
                                </button>
                            </div>
                            <div className="p-6">
                                <form onSubmit={(e) => {
                                    handleSupervisorSubmit(e);
                                    setShowSupModal(false);
                                }} className="space-y-5">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Nombre Completo</label>
                                        <input 
                                            type="text" 
                                            value={supName} 
                                            onChange={e => setSupName(e.target.value.toUpperCase())} 
                                            placeholder="EJ: JUAN PÉREZ" 
                                            className="w-full p-4 border border-slate-200 bg-slate-50 text-slate-900 rounded-2xl text-sm uppercase font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                                            required 
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">PIN Acceso (4 Dígitos)</label>
                                            <input 
                                                type="text" 
                                                inputMode="numeric" 
                                                pattern="[0-9]*" 
                                                maxLength={4} 
                                                value={supPin} 
                                                onChange={e => setSupPin(e.target.value.replace(/\D/g,''))} 
                                                placeholder="0000" 
                                                className="w-full p-4 border border-slate-200 bg-slate-50 text-slate-900 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
                                                required 
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Asignar Financiera</label>
                                            <select 
                                                value={supFinId} 
                                                onChange={e => setSupFinId(e.target.value)} 
                                                className="w-full p-4 border border-slate-200 bg-slate-50 text-slate-900 rounded-2xl text-sm uppercase font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
                                                required
                                            >
                                                <option value="">SELECCIONAR...</option>
                                                {data.financieras.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-4">
                                        <label className="flex items-center gap-3 cursor-pointer group">
                                            <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${supCanEdit ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-200 group-hover:border-indigo-300'}`}>
                                                {supCanEdit && <CheckSquare className="w-4 h-4 text-white" />}
                                            </div>
                                            <input 
                                                type="checkbox" 
                                                checked={supCanEdit} 
                                                onChange={e => setSupCanEdit(e.target.checked)} 
                                                className="hidden" 
                                            />
                                            <div className="flex flex-col">
                                                <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider">Permitir Edición de Clientes</span>
                                                <span className="text-[9px] font-bold text-slate-400 uppercase">El supervisor podrá modificar datos de los clientes</span>
                                            </div>
                                        </label>

                                        <label className="flex items-center gap-3 cursor-pointer group">
                                            <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${supCanArchive ? 'bg-amber-600 border-amber-600' : 'bg-white border-slate-200 group-hover:border-amber-300'}`}>
                                                {supCanArchive && <CheckSquare className="w-4 h-4 text-white" />}
                                            </div>
                                            <input 
                                                type="checkbox" 
                                                checked={supCanArchive} 
                                                onChange={e => setSupCanArchive(e.target.checked)} 
                                                className="hidden" 
                                            />
                                            <div className="flex flex-col">
                                                <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider">Permitir Archivar Clientes</span>
                                                <span className="text-[9px] font-bold text-slate-400 uppercase">El supervisor podrá archivar clientes</span>
                                            </div>
                                        </label>

                                        <label className="flex items-center gap-3 cursor-pointer group">
                                            <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${supCanEditPhotos ? 'bg-emerald-600 border-emerald-600' : 'bg-white border-slate-200 group-hover:border-emerald-300'}`}>
                                                {supCanEditPhotos && <CheckSquare className="w-4 h-4 text-white" />}
                                            </div>
                                            <input 
                                                type="checkbox" 
                                                checked={supCanEditPhotos} 
                                                onChange={e => setSupCanEditPhotos(e.target.checked)} 
                                                className="hidden" 
                                            />
                                            <div className="flex flex-col">
                                                <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider">Permitir Editar Fotos</span>
                                                <span className="text-[9px] font-bold text-slate-400 uppercase">El supervisor podrá cambiar fotos de clientes y fachadas</span>
                                            </div>
                                        </label>
                                    </div>
                                    <div className="flex gap-3 pt-2">
                                        <button 
                                            type="button" 
                                            onClick={() => {
                                                setShowSupModal(false);
                                                cancelEditSup();
                                            }} 
                                            className="flex-1 bg-slate-100 text-slate-500 py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all"
                                        >
                                            Cancelar
                                        </button>
                                        <button 
                                            type="submit" 
                                            className="flex-[2] bg-indigo-600 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-indigo-100 hover:bg-indigo-700 active:scale-95 transition-all flex items-center justify-center gap-2"
                                        >
                                            {editingSup ? <Save className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                                            {editingSup ? 'Guardar Cambios' : 'Confirmar Registro'}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                )}
                
                {/* MODAL EDICIÓN POR LOTE SUPERVISORES */}
                {showBulkEditModal && (
                    <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-200">
                            <div className="p-6 border-b flex justify-between items-center bg-amber-600 text-white">
                                <h3 className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
                                    <UserCog className="w-5 h-5" />
                                    Edición por Lote ({selectedSupervisorIds.length})
                                </h3>
                                <button 
                                    onClick={() => setShowBulkEditModal(false)} 
                                    className="p-2 bg-white/20 hover:bg-white/30 rounded-full transition-colors"
                                >
                                    <X className="w-5 h-5"/>
                                </button>
                            </div>
                            <div className="p-6 space-y-6">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Cambiar Financiera (Opcional)</label>
                                    <select 
                                        value={bulkFinId} 
                                        onChange={e => setBulkFinId(e.target.value)} 
                                        className="w-full p-4 border border-slate-200 bg-slate-50 text-slate-900 rounded-2xl text-sm uppercase font-bold focus:ring-2 focus:ring-amber-500 outline-none transition-all" 
                                    >
                                        <option value="">SIN CAMBIOS</option>
                                        {data.financieras.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                    </select>
                                </div>

                                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-4">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Actualizar Permisos</p>
                                    
                                    <div className="grid grid-cols-1 gap-3">
                                        <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-200">
                                            <span className="text-[10px] font-black text-slate-600 uppercase">Edición de Clientes</span>
                                            <div className="flex gap-2">
                                                <button 
                                                    onClick={() => setBulkCanEdit(true)}
                                                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${bulkCanEdit === true ? 'bg-green-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                                                >
                                                    SÍ
                                                </button>
                                                <button 
                                                    onClick={() => setBulkCanEdit(false)}
                                                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${bulkCanEdit === false ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                                                >
                                                    NO
                                                </button>
                                                <button 
                                                    onClick={() => setBulkCanEdit(null)}
                                                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${bulkCanEdit === null ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                                                >
                                                    -
                                                </button>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-200">
                                            <span className="text-[10px] font-black text-slate-600 uppercase">Archivar Clientes</span>
                                            <div className="flex gap-2">
                                                <button 
                                                    onClick={() => setBulkCanArchive(true)}
                                                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${bulkCanArchive === true ? 'bg-green-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                                                >
                                                    SÍ
                                                </button>
                                                <button 
                                                    onClick={() => setBulkCanArchive(false)}
                                                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${bulkCanArchive === false ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                                                >
                                                    NO
                                                </button>
                                                <button 
                                                    onClick={() => setBulkCanArchive(null)}
                                                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${bulkCanArchive === null ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                                                >
                                                    -
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex gap-3 pt-2">
                                    <button 
                                        onClick={() => setShowBulkEditModal(false)} 
                                        className="flex-1 bg-slate-100 text-slate-500 py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all"
                                    >
                                        Cancelar
                                    </button>
                                    <button 
                                        onClick={handleBulkUpdate}
                                        className="flex-[2] bg-amber-600 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-amber-100 hover:bg-amber-700 active:scale-95 transition-all flex items-center justify-center gap-2"
                                    >
                                        <Save className="w-5 h-5" />
                                        Aplicar Cambios
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="border-b bg-slate-50 text-[10px] font-black uppercase text-slate-400">
                            <tr>
                                <th className="py-4 px-4 w-10">
                                    <button onClick={toggleAllSupervisors} className="p-1 hover:bg-slate-200 rounded transition-colors">
                                        {selectedSupervisorIds.length === filteredSupervisors.length && filteredSupervisors.length > 0 ? (
                                            <CheckSquare className="w-4 h-4 text-indigo-600" />
                                        ) : selectedSupervisorIds.length > 0 ? (
                                            <div className="w-4 h-4 bg-indigo-600 rounded flex items-center justify-center">
                                                <div className="w-2 h-0.5 bg-white"></div>
                                            </div>
                                        ) : (
                                            <Square className="w-4 h-4 text-slate-300" />
                                        )}
                                    </button>
                                </th>
                                <th className="py-4 px-4">Nombre</th>
                                <th className="py-4 px-4">Financiera</th>
                                <th className="py-4 px-4 text-center">PIN</th>
                                <th className="py-4 px-4 text-center">Permisos</th>
                                <th className="py-4 px-4 text-center">Auditoría</th>
                                <th className="py-4 px-4 text-center">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="text-sm">
                            {filteredSupervisors.map(sup => {
                                const integrity = getIntegrityAlert(sup.loginHistory);
                                const finName = data.financieras.find(f => f.id === sup.financieraId)?.name || 'SIN ASIGNAR';
                                const isSelected = selectedSupervisorIds.includes(sup.id);
                                return (
                                    <tr key={sup.id} className={`border-b transition-colors ${isSelected ? 'bg-indigo-50/50' : 'hover:bg-slate-50'}`}>
                                        <td className="py-4 px-4">
                                            <button onClick={() => toggleSupervisorSelection(sup.id)} className="p-1 hover:bg-indigo-100 rounded transition-colors">
                                                {isSelected ? (
                                                    <CheckSquare className="w-4 h-4 text-indigo-600" />
                                                ) : (
                                                    <Square className="w-4 h-4 text-slate-300" />
                                                )}
                                            </button>
                                        </td>
                                        <td className="py-4 px-4">
                                            <div className="flex items-center gap-3">
                                                {data.financieras.find(f => f.id === sup.financieraId)?.logoUrl ? (
                                                    <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 overflow-hidden shadow-sm flex items-center justify-center p-1 shrink-0">
                                                        <CachedImage src={data.financieras.find(f => f.id === sup.financieraId)!.logoUrl!} className="w-full h-full object-contain" />
                                                    </div>
                                                ) : (
                                                    <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-[10px] font-black text-indigo-600 shrink-0 uppercase">
                                                        {data.financieras.find(f => f.id === sup.financieraId)?.name?.substring(0, 2) || '??'}
                                                    </div>
                                                )}
                                                <span className="font-black uppercase text-slate-800 tracking-tight">{sup.name}</span>
                                            </div>
                                        </td>
                                        <td className="py-4 px-4 font-bold text-indigo-600 text-[10px] uppercase">{finName}</td>
                                        <td className="py-4 px-4 text-center font-mono font-bold text-slate-900">{isSuperAdmin || isViewer ? sup.pin : '****'}</td>
                                        <td className="py-4 px-4 text-center">
                                            {sup.canEditClients ? (
                                                <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-[9px] font-black uppercase border border-green-200">Edición</span>
                                            ) : (
                                                <span className="px-2 py-1 bg-slate-100 text-slate-500 rounded-full text-[9px] font-black uppercase border border-slate-200">Solo Lectura</span>
                                            )}
                                        </td>
                                        <td className="py-4 px-4 text-center">
                                            <div className="flex justify-center">
                                                {integrity === 'high' ? (
                                                    <div className="flex items-center gap-1.5 px-3 py-1 bg-red-100 text-red-600 rounded-full font-black text-[9px] uppercase animate-pulse">
                                                        <ShieldAlert className="w-3 h-3" /> Incidencia
                                                    </div>
                                                ) : integrity === 'medium' ? (
                                                    <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-100 text-amber-600 rounded-full font-black text-[9px] uppercase">
                                                        <Zap className="w-3 h-3" /> Cambio Red
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-100 text-emerald-600 rounded-full font-black text-[9px] uppercase">
                                                        <ShieldCheck className="w-3 h-3" /> Íntegro
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="py-4 px-4 text-center">
                                            <div className="flex justify-center gap-2">
                                                <button onClick={() => setSelectedSupervisorDetails(sup)} className="p-2 text-indigo-600 bg-indigo-50 rounded-full hover:bg-indigo-600 hover:text-white transition-all shadow-sm" title="Ver Auditoría">
                                                    <Eye className="w-4 h-4"/>
                                                </button>
                                                {(isSuperAdmin || (isViewer && viewerCanCreateSups)) && (
                                                    <button onClick={() => { startEditSup(sup); setShowSupModal(true); }} className="p-2 text-amber-600 bg-amber-50 rounded-full hover:bg-amber-600 hover:text-white transition-all shadow-sm" title="Editar">
                                                        <Pencil className="w-4 h-4"/>
                                                    </button>
                                                )}
                                                {(isSuperAdmin || (isViewer && viewerCanCreateSups)) && (
                                                    <button onClick={() => { if(confirm("¿Eliminar supervisor?")) onDeleteSupervisor(sup.id); }} className="p-2 text-red-600 bg-red-50 rounded-full hover:bg-red-600 hover:text-white transition-all shadow-sm" title="Eliminar">
                                                        <Trash2 className="w-4 h-4"/>
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        )}

        {/* CLIENTES */}
        {activeTab === 'clients' && (
            <div className="p-6">
                <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                    <h3 className="text-lg font-black uppercase text-slate-700 tracking-tight">Cartera de Clientes <span className="text-indigo-600">({filteredClients.length})</span></h3>
                    <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                        <button onClick={handleExportClientsPDF} className="bg-red-600 text-white px-4 py-2 rounded-lg text-[10px] font-black uppercase shadow-md hover:bg-red-700 transition-colors flex items-center gap-2">
                            <FileText className="w-4 h-4" /> PDF
                        </button>
                        <select value={filterFinancieraId} onChange={(e) => setFilterFinancieraId(e.target.value)} className="flex-1 sm:w-40 p-2 border border-slate-200 bg-white text-slate-900 text-[10px] font-black uppercase rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm">
                            <option value="ALL">TODAS LAS FIN.</option>
                            {data.financieras.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                        </select>
                        <select value={filterSupervisorId} onChange={(e) => setFilterSupervisorId(e.target.value)} className="flex-1 sm:w-40 p-2 border border-slate-200 bg-white text-slate-900 text-[10px] font-black uppercase rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm">
                            <option value="ALL">TODOS LOS SUP</option>
                            {filteredSupervisorsForDropdown.map(s => {
                                const fin = data.financieras.find(f => f.id === s.financieraId);
                                return <option key={s.id} value={s.id}>{s.name} ({fin?.name || 'S/F'})</option>;
                            })}
                        </select>
                        <select value={filterWeekId} onChange={(e) => setFilterWeekId(e.target.value)} className="flex-1 sm:w-40 p-2 border border-slate-200 bg-white text-slate-900 text-[10px] font-black uppercase rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm">
                            <option value="ALL">TODAS LAS SEMANAS</option>
                            <option value="CURRENT">SEMANA ACTUAL</option>
                            {filteredWeeksForDropdown.map(w => {
                                const fin = data.financieras.find(f => f.id === w.financieraId);
                                return <option key={w.id} value={w.id}>{w.name} ({fin?.name || 'S/F'})</option>;
                            })}
                        </select>
                    </div>
                </div>

                {(() => {
                    const totalFiltered = baseFilteredClients.length;
                    const completeFiltered = baseFilteredClients.filter(c => checkClientCompleteness(c, data.financieras.find(f => f.id === c.financieraId)).isComplete).length;
                    const incompleteFiltered = totalFiltered - completeFiltered;
                    const renewalsFiltered = baseFilteredClients.filter(c => c.isRenewal || data.visits.some(v => v.clientId === c.id && v.isRenewal)).length;

                    const toggleFilter = (filter: 'COMPLETE' | 'INCOMPLETE' | 'RENEWAL') => {
                        setActiveCompletionFilters(prev => {
                            if (prev.includes(filter)) {
                                return prev.filter(f => f !== filter);
                            } else {
                                let next = [...prev];
                                if (filter === 'COMPLETE') {
                                    next = next.filter(f => f !== 'INCOMPLETE');
                                } else if (filter === 'INCOMPLETE') {
                                    next = next.filter(f => f !== 'COMPLETE');
                                }
                                return [...next, filter];
                            }
                        });
                    };

                    const isAllActive = activeCompletionFilters.length === 0;
                    const isCompleteActive = activeCompletionFilters.includes('COMPLETE');
                    const isIncompleteActive = activeCompletionFilters.includes('INCOMPLETE');
                    const isRenewalActive = activeCompletionFilters.includes('RENEWAL');

                    return (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                            {/* Card 1: Total */}
                            <div 
                                onClick={() => setActiveCompletionFilters([])}
                                className={`relative overflow-hidden bg-gradient-to-br from-slate-50 to-white p-6 rounded-3xl border-2 flex items-center justify-between group cursor-pointer transition-all duration-300 ${isAllActive ? 'border-indigo-600 bg-white shadow-md ring-4 ring-indigo-500/10 scale-[1.02]' : 'border-slate-100 hover:border-indigo-200'}`}
                            >
                                <div className="space-y-1">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Clientes en Filtro</span>
                                    <span className="text-3xl font-black text-slate-800 tracking-tight block">{totalFiltered}</span>
                                </div>
                                <div className={`p-4 rounded-2xl transition-all duration-300 ${isAllActive ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white'}`}>
                                    <Users className="w-6 h-6" />
                                </div>
                            </div>

                            {/* Card 2: Completos */}
                            <div 
                                onClick={() => toggleFilter('COMPLETE')}
                                className={`relative overflow-hidden bg-gradient-to-br from-slate-50 to-white p-6 rounded-3xl border-2 flex items-center justify-between group cursor-pointer transition-all duration-300 ${isCompleteActive ? 'border-green-600 bg-white shadow-md ring-4 ring-green-500/10 scale-[1.02]' : 'border-slate-100 hover:border-green-200'}`}
                            >
                                <div className="space-y-1">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Clientes Completos</span>
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-3xl font-black text-slate-800 tracking-tight">{completeFiltered}</span>
                                        <span className={`text-xs font-black px-2 py-0.5 rounded-lg ${isCompleteActive ? 'bg-white text-green-700' : 'bg-green-50 text-green-600'}`}>
                                            {totalFiltered > 0 ? ((completeFiltered / totalFiltered) * 100).toFixed(0) : 0}%
                                        </span>
                                    </div>
                                </div>
                                <div className={`p-4 rounded-2xl transition-all duration-300 ${isCompleteActive ? 'bg-green-600 text-white' : 'bg-green-50 text-green-600 group-hover:bg-green-600 group-hover:text-white'}`}>
                                    <CheckCircle className="w-6 h-6" />
                                </div>
                            </div>

                            {/* Card 3: Incompletos */}
                            <div 
                                onClick={() => toggleFilter('INCOMPLETE')}
                                className={`relative overflow-hidden bg-gradient-to-br from-slate-50 to-white p-6 rounded-3xl border-2 flex items-center justify-between group cursor-pointer transition-all duration-300 ${isIncompleteActive ? 'border-rose-600 bg-white shadow-md ring-4 ring-rose-500/10 scale-[1.02]' : 'border-slate-100 hover:border-rose-200'}`}
                            >
                                <div className="space-y-1">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Clientes Incompletos</span>
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-3xl font-black text-slate-800 tracking-tight">{incompleteFiltered}</span>
                                        <span className={`text-xs font-black px-2 py-0.5 rounded-lg ${isIncompleteActive ? 'bg-white text-rose-700' : 'bg-rose-50 text-rose-600'}`}>
                                            {totalFiltered > 0 ? ((incompleteFiltered / totalFiltered) * 100).toFixed(0) : 0}%
                                        </span>
                                    </div>
                                </div>
                                <div className={`p-4 rounded-2xl transition-all duration-300 ${isIncompleteActive ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-600 group-hover:bg-rose-600 group-hover:text-white'}`}>
                                    <AlertTriangle className="w-6 h-6" />
                                </div>
                            </div>

                            {/* Card 4: Renovaciones */}
                            <div 
                                onClick={() => toggleFilter('RENEWAL')}
                                className={`relative overflow-hidden bg-gradient-to-br from-slate-50 to-white p-6 rounded-3xl border-2 flex items-center justify-between group cursor-pointer transition-all duration-300 ${isRenewalActive ? 'border-amber-600 bg-white shadow-md ring-4 ring-amber-500/10 scale-[1.02]' : 'border-slate-100 hover:border-amber-200'}`}
                            >
                                <div className="space-y-1">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Renovaciones</span>
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-3xl font-black text-slate-800 tracking-tight">{renewalsFiltered}</span>
                                        <span className={`text-xs font-black px-2 py-0.5 rounded-lg ${isRenewalActive ? 'bg-white text-amber-700' : 'bg-amber-50 text-amber-600'}`}>
                                            {totalFiltered > 0 ? ((renewalsFiltered / totalFiltered) * 100).toFixed(0) : 0}%
                                        </span>
                                    </div>
                                </div>
                                <div className={`p-4 rounded-2xl transition-all duration-300 ${isRenewalActive ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-600 group-hover:bg-amber-600 group-hover:text-white'}`}>
                                    <RotateCcw className="w-6 h-6" />
                                </div>
                            </div>
                        </div>
                    );
                })()}

                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                    <div className="relative w-full md:w-96 flex gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input 
                                type="text"
                                placeholder="BUSCAR POR NOMBRE, ID O DIRECCIÓN..."
                                value={clientSearchTerm}
                                onChange={(e) => setClientSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold uppercase focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                            />
                        </div>
                        {clientSearchTerm.length >= 3 && (
                            <button 
                                disabled={isSearchingGlobal}
                                onClick={async () => {
                                    setIsSearchingGlobal(true);
                                    try {
                                        // 1. Intentar como ID (Exacto)
                                        const foundById = await onFetchClient(clientSearchTerm.toUpperCase());
                                        
                                        // 2. Buscar por nombre (Prefijo)
                                        const foundByName = await onSearchClientsByName(clientSearchTerm);
                                        
                                        if (!foundById && foundByName.length === 0) {
                                            alert("No se encontraron coincidencias en la base de datos global.");
                                        } else {
                                            const total = (foundById ? 1 : 0) + foundByName.length;
                                            alert(`${total} cliente(s) cargado(s) desde el servidor.`);
                                        }
                                    } finally {
                                        setIsSearchingGlobal(false);
                                    }
                                }}
                                className={`bg-indigo-100 text-indigo-700 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase hover:bg-indigo-200 transition-all flex items-center gap-2 whitespace-nowrap ${isSearchingGlobal ? 'opacity-50 cursor-not-allowed' : ''}`}
                                title="Buscar en toda la base de datos"
                            >
                                {isSearchingGlobal ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} 
                                {isSearchingGlobal ? 'BUSCANDO...' : 'BUSCAR GLOBAL'}
                            </button>
                        )}
                    </div>
                    {selectedClientIds.size > 0 && (
                        <div className="bg-indigo-50 p-4 rounded-xl flex justify-between items-center flex-1 w-full border border-indigo-100">
                            <span className="text-sm font-bold text-indigo-900">{selectedClientIds.size} seleccionados</span>
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => setShowMoveWeekModal(true)}
                                    className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-[10px] font-black uppercase shadow-md hover:bg-indigo-700 transition-colors"
                                >
                                    Cambiar Fecha
                                </button>
                                {isSuperAdmin && (
                                    <button 
                                        onClick={() => setShowMoveFinancieraModal(true)}
                                        className="bg-amber-600 text-white px-4 py-2 rounded-lg text-[10px] font-black uppercase shadow-md hover:bg-amber-700 transition-colors"
                                    >
                                        Financiera
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="border-b bg-slate-50 text-[10px] font-black uppercase text-slate-400">
                            <tr>
                                <th className="py-4 px-4 w-12 text-center">
                                    <input 
                                        type="checkbox" 
                                        className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer"
                                        checked={filteredClients.length > 0 && selectedClientIds.size === filteredClients.length}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                setSelectedClientIds(new Set(filteredClients.map(c => c.id)));
                                            } else {
                                                setSelectedClientIds(new Set());
                                            }
                                        }}
                                    />
                                </th>
                                <th className="py-4 px-4 w-12 text-center">#</th>
                                <th className="py-4 px-4">Cliente</th>
                                <th className="py-4 px-4">Financiera</th>
                                <th className="py-4 px-4">Registró</th>
                                <th className="py-4 px-4 text-center">Crédito</th>
                                <th className="py-4 px-4 text-center">Última Visita</th>
                                <th className="py-4 px-4 text-center">Aval Verif.</th>
                                <th className="py-4 px-4 text-center">Estado</th>
                                <th className="py-4 px-4 text-center">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="text-sm">
                            {paginatedClients.map((client, index) => {
                                const realIndex = (clientsPage - 1) * clientsPerPage + index + 1;
                                const financiera = data.financieras.find(f => f.id === client.financieraId);
                                const completion = checkClientCompleteness(client, financiera);
                                
                                const regSupervisor = data.supervisors.find(s => s.id === client.registeredBySupervisorId || s.id === client.supervisorId);
                                const supervisorFirstName = regSupervisor ? regSupervisor.name.split(' ')[0].toUpperCase() : 'SIN ASIGNAR';
                                
                                // Calcular la última visita real
                                const clientVisits = data.visits.filter(v => v.clientId === client.id);
                                const lastVisit = clientVisits.length > 0 
                                    ? clientVisits.reduce((latest, current) => current.timestamp > latest.timestamp ? current : latest) 
                                    : null;

                                return (
                                    <tr 
                                        key={client.id} 
                                        onClick={() => setSelectedClientForDetails(client)}
                                        className={`border-b hover:bg-slate-50 transition-colors cursor-pointer ${client.isArchived ? 'bg-slate-50/50 grayscale opacity-70' : ''}`}
                                    >
                                        <td className="py-4 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                                            <input 
                                                type="checkbox" 
                                                className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer"
                                                checked={selectedClientIds.has(client.id)}
                                                onChange={(e) => {
                                                    const newSet = new Set(selectedClientIds);
                                                    if (e.target.checked) newSet.add(client.id);
                                                    else newSet.delete(client.id);
                                                    setSelectedClientIds(newSet);
                                                }}
                                            />
                                        </td>
                                        <td className="py-4 px-4 text-center font-bold text-slate-400 text-xs">{realIndex}</td>
                                        <td className="py-4 px-4 font-black uppercase text-slate-800 tracking-tight">
                                            <div className="flex items-center gap-3">
                                                {client.clientPhotoUrl && (
                                                    <div className="w-8 h-8 rounded-lg overflow-hidden border border-slate-100 flex-shrink-0 shadow-sm">
                                                        <CachedImage src={client.clientPhotoUrl} className="w-full h-full object-cover" />
                                                    </div>
                                                )}
                                                <div className="flex flex-col">
                                                    <span className="flex items-center gap-2">
                                                        {client.name} 
                                                        <span className="text-[9px] font-black text-indigo-400">({data.financieras.find(f => f.id === client.financieraId)?.name || 'S/F'})</span>
                                                    </span>
                                                    {client.isArchived && (
                                                        <span className="px-2 py-0.5 bg-red-100 text-red-600 text-[9px] rounded-full border border-red-200 inline-flex items-center gap-1 w-fit">
                                                            <Archive className="w-3 h-3" /> ARCHIVADO
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="py-4 px-4 font-bold text-indigo-600 text-[10px] uppercase">
                                            {data.financieras.find(f => f.id === client.financieraId)?.name || 'SIN ASIGNAR'}
                                        </td>
                                        <td className="py-4 px-4 font-black text-slate-600 text-[10px] uppercase">
                                            {supervisorFirstName}
                                        </td>
                                        <td className="py-4 px-4 text-center font-black text-indigo-600">${client.creditAmount || 0}</td>
                                        
                                        {/* COLUMNA DE ULTIMA VISITA */}
                                        <td className="py-4 px-4 text-center">
                                            <div className="flex justify-center">
                                                {lastVisit ? (
                                                    <div className="flex flex-col items-center">
                                                        <span className="text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg text-[10px] mobile:text-[11px] font-black tracking-tight uppercase whitespace-nowrap">
                                                            {new Date(lastVisit.timestamp).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()}
                                                        </span>
                                                        <span className="text-[9px] text-slate-400 font-bold tracking-tight mt-0.5 uppercase whitespace-nowrap">
                                                            {new Date(lastVisit.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    </div>
                                                ) : client.registeredAt ? (
                                                    <div className="flex flex-col items-center" title="Solo registro, sin visitas consecutivas aún">
                                                        <span className="text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg text-[10px] mobile:text-[11px] font-black tracking-tight uppercase whitespace-nowrap border border-indigo-100">
                                                            {new Date(client.registeredAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()}
                                                        </span>
                                                        <span className="text-[9px] text-indigo-500 font-extrabold tracking-tight mt-0.5 uppercase whitespace-nowrap">
                                                            REGISTRO INITIAL
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="text-[10px] text-slate-400 font-bold uppercase italic whitespace-nowrap bg-slate-50 px-2 py-1 rounded-md border border-slate-100">SIN VISITAS</span>
                                                )}
                                            </div>
                                        </td>

                                        {/* NUEVA COLUMNA AVAL */}
                                        <td className="py-4 px-4 text-center">
                                            <div className="flex justify-center">
                                                {client.avalFacadeUrl || client.avalVisitTimestamp ? (
                                                    <div className="p-1 bg-green-100 rounded-full" title="Aval Verificado">
                                                        <CheckCircle className="w-4 h-4 text-green-600" />
                                                    </div>
                                                ) : (
                                                    <div className="p-1 bg-amber-100 rounded-full" title="Aval Pendiente">
                                                        <Clock className="w-4 h-4 text-amber-600" />
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="py-4 px-4 text-center">
                                            <div className="flex justify-center group relative">
                                                {completion.isComplete ? (
                                                    <span className="px-2 py-1 bg-green-100 text-green-700 text-[10px] font-black uppercase rounded-lg border border-green-200 shadow-sm flex items-center gap-1">
                                                        <CheckCircle className="w-3 h-3" /> COMPLETO
                                                    </span>
                                                ) : (
                                                    <span className="px-2 py-1 bg-rose-100 text-rose-700 text-[10px] font-black uppercase rounded-lg border border-rose-200 shadow-sm flex items-center gap-1 cursor-help">
                                                        <AlertTriangle className="w-3 h-3" /> INCOMPLETO
                                                    </span>
                                                )}
                                                {!completion.isComplete && completion.missing.length > 0 && (
                                                    <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-xs bg-slate-900 text-white text-[10px] rounded-lg p-2 opacity-0 group-hover:opacity-100 transition-opacity z-50 text-left shadow-xl shadow-slate-900/20">
                                                        <div className="font-bold text-slate-300 mb-1 border-b border-slate-700 pb-1">FALTA INFORMACIÓN:</div>
                                                        <ul className="list-disc pl-4 space-y-0.5">
                                                            {completion.missing.map((m, i) => <li key={i}>{m}</li>)}
                                                        </ul>
                                                        {/* Tooltip arrow */}
                                                        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-900"></div>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="py-4 px-4 text-center">
                                            <div className="flex justify-center gap-2" onClick={(e) => e.stopPropagation()}>
                                                <button onClick={() => setSelectedClientForDetails(client)} className="p-2 text-indigo-600 bg-indigo-50 rounded-full hover:bg-indigo-100 transition-colors shadow-sm" title="Ver Detalle"><Eye className="w-4 h-4"/></button>
                                                {(isSuperAdmin || isViewer) && (
                                                    <button onClick={() => { setSelectedClientForDetails(client); startEditClient(client); }} className="p-2 text-amber-600 bg-amber-50 rounded-full hover:bg-amber-100 transition-colors shadow-sm" title="Editar Cliente"><Pencil className="w-4 h-4"/></button>
                                                )}
                                                {(isSuperAdmin || isViewer) && client.isArchived && (
                                                    <button 
                                                        onClick={() => { if(confirm("¿Restaurar cliente? Volverá a aparecer en la lista del supervisor.")) onUpdateClient(client.id, { isArchived: false }); }} 
                                                        className="p-2 text-emerald-600 bg-emerald-50 rounded-full hover:bg-emerald-100 transition-colors shadow-sm" 
                                                        title="Restaurar Cliente"
                                                    >
                                                        <RefreshCw className="w-4 h-4"/>
                                                    </button>
                                                )}
                                                {isSuperAdmin && (
                                                    <button onClick={() => { if(confirm("¿Eliminar cliente y sus visitas?")) onDeleteClient(client.id); }} className="p-2 text-red-600 bg-red-50 rounded-full hover:bg-red-100 transition-colors shadow-sm" title="Eliminar Cliente"><Trash2 className="w-4 h-4"/></button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* PAGINACION CLIENTES */}
                <div className="mt-8 flex flex-col md:flex-row justify-between items-center gap-6 pb-6 pt-4 border-t border-slate-100">
                    <div className="flex items-center gap-4">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Mostrar</span>
                        <select 
                            value={clientsPerPage} 
                            onChange={(e) => {
                                setClientsPerPage(Number(e.target.value));
                                setClientsPage(1);
                            }} 
                            className="p-2.5 border border-slate-200 bg-white text-slate-900 text-[10px] font-black uppercase rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                        >
                            <option value="40">40 CLIENTES</option>
                            <option value="100">100 CLIENTES</option>
                            <option value="200">200 CLIENTES</option>
                            <option value="300">300 CLIENTES</option>
                            <option value="500">500 CLIENTES</option>
                            <option value="1000">1000 CLIENTES</option>
                            <option value="999999">TODOS</option>
                        </select>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total: {filteredClients.length}</span>
                    </div>

                    <div className="flex items-center gap-2">
                        <button 
                            disabled={clientsPage === 1}
                            onClick={() => { setClientsPage(curr => Math.max(1, curr - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                            className="p-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <div className="flex items-center gap-1">
                            {Array.from({ length: Math.min(5, totalClientPages) }, (_, i) => {
                                let pageNum;
                                if (totalClientPages <= 5) pageNum = i + 1;
                                else if (clientsPage <= 3) pageNum = i + 1;
                                else if (clientsPage >= totalClientPages - 2) pageNum = totalClientPages - 4 + i;
                                else pageNum = clientsPage - 2 + i;

                                return (
                                    <button
                                        key={pageNum}
                                        onClick={() => { setClientsPage(pageNum); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                                        className={`w-10 h-10 rounded-xl text-[11px] font-black uppercase transition-all ${clientsPage === pageNum ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 scale-105' : 'bg-white border border-slate-200 text-slate-600 hover:border-indigo-300'}`}
                                    >
                                        {pageNum}
                                    </button>
                                );
                            })}
                        </div>
                        <button 
                            disabled={clientsPage === totalClientPages || totalClientPages === 0}
                            onClick={() => { setClientsPage(curr => Math.min(totalClientPages, curr + 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                            className="p-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* AVALES */}
        {activeTab === 'avales' && (
            <div className="p-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                    <div>
                        <h3 className="text-2xl font-black uppercase text-slate-800 tracking-tighter flex items-center gap-3">
                            <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
                                <UserCheck className="w-5 h-5"/> 
                            </div>
                            LISTADO DE AVALES
                        </h3>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1 ml-13">
                            Directorio Consolidado y Gestión de Riesgos
                        </p>
                    </div>
                    
                    <div className="bg-indigo-50 border border-indigo-100 rounded-2xl px-5 py-3 flex items-center gap-4 shadow-sm self-stretch md:self-auto">
                        <div className="flex flex-col">
                            <span className="text-[8px] font-black text-indigo-400 uppercase tracking-widest">Contexto Actual</span>
                            <span className="text-lg font-black text-indigo-700 leading-none">
                                {uniqueGuarantors.length} <span className="text-xs">AVALES</span>
                            </span>
                        </div>
                        <div className="w-px h-8 bg-indigo-200/50" />
                        <Users className="w-5 h-5 text-indigo-400" />
                    </div>
                </div>

                {/* PANEL DE CONTROL DE FILTROS */}
                <div className="bg-white border border-slate-200 rounded-[2rem] p-6 mb-8 shadow-sm">
                    <div className="flex flex-col gap-6">
                        {/* BUSCADOR PROMINENTE */}
                        <div className="relative">
                            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                            <input 
                                type="text" 
                                placeholder="BUSCAR AVAL POR NOMBRE, TELÉFONO O DIRECCIÓN..." 
                                value={guarantorSearchTerm}
                                onChange={(e) => setGuarantorSearchTerm(e.target.value)}
                                className="w-full pl-14 pr-6 py-4 bg-slate-50 border-2 border-transparent rounded-2xl text-sm font-black uppercase focus:bg-white focus:border-indigo-500/20 focus:ring-4 focus:ring-indigo-500/5 outline-none transition-all placeholder:text-slate-300 shadow-inner"
                            />
                        </div>

                        {/* SELECTORES DE CRITERIO */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                            {/* FILTRO FINANCIERA */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-3 flex items-center gap-1.5">
                                    <Building2 className="w-3 h-3 text-slate-400" /> Financiera
                                </label>
                                <select 
                                    value={filterFinancieraId}
                                    onChange={(e) => setFilterFinancieraId(e.target.value)}
                                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-[11px] font-black uppercase outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500/30 transition-all cursor-pointer appearance-none"
                                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1rem center', backgroundSize: '1em' }}
                                >
                                    <option value="ALL">TODAS LAS FINANCIERAS</option>
                                    {data.financieras.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                </select>
                            </div>

                            {/* FILTRO SUPERVISOR */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-3 flex items-center gap-1.5">
                                    <User className="w-3 h-3 text-slate-400" /> Supervisor
                                </label>
                                <select 
                                    value={filterSupervisorId}
                                    onChange={(e) => setFilterSupervisorId(e.target.value)}
                                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-[11px] font-black uppercase outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500/30 transition-all cursor-pointer appearance-none"
                                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1rem center', backgroundSize: '1em' }}
                                >
                                    <option value="ALL">TODOS LOS SUPERVISORES</option>
                                    {filteredSupervisorsForDropdown.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>

                            {/* FILTRO SEMANA */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-3 flex items-center gap-1.5">
                                    <Calendar className="w-3 h-3 text-slate-400" /> Ciclo / Semana
                                </label>
                                <select 
                                    value={filterWeekId}
                                    onChange={(e) => setFilterWeekId(e.target.value)}
                                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-[11px] font-black uppercase outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500/30 transition-all cursor-pointer appearance-none"
                                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1rem center', backgroundSize: '1em' }}
                                >
                                    <option value="ALL">HISTÓRICO TOTAL</option>
                                    {filteredWeeksForDropdown.map(w => (
                                            <option key={w.id} value={w.id}>
                                                {w.name} {w.isActive ? '(ACTIVA)' : ''}
                                            </option>
                                        ))
                                    }
                                </select>
                            </div>

                            {/* ORDENAMIENTO */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-3 flex items-center gap-1.5">
                                    <Filter className="w-3 h-3 text-slate-400" /> Prioridad
                                </label>
                                <select 
                                    value={guarantorsSortOrder}
                                    onChange={(e) => setGuarantorsSortOrder(e.target.value as 'DESC' | 'ASC')}
                                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-[11px] font-black uppercase outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500/30 transition-all cursor-pointer appearance-none"
                                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1rem center', backgroundSize: '1em' }}
                                >
                                    <option value="DESC">MÁS RESPALDOS (DESC)</option>
                                    <option value="ASC">MENOS RESPALDOS (ASC)</option>
                                </select>
                            </div>

                            {/* POR PÁGINA */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-3 flex items-center gap-1.5">
                                    <LayoutGrid className="w-3 h-3 text-slate-400" /> Ver
                                </label>
                                <select 
                                    value={guarantorsPerPage}
                                    onChange={(e) => setGuarantorsPerPage(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
                                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-[11px] font-black uppercase outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500/30 transition-all cursor-pointer appearance-none"
                                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1rem center', backgroundSize: '1em' }}
                                >
                                    <option value={20}>20 POR PÁG.</option>
                                    <option value={50}>50 POR PÁG.</option>
                                    <option value={100}>100 POR PÁG.</option>
                                    <option value="ALL">MOSTRAR TODO</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-900 text-[10px] font-black uppercase text-slate-300 tracking-widest">
                            <tr>
                                <th className="py-4 px-6 border-b border-slate-800">Aval / Datos Personales</th>
                                <th className="py-4 px-6 border-b border-slate-800">Crédito Vinculado</th>
                                <th className="py-4 px-6 border-b border-slate-800 text-center">Clientes Respaldados</th>
                                <th className="py-4 px-6 border-b border-slate-800 text-center">Estado</th>
                            </tr>
                        </thead>
                        <tbody className="text-xs divide-y divide-slate-200 bg-white">
                            {paginatedGuarantors.map((guarantor, idx) => (
                                <tr key={idx} className="odd:bg-white even:bg-slate-100/50 hover:bg-indigo-50/30 transition-colors group">
                                    <td className="py-4 px-6">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 bg-indigo-50 rounded-xl overflow-hidden flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-sm flex-shrink-0">
                                                {guarantor.guarantorInstance.photoUrl || guarantor.guarantorInstance.facadeUrl ? (
                                                    <CachedImage 
                                                        src={guarantor.guarantorInstance.photoUrl || guarantor.guarantorInstance.facadeUrl || ''} 
                                                        className="w-full h-full object-cover cursor-pointer"
                                                        onClick={() => {
                                                            // Since we don't have a specific modal for aval here, we can show a full screen view if we had one
                                                            // For now we just use the CachedImage which is already good
                                                        }}
                                                    />
                                                ) : (
                                                    <User className="w-6 h-6" />
                                                )}
                                            </div>
                                            <div>
                                                <div className="font-black text-slate-800 uppercase tracking-tight text-sm flex items-center gap-2">
                                                    {guarantor.name}
                                                    {guarantor.guarantorInstance.facadeUrl && guarantor.guarantorInstance.photoUrl && (
                                                        <span className="text-[8px] bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded uppercase font-black">2 FOTOS</span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-3 mt-1">
                                                    <span className="flex items-center gap-1 text-[10px] text-slate-400 font-bold">
                                                        <Smartphone className="w-3 h-3"/> {guarantor.cellphone || 'SIN TELÉFONO'}
                                                    </span>
                                                    <span className="flex items-center gap-1 text-[10px] text-slate-400 font-bold max-w-[200px] truncate" title={guarantor.address}>
                                                        <MapPin className="w-3 h-3"/> {guarantor.address || 'SIN DIRECCIÓN'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="py-4 px-6">
                                        {guarantor.linkedClientId ? (
                                            <div className="flex items-center gap-2">
                                                <span className="px-3 py-1 bg-green-100 text-green-700 rounded-lg text-[10px] font-black uppercase border border-green-200 flex items-center gap-1.5 shadow-sm">
                                                    <ShieldCheck className="w-3 h-3"/> TIENE CRÉDITO
                                                </span>
                                                <button 
                                                    onClick={() => {
                                                        const cl = data.clients.find(c => c.id === guarantor.linkedClientId);
                                                        if (cl) setSelectedClientForDetails(cl);
                                                    }}
                                                    className="p-1.5 bg-slate-100 text-slate-600 rounded-lg hover:bg-indigo-600 hover:text-white transition-all"
                                                    title="Ver su crédito"
                                                >
                                                    <Eye className="w-3 h-3"/>
                                                </button>
                                            </div>
                                        ) : (
                                            <span className="px-3 py-1 bg-slate-100 text-slate-400 rounded-lg text-[10px] font-black uppercase border border-slate-100 italic">
                                                SIN CRÉDITO PROPIO
                                            </span>
                                        )}
                                    </td>
                                    <td className="py-4 px-6">
                                        <div className="flex flex-col gap-2">
                                            {guarantor.clients.map((c, i) => (
                                                <button 
                                                    key={i}
                                                    onClick={() => {
                                                        const cl = data.clients.find(cli => cli.id === c.id);
                                                        if (cl) setSelectedClientForDetails(cl);
                                                    }}
                                                    className="flex items-center gap-2.5 group/cli hover:bg-slate-100 p-1.5 px-3 rounded-xl transition-all text-left w-full border border-transparent hover:border-slate-200 shadow-sm hover:shadow-md bg-white/50"
                                                >
                                                    <div className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-[9px] font-black group-hover/cli:bg-indigo-600 group-hover/cli:text-white transition-colors border border-indigo-100">
                                                        {c.name.charAt(0)}
                                                    </div>
                                                    <div className="flex flex-col overflow-hidden">
                                                        <span className="text-[10px] font-black text-slate-700 uppercase group-hover/cli:text-indigo-600 truncate">
                                                            {c.name}
                                                        </span>
                                                        <span className="text-[8px] text-slate-400 font-bold flex items-center gap-1">
                                                            <Hash className="w-2.5 h-2.5"/> {c.id}
                                                        </span>
                                                    </div>
                                                    <ArrowRight className="w-3 h-3 text-slate-300 ml-auto group-hover/cli:text-indigo-600 group-hover/cli:translate-x-1 transition-all" />
                                                </button>
                                            ))}
                                            {guarantor.clients.length === 0 && (
                                                <span className="text-[9px] text-slate-300 italic">SIN VINCULACIONES</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="py-4 px-6 text-center">
                                        {guarantor.clients.length >= 2 ? (
                                            <span className="px-2.5 py-1 bg-rose-50 text-rose-600 rounded-lg text-[10px] font-black uppercase border border-rose-100 flex items-center gap-1.5 justify-center">
                                                <AlertTriangle className="w-3 h-3"/> LÍMITE ALCANZADO
                                            </span>
                                        ) : (
                                            <span className="px-2.5 py-1 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-black uppercase border border-blue-100 flex items-center gap-1.5 justify-center">
                                                <CheckCircle className="w-3 h-3"/> DISPONIBLE
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {filteredGuarantors.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="py-20 text-center">
                                        <div className="flex flex-col items-center text-slate-300">
                                            <Search className="w-12 h-12 mb-4 opacity-10" />
                                            <p className="font-black uppercase text-xs tracking-widest">No se encontraron avales con ese criterio</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* PAGINACIÓN DE AVALES */}
                {guarantorsPerPage !== 'ALL' && totalGuarantorPages > 1 && (
                    <div className="mt-6 flex flex-col sm:flex-row justify-between items-center gap-4 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            Página {guarantorsPage} de {totalGuarantorPages} 
                            <span className="ml-2 text-slate-300">({filteredGuarantors.length} Avales totales)</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button 
                                disabled={guarantorsPage === 1}
                                onClick={() => { setGuarantorsPage(curr => Math.max(1, curr - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                                className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            
                            <div className="flex items-center gap-1">
                                {[...Array(totalGuarantorPages)].map((_, i) => {
                                    const p = i + 1;
                                    // Logic to show limited page numbers
                                    if (
                                        p === 1 || 
                                        p === totalGuarantorPages || 
                                        (p >= guarantorsPage - 1 && p <= guarantorsPage + 1)
                                    ) {
                                        return (
                                            <button
                                                key={p}
                                                onClick={() => { setGuarantorsPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                                                className={`w-8 h-8 rounded-lg text-[10px] font-black transition-all ${
                                                    guarantorsPage === p 
                                                    ? 'bg-indigo-600 text-white shadow-md' 
                                                    : 'text-slate-400 hover:bg-slate-100'
                                                }`}
                                            >
                                                {p}
                                            </button>
                                        );
                                    }
                                    if (p === 2 || p === totalGuarantorPages - 1) {
                                        return <span key={p} className="text-slate-300 px-1">...</span>;
                                    }
                                    return null;
                                })}
                            </div>

                            <button 
                                disabled={guarantorsPage === totalGuarantorPages}
                                onClick={() => { setGuarantorsPage(curr => Math.min(totalGuarantorPages, curr + 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                                className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        )}

        {/* MAPA */}
        {activeTab === 'map' && (
            <div className="p-6">
                 <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                    <h3 className="text-lg font-black uppercase text-slate-700 tracking-tight flex items-center gap-2"><MapIcon className="w-5 h-5"/> Mapa en Tiempo Real</h3>
                    <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                        <button 
                            onClick={() => setIsMapFullScreen(!isMapFullScreen)}
                            className="bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 hover:bg-indigo-100 transition-all border border-indigo-100"
                        >
                            <Monitor className="w-4 h-4" />
                            {isMapFullScreen ? 'Salir Pantalla Completa' : 'Pantalla Completa'}
                        </button>
                        <select value={filterFinancieraId} onChange={(e) => setFilterFinancieraId(e.target.value)} className="flex-1 sm:w-40 p-2 border border-slate-200 bg-white text-slate-900 text-[10px] font-black uppercase rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm">
                            <option value="ALL">TODAS LAS FIN.</option>
                            {data.financieras.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                        </select>
                        <select value={filterSupervisorId} onChange={(e) => setFilterSupervisorId(e.target.value)} className="flex-1 sm:w-40 p-2 border border-slate-200 bg-white text-slate-900 text-[10px] font-black uppercase rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm">
                            <option value="ALL">TODOS LOS SUP</option>
                            {filteredSupervisorsForDropdown.map(s => {
                                const fin = data.financieras.find(f => f.id === s.financieraId);
                                return <option key={s.id} value={s.id}>{s.name} ({fin?.name || 'S/F'})</option>;
                            })}
                        </select>
                        <select value={filterWeekId} onChange={(e) => setFilterWeekId(e.target.value)} className="flex-1 sm:w-40 p-2 border border-slate-200 bg-white text-slate-900 text-[10px] font-black uppercase rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm">
                            <option value="ALL">TODAS LAS SEMANAS</option>
                            <option value="CURRENT">SEMANA ACTUAL</option>
                            {filteredWeeksForDropdown.map(w => {
                                const fin = data.financieras.find(f => f.id === w.financieraId);
                                return <option key={w.id} value={w.id}>{w.name} ({fin?.name || 'S/F'})</option>;
                            })}
                        </select>
                    </div>
                </div>
                <div className={`${isMapFullScreen ? 'fixed inset-0 z-[200] rounded-none h-screen bg-white' : 'h-[600px] rounded-xl'} shadow-inner relative overflow-hidden border border-slate-200 transition-all`}>
                    <VisitsMap clients={filteredClients} visits={filteredVisits} supervisors={data.supervisors} financieras={data.financieras} onClientClick={setSelectedClientForDetails} />
                </div>
            </div>
        )}

        {/* LOTES QR */}
        {activeTab === 'qrs' && isSuperAdmin && (
            <div className="p-6">
                 <div className="flex flex-col md:flex-row justify-between items-end mb-8 gap-6 bg-slate-50 p-6 rounded-3xl border border-slate-100 shadow-sm">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full md:w-auto flex-1">
                        <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Prefijo Folios</label>
                            <input type="text" value={tempPrefix} onChange={e => setTempPrefix(e.target.value.toUpperCase())} className="w-full p-3 border border-slate-200 bg-white text-slate-900 font-bold rounded-xl outline-none text-sm uppercase focus:ring-2 focus:ring-indigo-500" placeholder="Ej: ZONA-A"/>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Cantidad QR</label>
                            <input type="number" min="1" max="100" value={qrCount} onChange={e => setQrCount(parseInt(e.target.value))} className="w-full p-3 border border-slate-200 bg-white text-slate-900 font-bold rounded-xl outline-none text-sm focus:ring-2 focus:ring-indigo-500"/>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Financiera</label>
                            <select value={qrFinId} onChange={e => setQrFinId(e.target.value)} className="w-full p-3 border border-slate-200 bg-white text-slate-900 font-bold rounded-xl outline-none text-sm uppercase focus:ring-2 focus:ring-indigo-500">
                                <option value="">SELECCIONAR...</option>
                                {data.financieras.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                            </select>
                        </div>
                    </div>
                    <button onClick={() => {
                        if (!qrFinId) { alert("Seleccione una financiera."); return; }
                        onGenerateQR(qrCount, tempPrefix, qrFinId);
                    }} className="w-full md:w-auto bg-indigo-600 text-white px-8 py-3.5 rounded-2xl font-black uppercase text-xs shadow-xl shadow-indigo-100 flex items-center justify-center gap-2 transition-all active:scale-95"><Plus className="w-4 h-4" /> Generar Lote QR</button>
                 </div>

                 <div className="flex items-center gap-4 mb-6 px-2">
                    <label className="flex items-center gap-3 cursor-pointer bg-white border border-slate-200 p-3 rounded-2xl shadow-sm hover:border-indigo-300 transition-colors">
                        <input type="checkbox" checked={exportUnusedOnly} onChange={e => setExportUnusedOnly(e.target.checked)} className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"/>
                        <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Exportar solo disponibles (No asignados)</span>
                    </label>
                 </div>

                 <div className="space-y-4">
                    {sortedBatches.map(batch => {
                        const usedCodes = batch.codes.filter(code => data.clients.some(c => c.id === code));
                        const availableCount = batch.codes.length - usedCodes.length;
                        const isExpanded = expandedBatchId === batch.id;
                        return (
                            <div key={batch.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden transition-all">
                                <div className="p-5 flex flex-col md:flex-row justify-between items-center gap-4 hover:bg-slate-50">
                                        <div className="flex items-center gap-4">
                                            <div className="p-3 bg-indigo-50 rounded-xl text-indigo-600"><QrCode className="w-6 h-6"/></div>
                                            <div>
                                                <p className="font-black text-slate-800 uppercase text-xs tracking-tight">LOTE {batch.id.substring(2,12)}</p>
                                                <div className="flex items-center gap-2">
                                                    <p className="text-[9px] text-slate-400 font-bold uppercase">{new Date(batch.createdAt).toLocaleString()}</p>
                                                    {batch.financieraId && (
                                                        <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-600 rounded text-[8px] font-bold uppercase">{data.financieras.find(f => f.id === batch.financieraId)?.name || 'FINANCIERA'}</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => handleExportPDFBatch(batch)} title="Descargar Etiquetas PDF" className="p-2.5 text-red-600 bg-red-50 rounded-xl hover:bg-red-600 hover:text-white transition-all shadow-sm"><FileText className="w-4 h-4"/></button>
                                        <button onClick={() => handleDownloadJPGZip(batch)} title="Descargar ZIP con JPGs" className="p-2.5 text-blue-600 bg-blue-50 rounded-xl hover:bg-blue-600 hover:text-white transition-all shadow-sm"><ImageIconLucide className="w-4 h-4"/></button>
                                        <button onClick={() => handlePrintBatch(batch)} title="Vista de Impresión Rápida" className="p-2.5 text-emerald-600 bg-emerald-50 rounded-xl hover:bg-emerald-600 hover:text-white transition-all shadow-sm"><Printer className="w-4 h-4"/></button>
                                        <button onClick={() => { if(confirm("¿Eliminar lote de QRs?")) onDeleteQRBatch(batch.id); }} className="p-2.5 text-red-600 bg-red-50 rounded-xl hover:bg-red-600 hover:text-white transition-all shadow-sm"><Trash2 className="w-4 h-4"/></button>
                                        <button onClick={() => setExpandedBatchId(isExpanded ? null : batch.id)} className="p-2.5 text-slate-600 bg-slate-100 rounded-xl shadow-sm">{isExpanded ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>}</button>
                                    </div>
                                </div>
                                {isExpanded && (
                                    <div className="px-5 pb-5 pt-2 border-t border-slate-100 bg-slate-50/50">
                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                                            {batch.codes.map(code => {
                                                const assignedClient = data.clients.find(c => c.id === code);
                                                return (
                                                    <div key={code} className={`p-2 rounded-xl border text-center transition-all ${assignedClient ? 'bg-slate-100 border-slate-200 opacity-60' : 'bg-white border-indigo-100 shadow-sm'}`}>
                                                        <p className="text-[10px] font-mono font-bold">{code}</p>
                                                        <p className="text-[8px] font-black uppercase truncate mt-1">{assignedClient ? <span className="text-indigo-600">{assignedClient.name}</span> : <span className="text-green-600">LIBRE</span>}</p>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                 </div>
            </div>
        )}

        {/* AJUSTES */}
        {activeTab === 'settings' && (isSuperAdmin || viewerCanManageWeeks) && (
            <div className="p-4 md:p-8 max-w-[1600px] w-full mx-auto">
                <div className="flex flex-col lg:flex-row gap-8 min-h-[750px]">
                    {/* Sidebar de Navegación de Ajustes */}
                    <aside className={`w-full ${isSettingsMenuExpanded ? 'lg:w-72' : 'lg:w-24'} flex flex-row lg:flex-col gap-2 overflow-x-auto no-scrollbar lg:overflow-visible bg-slate-50/50 p-4 rounded-[2.5rem] border border-slate-100/80 flex-shrink-0 backdrop-blur-sm transition-all duration-300`}>
                        {/* Botón de colapsar/desplegar en Desktop */}
                        <button 
                            onClick={() => setIsSettingsMenuExpanded(!isSettingsMenuExpanded)} 
                            className="hidden lg:flex items-center justify-center p-3.5 mb-2 rounded-2xl bg-white border border-slate-200/60 text-slate-500 hover:text-indigo-600 hover:shadow-sm active:scale-95 transition-all"
                            title={isSettingsMenuExpanded ? "Contraer menú" : "Desplegar menú"}
                        >
                            {isSettingsMenuExpanded ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>

                        {isSuperAdmin && (
                            <button 
                                onClick={() => setSettingsSubTab('general')} 
                                className={`flex-1 lg:flex-none flex items-center ${isSettingsMenuExpanded ? 'lg:justify-start' : 'lg:justify-center'} gap-3 px-5 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${settingsSubTab === 'general' ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-100 scale-[1.02]' : 'text-slate-500 hover:bg-white hover:shadow-sm hover:text-indigo-600'}`}
                            >
                                <Settings className="w-4 h-4 flex-shrink-0" />
                                <span className={`transition-all duration-200 ${isSettingsMenuExpanded ? 'opacity-100' : 'opacity-0 lg:hidden'}`}>General</span>
                            </button>
                        )}
                        {isSuperAdmin && (
                            <button 
                                onClick={() => setSettingsSubTab('financieras')} 
                                className={`flex-1 lg:flex-none flex items-center ${isSettingsMenuExpanded ? 'lg:justify-start' : 'lg:justify-center'} gap-3 px-5 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${settingsSubTab === 'financieras' ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-100 scale-[1.02]' : 'text-slate-500 hover:bg-white hover:shadow-sm hover:text-indigo-600'}`}
                            >
                                <DollarSign className="w-4 h-4 flex-shrink-0" />
                                <span className={`transition-all duration-200 ${isSettingsMenuExpanded ? 'opacity-100' : 'opacity-0 lg:hidden'}`}>Financieras</span>
                            </button>
                        )}
                        {(isSuperAdmin || viewerCanManageWeeks) && (
                            <button 
                                onClick={() => setSettingsSubTab('semanas')} 
                                className={`flex-1 lg:flex-none flex items-center ${isSettingsMenuExpanded ? 'lg:justify-start' : 'lg:justify-center'} gap-3 px-5 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${settingsSubTab === 'semanas' ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-100 scale-[1.02]' : 'text-slate-500 hover:bg-white hover:shadow-sm hover:text-indigo-600'}`}
                            >
                                <Calendar className="w-4 h-4 flex-shrink-0" />
                                <span className={`transition-all duration-200 ${isSettingsMenuExpanded ? 'opacity-100' : 'opacity-0 lg:hidden'}`}>Semanas</span>
                            </button>
                        )}
                        {isSuperAdmin && (
                            <button 
                                onClick={() => setSettingsSubTab('usuarios')} 
                                className={`flex-1 lg:flex-none flex items-center ${isSettingsMenuExpanded ? 'lg:justify-start' : 'lg:justify-center'} gap-3 px-5 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${settingsSubTab === 'usuarios' ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-100 scale-[1.02]' : 'text-slate-500 hover:bg-white hover:shadow-sm hover:text-indigo-600'}`}
                            >
                                <UserCog className="w-4 h-4 flex-shrink-0" />
                                <span className={`transition-all duration-200 ${isSettingsMenuExpanded ? 'opacity-100' : 'opacity-0 lg:hidden'}`}>Visores</span>
                            </button>
                        )}
                        {isSuperAdmin && (
                            <button 
                                onClick={() => setSettingsSubTab('administradores')} 
                                className={`flex-1 lg:flex-none flex items-center ${isSettingsMenuExpanded ? 'lg:justify-start' : 'lg:justify-center'} gap-3 px-5 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${settingsSubTab === 'administradores' ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-100 scale-[1.02]' : 'text-slate-500 hover:bg-white hover:shadow-sm hover:text-indigo-600'}`}
                            >
                                <ShieldCheck className="w-4 h-4 flex-shrink-0" />
                                <span className={`transition-all duration-200 ${isSettingsMenuExpanded ? 'opacity-100' : 'opacity-0 lg:hidden'}`}>Administradores</span>
                            </button>
                        )}
                        {isSuperAdmin && (
                            <button 
                                onClick={() => setSettingsSubTab('api')} 
                                className={`flex-1 lg:flex-none flex items-center ${isSettingsMenuExpanded ? 'lg:justify-start' : 'lg:justify-center'} gap-3 px-5 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${settingsSubTab === 'api' ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-100 scale-[1.02]' : 'text-slate-500 hover:bg-white hover:shadow-sm hover:text-indigo-600'}`}
                            >
                                <Zap className="w-4 h-4 flex-shrink-0" />
                                <span className={`transition-all duration-200 ${isSettingsMenuExpanded ? 'opacity-100' : 'opacity-0 lg:hidden'}`}>API Externa</span>
                            </button>
                        )}
                        {isSuperAdmin && (
                            <button 
                                onClick={() => setSettingsSubTab('mantenimiento')} 
                                className={`flex-1 lg:flex-none flex items-center ${isSettingsMenuExpanded ? 'lg:justify-start' : 'lg:justify-center'} gap-3 px-5 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${settingsSubTab === 'mantenimiento' ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-100 scale-[1.02]' : 'text-slate-500 hover:bg-white hover:shadow-sm hover:text-indigo-600'}`}
                            >
                                <FileJson className="w-4 h-4 flex-shrink-0" />
                                <span className={`transition-all duration-200 ${isSettingsMenuExpanded ? 'opacity-100' : 'opacity-0 lg:hidden'}`}>Sistema</span>
                            </button>
                        )}
                    </aside>

                    {/* Área de Contenido de Ajustes */}
                    <main className="flex-1 bg-white rounded-[2.5rem] border border-slate-100 p-6 md:p-10 shadow-xl shadow-slate-100/30 min-h-[750px] animate-in fade-in slide-in-from-right-4 duration-300">
                        
                        {/* SUBTAB: GENERAL */}
                        {settingsSubTab === 'general' && (
                            <div className="space-y-10">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <h3 className="text-2xl font-black text-slate-800 tracking-tight">Configuración General</h3>
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Personalización de la PWA y Reglas de Registro</p>
                                    </div>
                                    <div className="p-3 bg-indigo-50 rounded-2xl text-indigo-600">
                                        <Settings className="w-6 h-6" />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                    <div className="space-y-6">
                                        <div className="space-y-4">
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Nombre de la Aplicación</label>
                                                <input type="text" value={appName} onChange={e => setAppName(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 transition-all" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">URL del Logo (Icono Estático)</label>
                                                <input type="text" value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://..." className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 transition-all" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1 flex items-center gap-2">
                                                    <PlayCircle className="w-3 h-3 text-indigo-500"/> Logo Animado (GIF) - Pantalla Login
                                                </label>
                                                <input type="text" value={logoGifUrl} onChange={e => setLogoGifUrl(e.target.value)} placeholder="https://... (GIF)" className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 transition-all" />
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-1">
                                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Versión</label>
                                                    <input type="text" value={versionName} onChange={e => setVersionName(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 transition-all uppercase" />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Prefijo QR Global</label>
                                                    <input type="text" value={prefix} onChange={e => setPrefix(e.target.value.toUpperCase())} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 transition-all uppercase" />
                                                </div>
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Diseño del Panel</label>
                                                <div className="flex gap-3 p-2 bg-slate-50 rounded-2xl border border-slate-100">
                                                    <button 
                                                        onClick={() => setDesignVersion('v1')} 
                                                        className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${designVersion === 'v1' ? 'bg-white shadow-sm text-indigo-600 border border-indigo-100' : 'text-slate-400 hover:text-slate-600'}`}
                                                    >
                                                        Diseño V1
                                                    </button>
                                                    <button 
                                                        onClick={() => setDesignVersion('v2')} 
                                                        className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${designVersion === 'v2' ? 'bg-white shadow-sm text-indigo-600 border border-indigo-100' : 'text-slate-400 hover:text-slate-600'}`}
                                                    >
                                                        Diseño V2 (Moderno)
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Color de Identidad</label>
                                                <div className="flex flex-wrap gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                                    {BANNER_COLORS.map(c => (
                                                        <button 
                                                            key={c.hex} 
                                                            onClick={() => setVersionColor(c.hex)} 
                                                            className={`w-10 h-10 rounded-full border-4 shadow-sm transition-all ${versionColor === c.hex ? 'border-indigo-600 scale-110 shadow-lg' : 'border-white hover:scale-105'}`} 
                                                            style={{ backgroundColor: c.hex }} 
                                                        />
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="pt-4 border-t border-slate-100 space-y-4">
                                                <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-widest px-1">Configuración del Footer (Login)</h4>
                                                <div className="space-y-1">
                                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">URL Logotipo Footer</label>
                                                    <input type="text" value={footerLogoUrl} onChange={e => setFooterLogoUrl(e.target.value)} placeholder="https://..." className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 transition-all" />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Información Modal Footer (HTML/Texto)</label>
                                                    <textarea 
                                                        value={footerInfoHtml} 
                                                        onChange={e => setFooterInfoHtml(e.target.value)} 
                                                        placeholder="Contenido que aparecerá al dar clic en el logo del footer..." 
                                                        className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 transition-all min-h-[120px]" 
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-6">
                                        <div className="bg-indigo-50/50 p-6 rounded-[2rem] border border-indigo-100 space-y-6">
                                            <h4 className="text-[10px] font-black text-indigo-900 uppercase tracking-widest flex items-center gap-2">
                                                <ShieldCheck className="w-4 h-4" /> Reglas Globales (Fallback)
                                            </h4>
                                            
                                            <div className="space-y-4">
                                                <div className="p-4 bg-white rounded-2xl border border-indigo-100 shadow-sm space-y-3">
                                                    <div className="flex justify-between items-center">
                                                        <div className="flex flex-col">
                                                            <span className="text-xs font-black uppercase tracking-widest text-slate-700">Garantías Mínimas Global</span>
                                                            <span className="text-[9px] font-bold text-slate-400 uppercase">Si la financiera no tiene regla propia</span>
                                                        </div>
                                                        <div className="flex items-center gap-3 bg-slate-50 p-1 rounded-xl border border-slate-100">
                                                            <button onClick={() => setMinGuarantees(Math.max(0, minGuarantees - 1))} className="w-8 h-8 flex items-center justify-center bg-white rounded-lg shadow-sm text-slate-600 hover:text-indigo-600 transition-all">-</button>
                                                            <span className="w-8 text-center font-black text-indigo-600">{minGuarantees}</span>
                                                            <button onClick={() => setMinGuarantees(Math.min(10, minGuarantees + 1))} className="w-8 h-8 flex items-center justify-center bg-white rounded-lg shadow-sm text-slate-600 hover:text-indigo-600 transition-all">+</button>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="space-y-1">
                                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Siguiente Secuencia QR</label>
                                                    <input type="text" value={sequence} onChange={e => setSequence(e.target.value)} className="w-full p-4 bg-white border border-indigo-100 rounded-2xl font-bold text-indigo-600 outline-none focus:ring-2 focus:ring-indigo-500 transition-all" />
                                                </div>
                                            </div>
                                        </div>

                                        <button 
                                            onClick={handleSaveSettings} 
                                            className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-black uppercase text-xs shadow-xl shadow-indigo-200 flex items-center justify-center gap-3 active:scale-[0.98] transition-all hover:bg-indigo-700"
                                        >
                                            <Save className="w-5 h-5"/> Guardar Cambios Globales
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* SUBTAB: FINANCIERAS */}
                        {settingsSubTab === 'financieras' && (
                            <div className="space-y-8">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <h3 className="text-2xl font-black text-slate-800 tracking-tight">Gestión de Financieras</h3>
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Administra las entidades financieras del sistema</p>
                                    </div>
                                    <div className="p-3 bg-emerald-50 rounded-2xl text-emerald-600">
                                        <DollarSign className="w-6 h-6" />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                                    <div className="lg:col-span-1 space-y-6">
                                        <form onSubmit={handleFinancieraSubmit} className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-6">
                                            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                                                <div className="p-2 bg-indigo-50 rounded-xl text-indigo-600">
                                                    <Plus className="w-4 h-4" />
                                                </div>
                                                <h4 className="text-xs font-black text-slate-800 uppercase tracking-tight">{editingFin ? 'Editar Financiera' : 'Nueva Financiera'}</h4>
                                            </div>

                                            <div className="space-y-5">
                                                <div className="space-y-1.5">
                                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Nombre de la Entidad</label>
                                                    <input 
                                                        type="text" 
                                                        value={finName} 
                                                        onChange={e => setFinName(e.target.value.toUpperCase())} 
                                                        placeholder="EJ: FINANCIERA DEL NORTE" 
                                                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all uppercase text-xs" 
                                                        required 
                                                    />
                                                </div>

                                                <div className="space-y-1.5">
                                                     <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">URL del Logotipo (Estático)</label>
                                                     <div className="relative">
                                                         <ImageIconLucide className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                                         <input 
                                                             type="text" 
                                                             value={finLogoUrl} 
                                                             onChange={e => setFinLogoUrl(e.target.value)} 
                                                             placeholder="https://..." 
                                                             className="w-full p-4 pl-11 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-xs" 
                                                         />
                                                     </div>
                                                 </div>

                                                 <div className="space-y-1.5">
                                                     <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1 flex items-center gap-1">
                                                        <PlayCircle className="w-3 h-3 text-indigo-500"/> Logo Animado (GIF)
                                                     </label>
                                                     <div className="relative">
                                                         <ImageIconLucide className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                                         <input 
                                                             type="text" 
                                                             value={finLogoGifUrl} 
                                                             onChange={e => setFinLogoGifUrl(e.target.value)} 
                                                             placeholder="https://... (GIF)" 
                                                             className="w-full p-4 pl-11 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-xs" 
                                                         />
                                                     </div>
                                                 </div>

                                                 <div className="grid grid-cols-1 gap-4">
                                                    <div className="space-y-1.5">
                                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Garantías Mínimas</label>
                                                        <div className="relative">
                                                            <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                                            <input 
                                                                type="number" 
                                                                min="0"
                                                                value={finMinGuarantees} 
                                                                onChange={e => setFinMinGuarantees(parseInt(e.target.value) || 0)} 
                                                                placeholder="0" 
                                                                className="w-full p-4 pl-11 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-xs" 
                                                            />
                                                        </div>
                                                        <p className="text-[9px] text-slate-400 font-medium px-1 italic">0 = Usar ajuste global</p>
                                                    </div>

                                                    <label className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-200 cursor-pointer hover:border-indigo-300 hover:bg-white transition-all group">
                                                        <div className="flex items-center gap-3">
                                                            <div className={`p-2 rounded-lg transition-colors ${finRequireClientPhoto ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-200 text-slate-400'}`}>
                                                                <Camera className="w-4 h-4" />
                                                            </div>
                                                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-700">Foto del Cliente</span>
                                                        </div>
                                                        <input 
                                                            type="checkbox" 
                                                            checked={finRequireClientPhoto} 
                                                            onChange={e => setFinRequireClientPhoto(e.target.checked)} 
                                                            className="w-5 h-5 text-indigo-600 rounded-lg focus:ring-indigo-500 border-slate-300" 
                                                        />
                                                    </label>

                                                    <label className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-200 cursor-pointer hover:border-indigo-300 hover:bg-white transition-all group">
                                                        <div className="flex items-center gap-3">
                                                            <div className={`p-2 rounded-lg transition-colors ${finRequireFacade ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-200 text-slate-400'}`}>
                                                                <Home className="w-4 h-4" />
                                                            </div>
                                                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-700">Foto de Fachada</span>
                                                        </div>
                                                        <input 
                                                            type="checkbox" 
                                                            checked={finRequireFacade} 
                                                            onChange={e => setFinRequireFacade(e.target.checked)} 
                                                            className="w-5 h-5 text-indigo-600 rounded-lg focus:ring-indigo-500 border-slate-300" 
                                                        />
                                                    </label>

                                                    <label className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-200 cursor-pointer hover:border-indigo-300 hover:bg-white transition-all group">
                                                        <div className="flex items-center gap-3">
                                                            <div className={`p-2 rounded-lg transition-colors ${finRequireGuaranteesForAval ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-200 text-slate-400'}`}>
                                                                <ShieldCheck className="w-4 h-4" />
                                                            </div>
                                                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-700">Garantías para Aval</span>
                                                        </div>
                                                        <input 
                                                            type="checkbox" 
                                                            checked={finRequireGuaranteesForAval} 
                                                            onChange={e => setFinRequireGuaranteesForAval(e.target.checked)} 
                                                            className="w-5 h-5 text-indigo-600 rounded-lg focus:ring-indigo-500 border-slate-300" 
                                                        />
                                                    </label>

                                                    <label className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 cursor-pointer">
                                                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">¿Pedir Foto del Aval?</span>
                                                        <input 
                                                            type="checkbox" 
                                                            checked={finRequireGuarantorPhoto} 
                                                            onChange={e => setFinRequireGuarantorPhoto(e.target.checked)} 
                                                            className="w-5 h-5 text-indigo-600 rounded-lg focus:ring-indigo-500 border-slate-300" 
                                                        />
                                                    </label>

                                                    <label className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 cursor-pointer">
                                                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">¿Pedir Fachada del Aval?</span>
                                                        <input 
                                                            type="checkbox" 
                                                            checked={finRequireGuarantorFacade} 
                                                            onChange={e => setFinRequireGuarantorFacade(e.target.checked)} 
                                                            className="w-5 h-5 text-indigo-600 rounded-lg focus:ring-indigo-500 border-slate-300" 
                                                        />
                                                    </label>

                                                    <div className="space-y-3 pt-2 border-t border-slate-100">
                                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Límites de Operación</p>
                                                        
                                                        <div className="space-y-1.5">
                                                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-1">Préstamos Activos por Persona</label>
                                                            <input 
                                                                type="number" 
                                                                min="1"
                                                                value={finMaxClientActiveLoans} 
                                                                onChange={e => setFinMaxClientActiveLoans(parseInt(e.target.value) || 1)} 
                                                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none text-xs" 
                                                            />
                                                        </div>

                                                        <div className="space-y-1.5">
                                                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-1">Límite de Avales (No-Clientes)</label>
                                                            <input 
                                                                type="number" 
                                                                min="0"
                                                                value={finMaxAvalRegistrations} 
                                                                onChange={e => setFinMaxAvalRegistrations(parseInt(e.target.value) || 0)} 
                                                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none text-xs" 
                                                            />
                                                        </div>

                                                        <div className="space-y-1.5">
                                                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-1">Límite de Avales (Clientes Activos)</label>
                                                            <input 
                                                                type="number" 
                                                                min="0"
                                                                value={finMaxClientAsAval} 
                                                                onChange={e => setFinMaxClientAsAval(parseInt(e.target.value) || 0)} 
                                                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none text-xs" 
                                                            />
                                                        </div>
                                                    </div>

                                                    {finRequireGuaranteesForAval && (
                                                        <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100 space-y-3 animate-in fade-in slide-in-from-top-2">
                                                            <div className="flex items-center justify-between">
                                                                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600">Mínimo de Garantías Aval</span>
                                                                <span className="text-sm font-black text-indigo-600">{finMinGuaranteesForAval}</span>
                                                            </div>
                                                            <input 
                                                                type="range" 
                                                                min="0" 
                                                                max="10" 
                                                                value={finMinGuaranteesForAval} 
                                                                onChange={e => setFinMinGuaranteesForAval(parseInt(e.target.value))}
                                                                className="w-full h-2 bg-indigo-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                                            />
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="pt-4 border-t border-slate-100 flex flex-col gap-4">
                                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1 flex items-center gap-2">
                                                        <Users className="w-3 h-3" /> Reglas de Avales por Monto
                                                    </h4>
                                                    <div className="grid grid-cols-3 gap-2">
                                                        <div className="space-y-1">
                                                            <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest px-1">Min ($)</label>
                                                            <input type="number" value={ruleMin} onChange={e => setRuleMin(e.target.value)} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none text-[10px]" placeholder="0" />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest px-1">Max ($)</label>
                                                            <input type="number" value={ruleMax} onChange={e => setRuleMax(e.target.value)} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none text-[10px]" placeholder="5000" />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest px-1">Avales</label>
                                                            <div className="flex gap-1">
                                                                <select value={ruleGuarantors} onChange={e => setRuleGuarantors(e.target.value)} className="flex-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none text-[10px]">
                                                                    <option value="1">1</option>
                                                                    <option value="2">2</option>
                                                                    <option value="3">3</option>
                                                                </select>
                                                                <button type="button" onClick={addGuarantorRule} className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-100 active:scale-90 transition-all"><Plus className="w-4 h-4" /></button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="space-y-2">
                                                        {finGuarantorRules.length === 0 && <p className="text-[9px] text-slate-300 font-bold italic px-1">No hay reglas definidas</p>}
                                                        {finGuarantorRules.map((rule, idx) => (
                                                            <div key={idx} className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-2xl shadow-sm animate-in fade-in slide-in-from-top-1">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400"></div>
                                                                    <span className="text-[10px] font-bold text-slate-800">${rule.minAmount} - ${rule.maxAmount}</span>
                                                                    <span className="text-[10px] font-black text-indigo-600">→ {rule.requiredGuarantors} {rule.requiredGuarantors === 1 ? 'Aval' : 'Avales'}</span>
                                                                </div>
                                                                <button type="button" onClick={() => removeGuarantorRule(idx)} className="p-2 text-red-400 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex gap-3 pt-2">
                                                {editingFin && (
                                                    <button 
                                                        type="button" 
                                                        onClick={() => { setEditingFin(null); setFinName(''); setFinMinGuarantees(0); setFinRequireClientPhoto(false); setFinRequireFacade(false); setFinRequireGuaranteesForAval(false); setFinMinGuaranteesForAval(0); setFinRequireGuarantorPhoto(false); setFinRequireGuarantorFacade(true); setFinMaxClientActiveLoans(1); setFinMaxAvalRegistrations(2); setFinMaxClientAsAval(2); setFinLogoUrl(''); setFinLogoGifUrl(''); }} 
                                                        className="flex-1 bg-white text-slate-400 py-4 rounded-2xl font-black text-[10px] uppercase border border-slate-200 hover:bg-slate-50 transition-all"
                                                    >
                                                        Cancelar
                                                    </button>
                                                )}
                                                <button 
                                                    type="submit" 
                                                    className="flex-[2] bg-indigo-900 text-white py-4 rounded-2xl font-black text-[10px] uppercase shadow-lg active:scale-95 transition-all hover:bg-black flex items-center justify-center gap-2"
                                                >
                                                    <Save className="w-4 h-4" />
                                                    {editingFin ? 'Actualizar' : 'Registrar'}
                                                </button>
                                            </div>
                                        </form>
                                    </div>

                                    <div className="lg:col-span-2">
                                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 max-h-[700px] overflow-y-auto no-scrollbar pr-2 pb-6">
                                            {data.financieras.map(f => (
                                                <div key={f.id} className="group bg-white p-6 rounded-[2.5rem] border border-slate-100 flex flex-col justify-between shadow-sm hover:shadow-xl hover:border-indigo-200 transition-all duration-300">
                                                    <div className="space-y-4">
                                                        <div className="flex justify-between items-start">
                                                            <div className="flex items-center gap-4">
                                                                <div className="w-12 h-12 bg-white border border-slate-100 rounded-2xl flex items-center justify-center overflow-hidden transition-all duration-300 shadow-sm group-hover:border-indigo-200">
                                                                    {f.logoUrl ? (
                                                                        <CachedImage src={f.logoUrl} className="w-full h-full object-cover" />
                                                                    ) : (
                                                                        <div className="w-full h-full bg-indigo-50 flex items-center justify-center text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                                                                            <DollarSign className="w-6 h-6" />
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <div>
                                                                    <p className="uppercase text-slate-800 font-black text-sm tracking-tight">{f.name}</p>
                                                                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-0.5">ID: {f.id}</p>
                                                                </div>
                                                            </div>
                                                            <div className="flex gap-1">
                                                                <button onClick={() => { 
                                                                    setEditingFin(f); 
                                                                    setFinName(f.name); 
                                                                    setFinMinGuarantees(f.minGuarantees || 0); 
                                                                    setFinRequireClientPhoto(f.requireClientPhoto || false); 
                                                                    setFinRequireFacade(f.requireFacade || false); 
                                                                    setFinRequireGuaranteesForAval(f.requireGuaranteesForAval || false); 
                                                                    setFinMinGuaranteesForAval(f.minGuaranteesForAval || 0); 
                                                                    setFinRequireGuarantorPhoto(f.requireGuarantorPhoto || false); 
                                                                    setFinRequireGuarantorFacade(f.requireGuarantorFacade !== false); 
                                                                    setFinMaxClientActiveLoans(f.maxClientActiveLoans ?? 1); 
                                                                    setFinMaxAvalRegistrations(f.maxAvalRegistrations ?? 2); 
                                                                    setFinMaxClientAsAval(f.maxClientAsAval ?? 2); 
                                                                    setFinLogoUrl(f.logoUrl || ''); 
                                                                    setFinLogoGifUrl(f.logoGifUrl || ''); 
                                                                    setFinGuarantorRules(f.guarantorRules || []); 
                                                                }} className="p-2.5 text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"><Pencil className="w-4 h-4"/></button>
                                                                <button onClick={() => { if(confirm("¿Eliminar financiera?")) onDeleteFinanciera(f.id); }} className="p-2.5 text-red-400 hover:bg-red-50 rounded-xl transition-all"><Trash2 className="w-4 h-4"/></button>
                                                            </div>
                                                        </div>

                                                        <div className="flex flex-wrap gap-2">
                                                            <span className="px-2.5 py-1 bg-slate-50 border border-slate-100 text-slate-500 rounded-xl text-[8px] font-black uppercase tracking-widest flex items-center gap-1">
                                                                <ShieldCheck className="w-2.5 h-2.5" />
                                                                Mín G: {f.minGuarantees ?? 'Global'}
                                                            </span>
                                                            <span className={`px-2.5 py-1 border rounded-xl text-[8px] font-black uppercase tracking-widest flex items-center gap-1 ${f.requireClientPhoto ? 'bg-indigo-50/50 border-indigo-100 text-indigo-600' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>
                                                                <Camera className="w-2.5 h-2.5" />
                                                                Foto: {f.requireClientPhoto ? 'SÍ' : 'NO'}
                                                            </span>
                                                            <span className={`px-2.5 py-1 border rounded-xl text-[8px] font-black uppercase tracking-widest flex items-center gap-1 ${f.requireFacade ? 'bg-indigo-50/50 border-indigo-100 text-indigo-600' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>
                                                                <Home className="w-2.5 h-2.5" />
                                                                Fachada: {f.requireFacade ? 'SÍ' : 'NO'}
                                                            </span>
                                                            <span className={`px-2.5 py-1 border rounded-xl text-[8px] font-black uppercase tracking-widest flex items-center gap-1 ${f.requireGuarantorPhoto ? 'bg-indigo-50/50 border-indigo-100 text-indigo-600' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>
                                                                <User className="w-2.5 h-2.5" />
                                                                Foto Aval: {f.requireGuarantorPhoto ? 'SÍ' : 'NO'}
                                                            </span>
                                                        </div>

                                                        <div className="pt-3 border-t border-slate-100 grid grid-cols-2 gap-3">
                                                            <div className="space-y-0.5">
                                                                <span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest">Límite Préstamos</span>
                                                                <span className="block text-xs font-black text-slate-700">{f.maxClientActiveLoans ?? 1} activo(s)</span>
                                                            </div>
                                                            <div className="space-y-0.5">
                                                                <span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest">Fachada Aval</span>
                                                                <span className={`block text-xs font-black ${f.requireGuarantorFacade !== false ? 'text-indigo-600' : 'text-slate-400'}`}>{f.requireGuarantorFacade !== false ? 'Requerida' : 'Opcional'}</span>
                                                            </div>
                                                            <div className="space-y-0.5">
                                                                <span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest">Límite Avales (No-Cli)</span>
                                                                <span className="block text-xs font-black text-slate-700">{f.maxAvalRegistrations ?? 2} v.</span>
                                                            </div>
                                                            <div className="space-y-0.5">
                                                                <span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest">Límite Avales (Cliente)</span>
                                                                <span className="block text-xs font-black text-slate-700">{f.maxClientAsAval ?? 2} v.</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                            {data.financieras.length === 0 && (
                                                <div className="col-span-full py-20 text-center bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-200">
                                                    <p className="text-slate-400 font-black uppercase text-[10px] tracking-widest">No hay financieras registradas</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* SUBTAB: SEMANAS */}
                        {settingsSubTab === 'semanas' && (
                            <div className="space-y-8">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <h3 className="text-2xl font-black text-slate-800 tracking-tight">Gestión de Semanas</h3>
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Control de ciclos operativos por financiera</p>
                                    </div>
                                    <div className="p-3 bg-amber-50 rounded-2xl text-amber-600">
                                        <Calendar className="w-6 h-6" />
                                    </div>
                                </div>

                                <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 flex flex-col md:flex-row justify-between items-end gap-4">
                                    <div className="space-y-1 w-full md:w-80">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Seleccionar Financiera para Gestionar Ciclos</label>
                                        <select 
                                            value={selectedFinancieraForWeeks} 
                                            onChange={e => setSelectedFinancieraForWeeks(e.target.value)}
                                            className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm uppercase shadow-sm"
                                        >
                                            <option value="">SELECCIONAR FINANCIERA...</option>
                                            {data.financieras.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                        </select>
                                    </div>
                                    {selectedFinancieraForWeeks && (
                                        <div className="flex gap-2 w-full md:w-auto">
                                            <button 
                                                onClick={() => onCreateWeek(selectedFinancieraForWeeks)}
                                                className="flex-1 md:flex-none bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center gap-2 justify-center"
                                            >
                                                <Plus className="w-4 h-4" /> Generar Siguiente Ciclo
                                            </button>
                                            <button 
                                                onClick={() => onCloseWeek(selectedFinancieraForWeeks)}
                                                className="flex-1 md:flex-none bg-red-50 text-red-600 px-8 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest border border-red-100 hover:bg-red-600 hover:text-white transition-all flex items-center gap-2 justify-center"
                                            >
                                                <StopCircle className="w-4 h-4" /> Cerrar Ciclo Actual
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {selectedFinancieraForWeeks ? (
                                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                                        <div className="lg:col-span-1 space-y-6">
                                            <form onSubmit={handleManualWeekSubmit} className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 space-y-4">
                                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Registrar Nueva Semana Manual</h4>
                                                <div className="space-y-3">
                                                    <input 
                                                        type="text" 
                                                        value={manualWeekName} 
                                                        onChange={e => setManualWeekName(e.target.value)} 
                                                        placeholder="NOMBRE (EJ: SEMANA 15)" 
                                                        className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 transition-all uppercase text-xs" 
                                                        required 
                                                    />
                                                    <div className="space-y-1">
                                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-2">Fecha de Inicio</label>
                                                        <input 
                                                            type="date" 
                                                            value={manualWeekDate} 
                                                            onChange={e => setManualWeekDate(e.target.value)} 
                                                            className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-xs" 
                                                            required 
                                                        />
                                                    </div>
                                                </div>
                                                <button 
                                                    type="submit" 
                                                    className="w-full bg-indigo-900 text-white py-4 rounded-2xl font-black text-[10px] uppercase shadow-lg active:scale-95 transition-all hover:bg-black"
                                                >
                                                    Registrar Ciclo
                                                </button>
                                            </form>
                                        </div>

                                        <div className="lg:col-span-2">
                                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 max-h-[700px] overflow-y-auto no-scrollbar pr-2 pb-6">
                                                {data.weeks.filter(w => w.financieraId === selectedFinancieraForWeeks).map(w => (
                                                    <div key={w.id} className={`group p-5 rounded-2xl border flex justify-between items-center shadow-sm transition-all ${w.isActive ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-100'}`}>
                                                        <div className="flex items-center gap-4">
                                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${w.isActive ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-400'}`}>
                                                                <Calendar className="w-5 h-5" />
                                                            </div>
                                                            <div>
                                                                <p className="uppercase text-slate-800 font-black text-xs tracking-tight">{w.name}</p>
                                                                <div className="flex flex-col gap-1">
                                                                    <p className="text-[9px] font-mono font-bold text-slate-400 uppercase">
                                                                        {new Date(w.startDate).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                                                    </p>
                                                                    <div className="flex flex-col gap-0.5">
                                                                        <span className="text-[9px] font-mono font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 uppercase tracking-tight">
                                                                            ID API: W-{w.startDate}-{w.endDate || (w.startDate + 604799999)}
                                                                        </span>
                                                                        <span className="text-[8px] font-mono font-bold text-slate-300 uppercase px-1">
                                                                            DOC ID: {w.id}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="flex gap-1">
                                                            {!w.isActive && (
                                                                <button 
                                                                    onClick={() => onReopenWeek(w.id, selectedFinancieraForWeeks)} 
                                                                    title="Reabrir Semana"
                                                                    className="p-2.5 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
                                                                >
                                                                    <RefreshCw className="w-4 h-4"/>
                                                                </button>
                                                            )}
                                                            <button 
                                                                onClick={() => { if(confirm("¿Eliminar semana?")) onDeleteWeek(w.id); }} 
                                                                className="p-2.5 text-red-400 hover:bg-red-50 rounded-xl transition-all"
                                                            >
                                                                <Trash2 className="w-4 h-4"/>
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                                {data.weeks.filter(w => w.financieraId === selectedFinancieraForWeeks).length === 0 && (
                                                    <div className="col-span-full py-12 text-center bg-slate-50 rounded-[2rem] border border-dashed border-slate-200">
                                                        <Calendar className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">No hay ciclos registrados para esta financiera</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="py-20 text-center bg-slate-50 rounded-[3rem] border border-dashed border-slate-200">
                                        <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm border border-slate-100">
                                            <DollarSign className="w-10 h-10 text-indigo-200" />
                                        </div>
                                        <h4 className="text-xl font-black text-slate-800 uppercase tracking-tight">Seleccione una Financiera</h4>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">Debe elegir una financiera para gestionar sus semanas de forma independiente</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* SUBTAB: USUARIOS (VISORES) */}
                        {settingsSubTab === 'usuarios' && (
                            <div className="space-y-8">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <h3 className="text-2xl font-black text-slate-800 tracking-tight">Gestión de Visores</h3>
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Control de acceso para usuarios de monitoreo</p>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <button 
                                            onClick={() => { setEditingSysUser(null); setSysUserName(''); setSysUserPin(''); setSysUserSelectedSups([]); setSysUserCanCreateSups(false); setSysUserCanManageWeeks(false); setSysUserSelectedFins([]); setShowSysUserModal(true); }}
                                            className="px-6 py-3 bg-indigo-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center gap-2"
                                        >
                                            <UserPlus className="w-4 h-4" /> Registrar Nuevo Visor
                                        </button>
                                        <div className="p-3 bg-indigo-50 rounded-2xl text-indigo-600">
                                            <UserCog className="w-6 h-6" />
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 xl:grid-cols-12 gap-10">
                                    <div className="xl:col-span-12">
                                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 max-h-[750px] overflow-y-auto no-scrollbar pr-2 pb-6">
                                            {data.systemUsers.filter(u => u.role === UserRole.VIEWER || !u.role).map(user => (
                                                <div key={user.id} className="group bg-white p-6 rounded-[2rem] border border-slate-100 flex flex-col gap-4 shadow-sm hover:shadow-xl hover:border-indigo-200 transition-all">
                                                    <div className="flex justify-between items-start">
                                                        <div className="flex items-center gap-4">
                                                            <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300">
                                                                <UserCog className="w-6 h-6"/>
                                                            </div>
                                                            <div>
                                                                <p className="font-black uppercase text-slate-800 text-sm tracking-tight">{user.name}</p>
                                                                <div className="flex items-center gap-2 mt-0.5">
                                                                    <p className="text-[10px] font-mono text-slate-400 font-bold">PIN: {isSuperAdmin ? user.pin : '****'}</p>
                                                                    {user.canCreateSupervisors && (
                                                                        <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-[8px] font-black uppercase tracking-widest">Admin Sups</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="flex gap-1">
                                                            <button onClick={() => startEditSysUser(user)} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"><Pencil className="w-4 h-4"/></button>
                                                            <button onClick={() => { if(confirm("¿Eliminar visor?")) onDeleteSystemUser(user.id); }} className="p-2 text-red-400 hover:bg-red-50 rounded-xl transition-all"><Trash2 className="w-4 h-4"/></button>
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                                        <div>
                                                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1"><DollarSign className="w-2.5 h-2.5"/> Financieras:</p>
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {(user.assignedFinancieraIds || []).map(fid => {
                                                                    const fName = data.financieras.find(f => f.id === fid)?.name || '???';
                                                                    return <span key={fid} className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-[9px] font-bold text-slate-600 uppercase shadow-sm">{fName}</span>;
                                                                })}
                                                                {(!user.assignedFinancieraIds || user.assignedFinancieraIds.length === 0) && <span className="text-[9px] text-slate-300 font-bold italic">Sin asignar</span>}
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1"><Users className="w-2.5 h-2.5"/> Supervisores:</p>
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {user.assignedSupervisorIds.map(sid => {
                                                                    const sName = fullSupervisorsList.find(s => s.id === sid)?.name || '???';
                                                                    return <span key={sid} className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-[9px] font-bold text-slate-600 uppercase shadow-sm">{sName}</span>;
                                                                })}
                                                                {user.assignedSupervisorIds.length === 0 && <span className="text-[9px] text-red-300 font-bold italic">Sin acceso</span>}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* SUBTAB: ADMINISTRADORES */}
                        {settingsSubTab === 'administradores' && (
                            <div className="space-y-8">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <h3 className="text-2xl font-black text-slate-800 tracking-tight">Gestión de Administradores</h3>
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Usuarios con control total sobre el sistema</p>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <button 
                                            onClick={() => { setEditingSysUser(null); setSysUserName(''); setSysUserPin(''); setSysUserSelectedSups([]); setSysUserCanCreateSups(false); setSysUserCanManageWeeks(false); setSysUserSelectedFins([]); setShowSysUserModal(true); }}
                                            className="px-6 py-3 bg-indigo-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-indigo-100 hover:bg-black transition-all flex items-center gap-2"
                                        >
                                            <ShieldCheck className="w-4 h-4" /> Registrar Nuevo Administrador
                                        </button>
                                        <div className="p-3 bg-indigo-50 rounded-2xl text-indigo-600">
                                            <ShieldCheck className="w-6 h-6" />
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 xl:grid-cols-12 gap-10">
                                    <div className="xl:col-span-12">
                                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 max-h-[750px] overflow-y-auto no-scrollbar pr-2 pb-6">
                                            {data.systemUsers.filter(u => u.role === UserRole.ADMIN).map(user => (
                                                <div key={user.id} className="group bg-white p-6 rounded-[2rem] border border-slate-100 flex flex-col gap-4 shadow-sm hover:shadow-xl hover:border-indigo-200 transition-all">
                                                    <div className="flex justify-between items-start">
                                                        <div className="flex items-center gap-4">
                                                            <div className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-lg">
                                                                <ShieldCheck className="w-6 h-6"/>
                                                            </div>
                                                            <div>
                                                                <p className="font-black uppercase text-slate-800 text-sm tracking-tight">{user.name}</p>
                                                                <p className="text-[10px] font-mono text-slate-400 font-bold">PIN: {isSuperAdmin ? user.pin : '****'}</p>
                                                            </div>
                                                        </div>
                                                        <div className="flex gap-1">
                                                            <button onClick={() => startEditSysUser(user)} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"><Pencil className="w-4 h-4"/></button>
                                                            <button onClick={() => { if(confirm("¿Eliminar administrador?")) onDeleteSystemUser(user.id); }} className="p-2 text-red-400 hover:bg-red-50 rounded-xl transition-all"><Trash2 className="w-4 h-4"/></button>
                                                        </div>
                                                    </div>
                                                    <div className="mt-2">
                                                        <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-[9px] font-black uppercase tracking-widest">Control Total</span>
                                                    </div>
                                                </div>
                                            ))}
                                            {data.systemUsers.filter(u => u.role === UserRole.ADMIN).length === 0 && (
                                                <div className="col-span-full py-12 text-center bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                                                    <p className="text-xs font-bold text-slate-400 uppercase">No hay administradores adicionales registrados</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* SUBTAB: API EXTERNA - REDISEÑO PROFESIONAL Y COMPACTO */}
                        {settingsSubTab === 'api' && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
                                <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-2">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <Zap className="w-5 h-5 text-indigo-600" />
                                            <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">API de Integración</h3>
                                        </div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">v1.0 • Control v1.0</p>
                                    </div>
                                    <button 
                                        onClick={() => { setApiKeyName(''); setApiKeyPermissions([ApiPermission.READ_CLIENTS]); setApiKeyFinancieras([]); setEditingApiKey(null); setIsCreatingApiKey(true); }}
                                        className="px-5 py-2.5 bg-slate-900 text-white rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-indigo-600 transition-all flex items-center gap-2 active:scale-95 shadow-sm"
                                    >
                                        <Plus className="w-4 h-4" /> Generar Credencial
                                    </button>
                                </header>

                                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                                    {/* LISTA DE LLAVES */}
                                    <div className="lg:col-span-8 space-y-4">
                                        <div className="flex items-center justify-between px-1">
                                            <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-1.5">
                                                <ShieldCheck className="w-4 h-4" /> Credenciales Activas
                                            </h4>
                                        </div>

                                        {data.apiKeys && data.apiKeys.length > 0 ? (
                                            <div className="space-y-3">
                                                {data.apiKeys.map(apiKey => (
                                                    <div key={apiKey.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:border-indigo-300 transition-colors">
                                                        <div className="flex flex-col md:flex-row md:items-center gap-4">
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2 mb-3">
                                                                    <h5 className="font-bold text-slate-900 text-sm">{apiKey.name}</h5>
                                                                    <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter ${apiKey.active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-50 text-red-500'}`}>
                                                                        {apiKey.active ? 'Listo' : 'Off'}
                                                                    </span>
                                                                </div>
                                                                
                                                                <div className="flex flex-wrap gap-2 mb-4">
                                                                    <div className="flex items-center gap-1.5 p-1 px-2 bg-slate-50 border border-slate-100 rounded-lg">
                                                                        <Key className="w-3 h-3 text-slate-400" />
                                                                        <code className="text-[11px] font-mono font-bold text-slate-600 truncate max-w-[200px]">{apiKey.key}</code>
                                                                        <button 
                                                                            onClick={() => { navigator.clipboard.writeText(apiKey.key); alert("Copiada"); }}
                                                                            className="ml-1 text-slate-300 hover:text-indigo-500"
                                                                        >
                                                                            <RefreshCw className="w-3 h-3" />
                                                                        </button>
                                                                    </div>
                                                                    
                                                                    <div className="flex -space-x-1">
                                                                        {apiKey.permissions.map(p => (
                                                                            <div key={p} className="w-6 h-6 rounded-full bg-indigo-50 border border-white flex items-center justify-center text-indigo-500" title={p}>
                                                                                <Shield className="w-3 h-3" />
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>

                                                                {apiKey.lastUsedAt && (
                                                                    <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400 uppercase">
                                                                        <Activity className="w-3 h-3" /> Actividad: {new Date(apiKey.lastUsedAt).toLocaleDateString()}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-2 md:pl-4 md:border-l border-slate-100">
                                                                <button 
                                                                    onClick={() => { 
                                                                        setEditingApiKey(apiKey);
                                                                        setApiKeyName(apiKey.name);
                                                                        setApiKeyPermissions(apiKey.permissions);
                                                                        setApiKeyFinancieras(apiKey.assignedFinancieraIds || []);
                                                                        setIsCreatingApiKey(true);
                                                                    }}
                                                                    className="p-2.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                                                                    title="Editar"
                                                                >
                                                                    <Pencil className="w-4 h-4" />
                                                                </button>
                                                                <button 
                                                                    onClick={() => onUpdateApiKey(apiKey.id, !apiKey.active, apiKey.permissions, apiKey.assignedFinancieraIds || [])}
                                                                    className={`p-2.5 rounded-xl transition-all ${apiKey.active ? 'text-amber-500 hover:bg-amber-50' : 'text-emerald-500 hover:bg-emerald-50'}`}
                                                                    title={apiKey.active ? 'Suspender' : 'Activar'}
                                                                >
                                                                    {apiKey.active ? <StopCircle className="w-4 h-4" /> : <PlayCircle className="w-4 h-4" />}
                                                                </button>
                                                                <button 
                                                                    onClick={() => { if(confirm("¿Eliminar acceso?")) onDeleteApiKey(apiKey.id); }}
                                                                    className="p-2.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                                                    title="Revocar"
                                                                >
                                                                    <Trash2 className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="py-12 border-2 border-dashed border-slate-100 rounded-2xl flex flex-col items-center justify-center text-center">
                                                <div className="w-10 h-10 bg-slate-50 rounded-full flex items-center justify-center mb-3">
                                                    <Fingerprint className="w-5 h-5 text-slate-300" />
                                                </div>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sin credenciales</p>
                                            </div>
                                        )}
                                    </div>

                                    {/* DOCUMENTACIÓN TÉCNICA */}
                                    <div className="lg:col-span-4">
                                        <div className="bg-slate-900 rounded-2xl p-6 text-white border border-slate-800 space-y-6">
                                            <div className="flex items-center gap-2 pb-4 border-b border-white/5">
                                                <Terminal className="w-4 h-4 text-indigo-400" />
                                                <h4 className="text-[10px] font-black uppercase tracking-widest">Integración</h4>
                                            </div>

                                            <div className="space-y-4">
                                                <div className="space-y-1.5">
                                                    <label className="text-[9px] font-bold text-slate-500 uppercase">Endpoint</label>
                                                    <div className="bg-black/50 p-3 rounded-lg border border-white/5">
                                                        <code className="text-[10px] font-mono text-indigo-400 break-all">{window.location.origin}/api/v1</code>
                                                    </div>
                                                </div>

                                                <div className="space-y-1.5">
                                                    <label className="text-[9px] font-bold text-slate-500 uppercase">Header Auth</label>
                                                    <div className="bg-black/50 p-3 rounded-lg border border-white/5">
                                                        <code className="text-[10px] font-mono text-slate-300">X-API-KEY: [tu_llave]</code>
                                                    </div>
                                                </div>

                                                <div className="space-y-3 pt-2">
                                                    <label className="text-[9px] font-bold text-slate-500 uppercase border-b border-white/5 pb-1 block">Rutas Disponibles</label>
                                                    <div className="space-y-2.5">
                                                        <div className="flex items-center justify-between text-[10px]">
                                                            <code className="font-mono text-white">/clients</code>
                                                            <span className="text-emerald-500 font-bold">GET</span>
                                                        </div>
                                                        <div className="flex items-center justify-between text-[10px]">
                                                            <code className="font-mono text-white">/weeks</code>
                                                            <span className="text-emerald-500 font-bold">GET</span>
                                                        </div>
                                                        <div className="flex items-center justify-between text-[10px]">
                                                            <code className="font-mono text-white">/visits</code>
                                                            <span className="text-emerald-500 font-bold">GET</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="space-y-2 pt-2">
                                                    <label className="text-[9px] font-bold text-slate-500 uppercase">Response JSON (Client)</label>
                                                    <div className="bg-black/50 p-3 rounded-lg border border-white/5 overflow-hidden">
                                                        <pre className="text-[9px] font-mono text-slate-400 leading-tight">
{`{
  "id": "QR-001",
  "name": "Juan Perez",
  "creditAmount": 5000,
  "weekId": "2025-05",
  "registeredAt": 171512345678...
}`}
                                                        </pre>
                                                    </div>
                                                </div>

                                                <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl mt-4">
                                                    <p className="text-[9px] leading-relaxed text-indigo-200 font-medium italic">
                                                        Restringido a financieras asignadas en la credencial.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* SUBTAB: MANTENIMIENTO / SISTEMA */}
                        {settingsSubTab === 'mantenimiento' && (
                            <div className="space-y-10">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <h3 className="text-2xl font-black text-slate-800 tracking-tight">Mantenimiento del Sistema</h3>
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Herramientas de diagnóstico y respaldo de datos</p>
                                    </div>
                                    <div className="p-3 bg-slate-100 rounded-2xl text-slate-600">
                                        <FileJson className="w-6 h-6" />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="bg-slate-50 p-8 rounded-[2.5rem] border border-slate-100 space-y-6">
                                        <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center text-indigo-600 shadow-sm border border-slate-100">
                                            <Download className="w-8 h-8" />
                                        </div>
                                        <div className="space-y-2">
                                            <h4 className="text-lg font-black text-slate-800 uppercase tracking-tight">Respaldo de Base de Datos</h4>
                                            <p className="text-xs font-medium text-slate-500 leading-relaxed">Genera un archivo JSON con toda la información actual del sistema (supervisores, clientes, visitas, lotes QR y configuraciones). Útil para migraciones o auditorías externas.</p>
                                        </div>
                                        <button 
                                            onClick={handleExportJSON} 
                                            className="w-full bg-slate-800 text-white py-5 rounded-2xl font-black uppercase text-xs shadow-xl shadow-slate-200 flex items-center justify-center gap-3 active:scale-[0.98] transition-all hover:bg-black"
                                        >
                                            <Download className="w-5 h-5"/> Exportar JSON Completo
                                        </button>

                                        <div className="pt-4 border-t border-slate-200">
                                            <button 
                                                onClick={onMigrateWeeksToLaFortuna} 
                                                className="w-full bg-amber-600 text-white py-5 rounded-2xl font-black uppercase text-xs shadow-xl shadow-amber-100 flex items-center justify-center gap-3 active:scale-[0.98] transition-all hover:bg-amber-700"
                                            >
                                                <RotateCcw className="w-5 h-5"/> Migrar Semanas a 'La Fortuna'
                                            </button>
                                        </div>
                                    </div>

                                    <div className="bg-indigo-900 p-8 rounded-[2.5rem] border border-indigo-800 space-y-6 text-white">
                                        <div className="w-16 h-16 bg-white/10 rounded-3xl flex items-center justify-center text-white shadow-sm border border-white/10 backdrop-blur-md">
                                            <ShieldCheck className="w-8 h-8" />
                                        </div>
                                        <div className="space-y-2">
                                            <h4 className="text-lg font-black uppercase tracking-tight">Estado del Servidor</h4>
                                            <p className="text-xs font-medium text-indigo-200 leading-relaxed">El sistema se encuentra operando bajo protocolos de integridad de hardware. Todos los accesos están siendo auditados en tiempo real.</p>
                                        </div>
                                        <div className="pt-4 flex items-center gap-4">
                                            <div className="flex -space-x-2">
                                                <div className="w-8 h-8 rounded-full bg-emerald-500 border-2 border-indigo-900 flex items-center justify-center text-[10px] font-black">OK</div>
                                                <div className="w-8 h-8 rounded-full bg-indigo-700 border-2 border-indigo-900 flex items-center justify-center text-[10px] font-black">SSL</div>
                                            </div>
                                            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-300">Conexión Segura Activa</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </main>
                </div>
            </div>
        )}
      </div>

      {/* MODAL AUDITORIA SUPERVISOR - MOSTRANDO TODO EL HISTORIAL Y TODOS LOS DATOS */}
      {selectedSupervisorDetails && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in duration-200 border border-slate-200">
                  <div className="p-6 border-b bg-slate-50 flex justify-between items-center shadow-sm">
                      <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg"><Activity className="w-6 h-6"/></div>
                          <div><h3 className="text-xl font-black uppercase text-indigo-900 tracking-tight">{selectedSupervisorDetails.name}</h3><p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1"><Shield className="w-3 h-3 text-indigo-400"/> Auditoría de Integridad de Sesión</p></div>
                      </div>
                      <button onClick={() => setSelectedSupervisorDetails(null)} className="p-3 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-full transition-all active:scale-90"><X className="w-6 h-6"/></button>
                  </div>
                  <div className="p-6 overflow-y-auto space-y-8 no-scrollbar bg-white">
                      {selectedSupervisorDetails.loginHistory && selectedSupervisorDetails.loginHistory.length > 0 ? (
                           <div className="space-y-8">
                               {(() => {
                                   const sortedHistory = [...selectedSupervisorDetails.loginHistory].sort((a,b) => b.timestamp - a.timestamp);
                                   return sortedHistory.map((meta, i) => {
                                       const previous = sortedHistory[i+1];
                                       const reasons = getIncidenceReasons(meta, previous);
                                       const isHardwareIncidence = reasons.some(r => r !== "Red / IP");
                                       const isNetworkIncidence = reasons.includes("Red / IP") && reasons.length === 1;

                                       return (
                                            <div key={i} className={`border-2 rounded-3xl overflow-hidden transition-all shadow-md ${isHardwareIncidence ? 'border-red-500 bg-red-50/10' : isNetworkIncidence ? 'border-amber-400 bg-amber-50/10' : 'border-slate-100 bg-slate-50/30'}`}>
                                                <div className={`p-4 flex justify-between items-center ${isHardwareIncidence ? 'bg-red-500 text-white' : isNetworkIncidence ? 'bg-amber-400 text-white' : 'bg-slate-800 text-white'}`}>
                                                    <div className="flex items-center gap-3">
                                                        <h4 className="font-black text-[11px] uppercase tracking-widest flex items-center gap-2"><Monitor className="w-4 h-4" /> SESIÓN #{sortedHistory.length - i}</h4>
                                                        {reasons.length > 0 && (
                                                            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[8px] font-black uppercase bg-white/20 border border-white/30 backdrop-blur-sm animate-pulse">
                                                                <AlertTriangle className="w-2.5 h-2.5" /> 
                                                                {isHardwareIncidence ? 'Posible cambio de dispositivo' : 'Acceso desde red distinta'}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <span className="text-[10px] font-mono font-bold">{meta.localTime}</span>
                                                </div>

                                                <div className="p-6">
                                                    {reasons.length > 0 && (
                                                        <div className="mb-6 p-4 bg-white/80 rounded-2xl border-2 border-dashed border-red-200">
                                                            <p className="text-[9px] font-black text-red-600 uppercase tracking-widest mb-2 flex items-center gap-1"><ShieldAlert className="w-3 h-3"/> Diferencias críticas detectadas:</p>
                                                            <div className="flex flex-wrap gap-2">
                                                                {reasons.map(r => (
                                                                    <span key={r} className="px-3 py-1 bg-red-600 text-white rounded-lg text-[9px] font-black uppercase tracking-tight shadow-sm">{r}</span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-6">
                                                        {/* MOSTRANDO ABSOLUTAMENTE TODOS LOS DATOS */}
                                                        <div className="space-y-1">
                                                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Dirección IP</p>
                                                            <p className={`text-xs font-mono font-bold ${previous && meta.ip !== previous.ip ? 'text-amber-600' : 'text-slate-800'}`}>{meta.ip || 'DESCONOCIDA'}</p>
                                                        </div>
                                                        <div className="space-y-1">
                                                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Sist. Operativo</p>
                                                            <p className={`text-xs font-black uppercase ${previous && meta.os !== previous.os ? 'text-red-600 underline' : 'text-slate-800'}`}>{meta.os}</p>
                                                        </div>
                                                        <div className="space-y-1">
                                                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Navegador</p>
                                                            <p className={`text-xs font-black uppercase ${previous && meta.browser !== previous.browser ? 'text-red-600 underline' : 'text-slate-800'}`}>{meta.browser}</p>
                                                        </div>
                                                        <div className="space-y-1">
                                                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Tipo de Equipo</p>
                                                            <p className={`text-xs font-black uppercase ${previous && meta.deviceType !== previous.deviceType ? 'text-red-600 underline' : 'text-slate-800'}`}>{meta.deviceType}</p>
                                                        </div>
                                                        <div className="space-y-1">
                                                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Resolución Pantalla</p>
                                                            <p className={`text-xs font-bold ${previous && meta.screenResolution !== previous.screenResolution ? 'text-red-600 underline' : 'text-slate-800'}`}>{meta.screenResolution}</p>
                                                        </div>
                                                        <div className="space-y-1">
                                                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Tamaño Ventana</p>
                                                            <p className="text-xs font-bold text-slate-800">{meta.windowSize}</p>
                                                        </div>
                                                        <div className="space-y-1">
                                                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Idioma / Localización</p>
                                                            <p className="text-xs font-black uppercase text-slate-800">{meta.language} • {meta.timezone}</p>
                                                        </div>
                                                        <div className="space-y-1">
                                                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Hardware (Cores/RAM)</p>
                                                            <p className={`text-xs font-black text-slate-800 ${previous && (meta.cpuCores !== previous.cpuCores || meta.memory !== previous.memory) ? 'text-red-600 underline' : ''}`}>{meta.cpuCores} Cores • {meta.memory}</p>
                                                        </div>
                                                        <div className="space-y-1 col-span-2 md:col-span-4 border-t pt-4">
                                                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Firma Digital del Navegador (User Agent Full)</p>
                                                            <p className={`text-[10px] font-mono break-all leading-relaxed ${previous && meta.userAgent !== previous.userAgent ? 'text-red-600 bg-red-50 p-2 rounded-lg border border-red-100' : 'text-slate-400'}`}>{meta.userAgent}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                       );
                                   });
                               })()}
                           </div>
                      ) : (
                          <div className="py-20 text-center space-y-4">
                              <Monitor className="w-16 h-16 text-slate-100 mx-auto" />
                              <p className="text-slate-300 font-black uppercase text-xs tracking-widest">Sin registros de auditoría disponibles en la base de datos.</p>
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}

      {/* MODAL DETALLE CLIENTE */}
      {selectedClientForDetails && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[95vh] flex flex-col overflow-hidden animate-in zoom-in duration-200 border border-slate-200">
              <div className="p-6 border-b flex justify-between items-center bg-indigo-600 text-white shadow-lg">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md border border-white/30"><UserPlus className="w-6 h-6"/></div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-xl font-black uppercase tracking-tight leading-none mb-1">{selectedClientForDetails.name}</h3>
                            {selectedClientForDetails.isArchived && (
                                <span className="px-2 py-0.5 bg-red-500 text-white text-[9px] font-black rounded-full border border-white/30 flex items-center gap-1">
                                    <Archive className="w-3 h-3" /> ARCHIVADO
                                </span>
                            )}
                        </div>
                        <p className="text-[11px] font-mono font-bold opacity-70 tracking-tighter">ID: {selectedClientForDetails.id}</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                  {(isSuperAdmin || isViewer) && !isEditingClient && selectedClientForDetails.isArchived && (
                      <button 
                          onClick={() => { if(confirm("¿Restaurar cliente?")) onUpdateClient(selectedClientForDetails.id, { isArchived: false }); setSelectedClientForDetails(null); }} 
                          className="p-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full transition-all active:scale-90 shadow-lg"
                          title="Restaurar Cliente"
                      >
                          <RefreshCw className="w-6 h-6" />
                      </button>
                  )}
                  {(isSuperAdmin || isViewer) && !isEditingClient && (
                      <button onClick={() => startEditClient(selectedClientForDetails)} className="p-3 bg-amber-500 hover:bg-amber-600 text-white rounded-full transition-all active:scale-90 shadow-lg"><Pencil className="w-6 h-6" /></button>
                  )}
                  <button onClick={() => { setSelectedClientForDetails(null); setIsEditingClient(false); }} className="p-3 bg-indigo-500 hover:bg-red-500 text-white rounded-full transition-all active:scale-90"><X className="w-6 h-6" /></button>
                </div>
              </div>
              <div id="printable-report" className="p-8 overflow-y-auto space-y-8 no-scrollbar bg-white">
                 {isEditingClient ? (
                     <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* EDICIÓN SOLICITANTE */}
                            <div className="space-y-4 bg-slate-50 p-6 rounded-3xl border border-slate-100">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-l-4 border-indigo-500 pl-3">Datos del Solicitante</h4>
                                <div className="space-y-3">
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Nombre Completo</label>
                                        <input type="text" value={editClientName} onChange={e => setEditClientName(e.target.value.toUpperCase())} className="w-full p-3 border border-slate-200 rounded-xl font-bold text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500 outline-none uppercase text-xs" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Domicilio</label>
                                        <input type="text" value={editClientAddress} onChange={e => setEditClientAddress(e.target.value.toUpperCase())} className="w-full p-3 border border-slate-200 rounded-xl font-bold text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500 outline-none uppercase text-xs" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Celular</label>
                                            <input type="tel" maxLength={10} value={editClientPhone} onChange={e => setEditClientPhone(e.target.value.replace(/\D/g,''))} className="w-full p-3 border border-slate-200 rounded-xl font-bold text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-xs" />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Crédito ($)</label>
                                            <input type="number" value={editClientCredit} onChange={e => setEditClientCredit(parseFloat(e.target.value))} className="w-full p-3 border border-slate-200 rounded-xl font-bold text-indigo-600 bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-xs" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* EDICIÓN AVAL */}
                            <div className="space-y-4 bg-slate-50 p-6 rounded-3xl border border-slate-100">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-l-4 border-blue-500 pl-3">Datos del Aval</h4>
                                <div className="space-y-3">
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Nombre Aval</label>
                                        <input type="text" value={editClientAvalName} onChange={e => setEditClientAvalName(e.target.value.toUpperCase())} className="w-full p-3 border border-slate-200 rounded-xl font-bold text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 outline-none uppercase text-xs" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Domicilio Aval</label>
                                        <input type="text" value={editClientAvalAddress} onChange={e => setEditClientAvalAddress(e.target.value.toUpperCase())} className="w-full p-3 border border-slate-200 rounded-xl font-bold text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 outline-none uppercase text-xs" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Celular Aval</label>
                                        <input type="tel" maxLength={10} value={editClientAvalPhone} onChange={e => setEditClientAvalPhone(e.target.value.replace(/\D/g,''))} className="w-full p-3 border border-slate-200 rounded-xl font-bold text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 outline-none text-xs" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* EDICIÓN GARANTÍAS */}
                        <div className="space-y-4 bg-slate-50 p-6 rounded-3xl border border-slate-100">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-l-4 border-emerald-500 pl-3 flex items-center gap-2">
                                Inventario de Garantías ({editClientGuarantees.length})
                            </h4>
                            <div className="flex gap-2">
                                <input 
                                    type="text" 
                                    value={newGuaranteeDesc} 
                                    onChange={e => setNewGuaranteeDesc(e.target.value.toUpperCase())} 
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddGuarantee()}
                                    className="flex-1 p-3 border border-slate-200 rounded-xl font-bold text-slate-900 bg-white focus:ring-2 focus:ring-emerald-500 outline-none uppercase text-xs" 
                                    placeholder="NUEVA GARANTÍA..." 
                                />
                                <button onClick={handleAddGuarantee} className="bg-emerald-600 text-white px-4 rounded-xl hover:bg-emerald-700 transition-colors"><Plus className="w-5 h-5"/></button>
                            </div>
                            <div className="space-y-2">
                                {editClientGuarantees.length === 0 && <p className="text-center text-[10px] text-slate-400 font-bold uppercase py-4 opacity-50 border-2 border-dashed border-slate-200 rounded-xl">Sin garantías</p>}
                                {editClientGuarantees.map((g, i) => (
                                    <div key={i} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center">
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0"></div>
                                            <span className="text-xs font-black text-slate-700 uppercase truncate">{g.description}</span>
                                        </div>
                                        <button onClick={() => removeGuarantee(i)} className="p-2 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 transition-colors"><Trash2 className="w-4 h-4" /></button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <button onClick={handleSaveClient} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-sm tracking-widest shadow-xl shadow-indigo-100 hover:bg-indigo-700 active:scale-95 transition-all flex items-center justify-center gap-2">
                            <Save className="w-5 h-5" /> Guardar Cambios
                        </button>
                     </div>
                 ) : (
                     <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                            <div className="space-y-6">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-l-4 border-indigo-500 pl-3">Expediente del Solicitante</h4>
                            <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 space-y-4 shadow-sm">
                                <div><p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Domicilio Principal</p><p className="text-sm font-bold uppercase text-slate-800 leading-relaxed">{selectedClientForDetails.address || 'DATOS NO DISPONIBLES'}</p></div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div><p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Celular</p><p className="text-sm font-bold text-slate-800">{selectedClientForDetails.cellphone}</p></div>
                                    <div><p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Línea de Crédito</p><p className="text-sm font-black text-indigo-600">${selectedClientForDetails.creditAmount} MXN</p></div>
                                </div>
                                <div className="pt-2 border-t border-slate-200 space-y-2">
                                    <div>
                                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Registrado por</p>
                                        <p className="text-sm font-bold uppercase text-slate-800 flex items-center gap-2">
                                            <UserCheck className="w-4 h-4 text-emerald-500" />
                                            {fullSupervisorsList.find(s => s.id === selectedClientForDetails.registeredBySupervisorId)?.name || 
                                             fullSupervisorsList.find(s => s.id === selectedClientForDetails.supervisorId)?.name || 'SUPERVISOR DESCONOCIDO'}
                                        </p>
                                    </div>
                                    {selectedClientForDetails.registeredBySupervisorId && selectedClientForDetails.registeredBySupervisorId !== selectedClientForDetails.supervisorId && (
                                        <div>
                                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Asignado actualmente a</p>
                                            <p className="text-sm font-bold uppercase text-slate-800 flex items-center gap-2">
                                                <UserCog className="w-4 h-4 text-indigo-500" />
                                                {fullSupervisorsList.find(s => s.id === selectedClientForDetails.supervisorId)?.name || 'SUPERVISOR DESCONOCIDO'}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-3">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 px-1"><Camera className="w-3 h-3"/> Fachada Autorizada</p>
                                        <div className="relative group">
                                            {selectedClientForDetails.facadeUrl ? (
                                                <CachedImage src={selectedClientForDetails.facadeUrl} className="w-full h-72 object-cover rounded-[2.5rem] border-2 border-slate-100 shadow-2xl transition-transform group-hover:scale-[1.01]" alt="Fachada Solicitante" />
                                            ) : (
                                                <div className="w-full h-72 bg-slate-50 border-2 border-dashed border-slate-200 rounded-[2.5rem] flex flex-col items-center justify-center text-slate-300">
                                                    <Camera className="w-10 h-10 mb-2 opacity-20" />
                                                    <p className="text-[10px] font-black uppercase tracking-widest">Sin Fachada</p>
                                                </div>
                                            )}
                                            {selectedClientForDetails.facadeUrl && <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-md text-white p-3 rounded-full shadow-lg"><Globe className="w-5 h-5"/></div>}
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 px-1"><Users className="w-3 h-3"/> Fotografías del Cliente</p>
                                        <div className="relative group">
                                            {selectedClientForDetails.clientPhotoUrl ? (
                                                <CachedImage src={selectedClientForDetails.clientPhotoUrl} className="w-full h-72 object-cover rounded-[2.5rem] border-2 border-slate-100 shadow-2xl transition-transform group-hover:scale-[1.01]" alt="Foto Cliente" />
                                            ) : (
                                                <div className="w-full h-72 bg-slate-50 border-2 border-dashed border-slate-200 rounded-[2.5rem] flex flex-col items-center justify-center text-slate-300">
                                                    <UserCheck className="w-10 h-10 mb-2 opacity-20" />
                                                    <p className="text-[10px] font-black uppercase tracking-widest">Sin Fotografía</p>
                                                </div>
                                            )}
                                            {selectedClientForDetails.clientPhotoUrl && <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-md text-white p-3 rounded-full shadow-lg"><UserCheck className="w-5 h-5"/></div>}
                                        </div>
                                    </div>
                                </div>

                            </div>

                            <div className="space-y-6">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-l-4 border-blue-500 pl-3">Información de Avales</h4>
                            <div className="space-y-6">
                                {(selectedClientForDetails.avales && selectedClientForDetails.avales.length > 0 
                                  ? selectedClientForDetails.avales 
                                  : [{ 
                                      name: selectedClientForDetails.avalName, 
                                      address: selectedClientForDetails.avalAddress, 
                                      cellphone: selectedClientForDetails.avalCellphone, 
                                      facadeUrl: selectedClientForDetails.avalFacadeUrl,
                                      latitude: selectedClientForDetails.avalLatitude,
                                      longitude: selectedClientForDetails.avalLongitude,
                                      visitTimestamp: selectedClientForDetails.avalVisitTimestamp,
                                      guarantees: []
                                    }]
                                ).map((aval, idx) => (
                                    <div key={idx} className="bg-blue-50/40 p-6 rounded-3xl border border-blue-100 space-y-4 shadow-sm">
                                        <div className="flex justify-between items-start">
                                            <div className="space-y-4 flex-1">
                                                <div><p className="text-[8px] font-black text-blue-400 uppercase tracking-widest mb-1">Aval {idx + 1}</p><p className="text-sm font-bold uppercase text-slate-800 leading-relaxed">{aval.name || 'SIN REGISTRO'}</p></div>
                                                <div><p className="text-[8px] font-black text-blue-400 uppercase tracking-widest mb-1">Domicilio</p><p className="text-[11px] font-bold uppercase text-slate-700 leading-relaxed">{aval.address || 'N/A'}</p></div>
                                                <div><p className="text-[8px] font-black text-blue-400 uppercase tracking-widest mb-1">Celular</p><p className="text-sm font-bold text-slate-800">{aval.cellphone || 'N/A'}</p></div>
                                                
                                                {aval.guarantees && aval.guarantees.length > 0 && (
                                                    <div className="space-y-2 pt-2 border-t border-blue-100">
                                                        <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-1">
                                                            <ShieldCheck className="w-3 h-3" /> Garantías del Aval
                                                        </p>
                                                        <div className="flex flex-wrap gap-2">
                                                            {aval.guarantees.map((g, gi) => (
                                                                <span key={gi} className="px-2 py-1 bg-white border border-blue-100 text-[9px] font-bold text-blue-800 rounded-lg uppercase">
                                                                    {g.description}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {aval.latitude && (
                                                    <a 
                                                        href={`https://www.google.com/maps/search/?api=1&query=${aval.latitude},${aval.longitude}`}
                                                        target="_blank"
                                                        className="p-2 bg-white rounded-xl text-blue-600 shadow-sm transition-transform active:scale-90 border border-blue-100"
                                                    >
                                                        <MapIcon className="w-4 h-4" />
                                                    </a>
                                                )}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-3">
                                                <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-2 px-1"><Home className="w-3 h-3"/> Fachada Aval {idx + 1}</p>
                                                {aval.facadeUrl ? (
                                                    <div className="relative group">
                                                        <CachedImage src={aval.facadeUrl} className="w-full h-48 object-cover rounded-[1.5rem] border-2 border-blue-100 shadow-sm transition-transform group-hover:scale-[1.01]" alt={`Fachada Aval ${idx + 1}`} />
                                                        <div className="absolute top-4 right-4 bg-blue-600/30 backdrop-blur-md text-white p-2 rounded-full shadow-lg"><CheckCircle className="w-4 h-4"/></div>
                                                    </div>
                                                ) : (
                                                    <div className="h-48 bg-white/30 rounded-[1.5rem] flex flex-col items-center justify-center text-[10px] font-black text-slate-300 uppercase tracking-widest border-2 border-dashed border-slate-100">
                                                        <p>Sin Fachada</p>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="space-y-3">
                                                <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-2 px-1"><UserCheck className="w-3 h-3"/> Persona Aval {idx + 1}</p>
                                                {aval.photoUrl ? (
                                                    <div className="relative group">
                                                        <CachedImage src={aval.photoUrl} className="w-full h-48 object-cover rounded-[1.5rem] border-2 border-blue-100 shadow-sm transition-transform group-hover:scale-[1.01]" alt={`Persona Aval ${idx + 1}`} />
                                                        <div className="absolute top-4 right-4 bg-blue-600/30 backdrop-blur-md text-white p-2 rounded-full shadow-lg"><UserCheck className="w-4 h-4"/></div>
                                                    </div>
                                                ) : (
                                                    <div className="h-48 bg-white/30 rounded-[1.5rem] flex flex-col items-center justify-center text-[10px] font-black text-slate-300 uppercase tracking-widest border-2 border-dashed border-slate-100">
                                                        <p>Sin Fotografía Persona</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                    </div>
                                ))}
                            </div>
                            </div>
                        </div>

                        {selectedClientForDetails.guarantees && selectedClientForDetails.guarantees.length > 0 && (
                            <div className="pt-6 border-t border-slate-100 space-y-4">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-l-4 border-emerald-500 pl-3">Inventario de Garantías</h4>
                                <div className="flex flex-wrap gap-2">
                                    {selectedClientForDetails.guarantees.map((g, idx) => (
                                        <div key={idx} className="bg-emerald-50 text-emerald-700 px-5 py-3 rounded-2xl text-xs font-black uppercase border border-emerald-100 shadow-sm flex items-center gap-2">
                                            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                                            {g.description}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                     </>
                 )}

                 {/* HISTORIAL DE VISITAS EN ADMIN */}
                 <div className="pt-6 border-t border-slate-100 space-y-4">
                     <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-l-4 border-purple-500 pl-3 flex items-center gap-2"><History className="w-4 h-4" /> Historial de Visitas</h4>
                     <div className="overflow-x-auto rounded-2xl border border-slate-100">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400">
                                <tr>
                                    <th className="px-4 py-3">Ciclo / Semana</th>
                                    <th className="px-4 py-3">Fecha y Hora</th>
                                    <th className="px-4 py-3">Supervisor</th>
                                    <th className="px-4 py-3 text-right">Ubicación</th>
                                </tr>
                            </thead>
                            <tbody className="text-xs">
                                {data.visits
                                    .filter(v => v.clientId === selectedClientForDetails.id)
                                    .sort((a,b) => b.timestamp - a.timestamp)
                                    .map(v => (
                                        <tr key={v.id} className="border-t border-slate-50 hover:bg-slate-50/50">
                                            <td className="px-4 py-3 font-bold text-indigo-900 uppercase">{getWeekName(v.weekId)}</td>
                                            <td className="px-4 py-3 font-medium text-slate-600">
                                                {new Date(v.timestamp).toLocaleDateString()} <span className="text-slate-400 text-[10px] ml-1">{new Date(v.timestamp).toLocaleTimeString()}</span>
                                            </td>
                                            <td className="px-4 py-3 font-bold text-slate-700 uppercase">
                                                {fullSupervisorsList.find(s => s.id === v.supervisorId)?.name || '???'}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <a href={`https://www.google.com/maps/search/?api=1&query=${v.latitude},${v.longitude}`} target="_blank" className="text-indigo-600 hover:underline font-bold text-[10px] uppercase">Ver Mapa</a>
                                            </td>
                                        </tr>
                                    ))}
                                {data.visits.filter(v => v.clientId === selectedClientForDetails.id).length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="px-4 py-6 text-center text-[10px] font-bold text-slate-400 uppercase italic">Sin visitas registradas</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                     </div>
                 </div>
              </div>
            </div>
          </div>
      )}

      {/* MODAL MOVER SEMANA */}
      {showMoveWeekModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
              <div className="bg-white rounded-[2.5rem] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                  <div className="p-8 space-y-6">
                      <div className="flex items-center justify-between">
                          <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
                              <Calendar className="w-6 h-6 text-indigo-600" />
                              Mover Clientes
                          </h3>
                          <button onClick={() => setShowMoveWeekModal(false)} className="p-2 bg-slate-100 text-slate-400 rounded-full hover:bg-slate-200 hover:text-slate-600 transition-colors">
                              <X className="w-5 h-5" />
                          </button>
                      </div>
                      <div className="space-y-4">
                          <p className="text-sm font-medium text-slate-600">
                              Selecciona la semana a la que deseas mover los <span className="font-black text-indigo-600">{selectedClientIds.size}</span> clientes seleccionados.
                          </p>
                          <div className="space-y-2">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Semana Destino</label>
                              <select
                                  value={targetMoveWeekId}
                                  onChange={(e) => setTargetMoveWeekId(e.target.value)}
                                  className="w-full p-4 border-2 border-slate-100 rounded-2xl font-bold text-slate-700 bg-slate-50 focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none appearance-none cursor-pointer transition-all"
                              >
                                  <option value="">-- SELECCIONAR SEMANA --</option>
                                  {data.weeks
                                      .filter(w => {
                                          if (selectedClientIds.size === 0) return true;
                                          const firstClientId = Array.from(selectedClientIds)[0];
                                          const client = data.clients.find(c => c.id === firstClientId);
                                          return w.financieraId === client?.financieraId;
                                      })
                                      .map(w => (
                                          <option key={w.id} value={w.id} className="font-medium text-slate-900">
                                              {w.name}
                                          </option>
                                      ))}
                              </select>
                          </div>
                      </div>
                      <div className="pt-4 flex gap-3">
                          <button onClick={() => setShowMoveWeekModal(false)} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-slate-200 transition-colors">
                              Cancelar
                          </button>
                          <button
                              onClick={() => {
                                  if (targetMoveWeekId) {
                                      onMoveClientsToWeek(Array.from(selectedClientIds), targetMoveWeekId);
                                      setShowMoveWeekModal(false);
                                      setSelectedClientIds(new Set());
                                      setTargetMoveWeekId('');
                                  } else {
                                      alert('Por favor selecciona una semana.');
                                  }
                              }}
                              disabled={!targetMoveWeekId}
                              className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-indigo-200 hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                              Confirmar
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* MODAL MOVER FINANCIERA */}
      {showMoveFinancieraModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
              <div className="bg-white rounded-[2.5rem] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                  <div className="p-8 space-y-6">
                      <div className="flex items-center justify-between">
                          <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
                              <ShieldCheck className="w-6 h-6 text-amber-600" />
                              Cambiar Financiera
                          </h3>
                          <button onClick={() => setShowMoveFinancieraModal(false)} className="p-2 bg-slate-100 text-slate-400 rounded-full hover:bg-slate-200 hover:text-slate-600 transition-colors">
                              <X className="w-5 h-5" />
                          </button>
                      </div>
                      <div className="space-y-4">
                          <p className="text-sm font-medium text-slate-600">
                              Selecciona la financiera a la que deseas mover los <span className="font-black text-amber-600">{selectedClientIds.size}</span> clientes seleccionados.
                          </p>
                          <div className="space-y-2">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Financiera Destino</label>
                              <select
                                  value={targetMoveFinancieraId}
                                  onChange={(e) => setTargetMoveFinancieraId(e.target.value)}
                                  className="w-full p-4 border-2 border-slate-100 rounded-2xl font-bold text-slate-700 bg-slate-50 focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 outline-none appearance-none cursor-pointer transition-all"
                              >
                                  <option value="">-- SELECCIONAR FINANCIERA --</option>
                                  {data.financieras.map(f => (
                                      <option key={f.id} value={f.id} className="font-medium text-slate-900">
                                          {f.name}
                                      </option>
                                  ))}
                              </select>
                          </div>
                      </div>
                      <div className="pt-4 flex gap-3">
                          <button onClick={() => setShowMoveFinancieraModal(false)} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-slate-200 transition-colors">
                              Cancelar
                          </button>
                          <button
                              onClick={() => {
                                  if (targetMoveFinancieraId) {
                                      onMoveClientsToFinanciera(Array.from(selectedClientIds), targetMoveFinancieraId);
                                      setShowMoveFinancieraModal(false);
                                      setSelectedClientIds(new Set());
                                      setTargetMoveFinancieraId('');
                                  } else {
                                      alert('Por favor selecciona una financiera.');
                                  }
                              }}
                              className="flex-1 py-4 bg-amber-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-amber-700 transition-colors shadow-lg shadow-amber-100"
                          >
                              Confirmar Cambio
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* MODAL REGISTRO/EDICION USUARIOS SISTEMA (VISORES/ADMINS) */}
      {showSysUserModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
              <div className="bg-white rounded-[2.5rem] w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                  <form onSubmit={handleSysUserSubmit} className="p-8 space-y-6">
                      <div className="flex items-center justify-between">
                          <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
                              {settingsSubTab === 'administradores' || (editingSysUser && editingSysUser.role === UserRole.ADMIN) ? (
                                  <><ShieldCheck className="w-6 h-6 text-indigo-900" /> {editingSysUser ? 'Editar Administrador' : 'Nuevo Administrador'}</>
                              ) : (
                                  <><UserCog className="w-6 h-6 text-indigo-600" /> {editingSysUser ? 'Editar Visor' : 'Nuevo Visor'}</>
                              )}
                          </h3>
                          <button type="button" onClick={() => setShowSysUserModal(false)} className="p-2 bg-slate-100 text-slate-400 rounded-full hover:bg-slate-200 hover:text-slate-600 transition-colors">
                              <X className="w-5 h-5" />
                          </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-1">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Nombre Completo</label>
                              <input 
                                  type="text" 
                                  value={sysUserName} 
                                  onChange={e => setSysUserName(e.target.value.toUpperCase())} 
                                  placeholder="EJ: JUAN PEREZ" 
                                  className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-900 outline-none focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all uppercase" 
                                  required 
                              />
                          </div>
                          <div className="space-y-1">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">PIN de Acceso (4 Dígitos)</label>
                              <input 
                                  type="text" 
                                  inputMode="numeric" 
                                  pattern="[0-9]*" 
                                  maxLength={4} 
                                  value={sysUserPin} 
                                  onChange={e => setSysUserPin(e.target.value.replace(/\D/g,''))} 
                                  placeholder="0000" 
                                  className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-900 outline-none focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-center text-xl tracking-[0.5em]" 
                                  required 
                              />
                          </div>
                      </div>

                      {(settingsSubTab === 'usuarios' || (editingSysUser && editingSysUser.role === UserRole.VIEWER)) && (
                          <>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                  <div className="space-y-2">
                                      <div className="flex justify-between items-center px-2">
                                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Asignar Financieras:</p>
                                          <div className="flex gap-2">
                                              <button type="button" onClick={() => setSysUserSelectedFins(data.financieras.map(f => f.id))} className="text-[8px] font-black uppercase text-indigo-600 hover:underline">Todos</button>
                                              <span className="text-[8px] text-slate-300">|</span>
                                              <button type="button" onClick={() => { setSysUserSelectedFins([]); setSysUserSelectedSups([]); }} className="text-[8px] font-black uppercase text-slate-400 hover:underline">Ninguno</button>
                                          </div>
                                      </div>
                                      <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto no-scrollbar border-2 border-slate-100 rounded-2xl p-3 bg-slate-50">
                                          {data.financieras.map(fin => (
                                              <label key={fin.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${sysUserSelectedFins.includes(fin.id) ? 'bg-white border-indigo-200 shadow-sm' : 'bg-transparent border-transparent hover:border-slate-200'}`}>
                                                  <input type="checkbox" checked={sysUserSelectedFins.includes(fin.id)} onChange={() => toggleSysUserFinanciera(fin.id)} className="hidden" />
                                                  {sysUserSelectedFins.includes(fin.id) ? <CheckSquare className="w-4 h-4 text-indigo-600" /> : <Square className="w-4 h-4 text-slate-300" />}
                                                  <span className="text-[10px] font-bold uppercase text-slate-700 truncate">{fin.name}</span>
                                              </label>
                                          ))}
                                      </div>
                                  </div>

                                  <div className="space-y-2">
                                      <div className="flex justify-between items-center px-2">
                                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Supervisores a Monitorear:</p>
                                          {sysUserSelectedFins.length > 0 && (
                                              <div className="flex gap-2">
                                                  <button type="button" onClick={() => setSysUserSelectedSups(fullSupervisorsList.filter(s => sysUserSelectedFins.includes(s.financieraId)).map(s => s.id))} className="text-[8px] font-black uppercase text-indigo-600 hover:underline">Todos</button>
                                                  <span className="text-[8px] text-slate-300">|</span>
                                                  <button type="button" onClick={() => setSysUserSelectedSups([])} className="text-[8px] font-black uppercase text-slate-400 hover:underline">Ninguno</button>
                                              </div>
                                          )}
                                      </div>
                                      <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto no-scrollbar border-2 border-slate-100 rounded-2xl p-3 bg-slate-50">
                                          {sysUserSelectedFins.length === 0 ? (
                                              <p className="text-[10px] text-slate-400 font-bold italic p-3 text-center">Selecciona al menos una financiera primero</p>
                                          ) : (
                                              fullSupervisorsList
                                                .filter(sup => sysUserSelectedFins.includes(sup.financieraId))
                                                .map(sup => (
                                                  <label key={sup.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${sysUserSelectedSups.includes(sup.id) ? 'bg-white border-indigo-200 shadow-sm' : 'bg-transparent border-transparent hover:border-slate-200'}`}>
                                                      <input type="checkbox" checked={sysUserSelectedSups.includes(sup.id)} onChange={() => toggleSysUserSupervisor(sup.id)} className="hidden" />
                                                      {sysUserSelectedSups.includes(sup.id) ? <CheckSquare className="w-4 h-4 text-indigo-600" /> : <Square className="w-4 h-4 text-slate-300" />}
                                                      <span className="text-[10px] font-bold uppercase text-slate-700 truncate">{sup.name}</span>
                                                  </label>
                                              ))
                                          )}
                                      </div>
                                  </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                  <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border-2 border-slate-100 cursor-pointer hover:border-indigo-300 transition-all">
                                      <input type="checkbox" checked={sysUserCanCreateSups} onChange={e => setSysUserCanCreateSups(e.target.checked)} className="w-5 h-5 text-indigo-600 rounded-lg focus:ring-indigo-500 border-slate-200" />
                                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-700">Permitir crear supervisores</span>
                                  </label>

                                  <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border-2 border-slate-100 cursor-pointer hover:border-indigo-300 transition-all">
                                      <input type="checkbox" checked={sysUserCanManageWeeks} onChange={e => setSysUserCanManageWeeks(e.target.checked)} className="w-5 h-5 text-indigo-600 rounded-lg focus:ring-indigo-500 border-slate-200" />
                                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-700">Permitir gestionar ciclos</span>
                                  </label>
                              </div>
                          </>
                      )}

                      {(settingsSubTab === 'administradores' || (editingSysUser && editingSysUser.role === UserRole.ADMIN)) && (
                          <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
                              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                              <p className="text-[10px] font-bold text-amber-700 uppercase leading-relaxed">
                                  Atención: Los administradores tienen acceso total a todas las financieras, supervisores y configuraciones del sistema. Use este rol con precaución.
                              </p>
                          </div>
                      )}

                      <div className="pt-4 flex gap-3">
                          <button type="button" onClick={() => setShowSysUserModal(false)} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-slate-200 transition-colors">
                              Cancelar
                          </button>
                          <button
                              type="submit"
                              className={`flex-1 py-4 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl transition-all active:scale-95 ${settingsSubTab === 'administradores' || (editingSysUser && editingSysUser.role === UserRole.ADMIN) ? 'bg-indigo-900 hover:bg-black shadow-indigo-200' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-100'}`}
                          >
                              {editingSysUser ? 'Guardar Cambios' : 'Confirmar Registro'}
                          </button>
                      </div>
                  </form>
              </div>
          </div>
      )}
      {/* MODAL CREAR API KEY - REDISEÑO PROFESIONAL COMPACTO */}
      {isCreatingApiKey && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
              <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setIsCreatingApiKey(false)}
                  className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              />
              <motion.div 
                  initial={{ scale: 0.95, opacity: 0, y: 10 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.95, opacity: 0, y: 10 }}
                  className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-200"
              >
                  <header className="bg-slate-900 px-6 py-4 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                          <Key className="w-4 h-4 text-indigo-400" />
                          <h3 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">
                              {editingApiKey ? 'Configurar Acceso' : 'Nueva Credencial API'}
                          </h3>
                      </div>
                      <button onClick={() => setIsCreatingApiKey(false)} className="text-slate-500 hover:text-white transition-colors">
                          <X className="w-4 h-4" />
                      </button>
                  </header>

                  <div className="p-6 space-y-6">
                      <div className="space-y-1.5">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Identificador del Cliente</label>
                          <input 
                              type="text" 
                              value={apiKeyName}
                              onChange={e => setApiKeyName(e.target.value)}
                              placeholder="Ej: Integración BI"
                              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 text-xs outline-none focus:ring-2 focus:ring-indigo-600 transition-all"
                          />
                      </div>

                      <div className="space-y-2.5">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Scope de Permisos</label>
                          <div className="grid grid-cols-1 gap-1.5">
                              {Object.values(ApiPermission).map(perm => (
                                  <button 
                                      key={perm}
                                      type="button"
                                      onClick={() => {
                                          if (apiKeyPermissions.includes(perm)) {
                                              setApiKeyPermissions(apiKeyPermissions.filter(p => p !== perm));
                                          } else {
                                              setApiKeyPermissions([...apiKeyPermissions, perm]);
                                          }
                                      }}
                                      className={`flex items-center justify-between px-4 py-2.5 rounded-xl border transition-all ${apiKeyPermissions.includes(perm) ? 'border-indigo-600 bg-indigo-50/50 text-indigo-700' : 'border-slate-100 bg-slate-50 text-slate-400'}`}
                                  >
                                      <span className="text-[10px] font-bold uppercase tracking-tight">
                                          {perm === ApiPermission.READ_CLIENTS ? 'Lectura Clientes' : 
                                           perm === ApiPermission.READ_VISITS ? 'Lectura Visitas' : 
                                           perm === ApiPermission.READ_SUPERVISORS ? 'Lectura Supervisores' : 
                                           perm === ApiPermission.READ_WEEKS ? 'Lectura Semanas' : 
                                           String(perm).replace('read:', 'Lectura ')}
                                      </span>
                                      {apiKeyPermissions.includes(perm) ? <CheckSquare className="w-4 h-4 text-indigo-600" /> : <Square className="w-4 h-4 opacity-50" />}
                                  </button>
                              ))}
                          </div>
                      </div>

                      <div className="space-y-2.5">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Asignación de Financieras</label>
                          <div className="flex flex-wrap gap-1.5 max-h-[140px] overflow-y-auto pr-1">
                              {data.financieras.map(fin => (
                                  <button 
                                      key={fin.id}
                                      type="button"
                                      onClick={() => {
                                          if (apiKeyFinancieras.includes(fin.id)) {
                                              setApiKeyFinancieras(apiKeyFinancieras.filter(id => id !== fin.id));
                                          } else {
                                              setApiKeyFinancieras([...apiKeyFinancieras, fin.id]);
                                          }
                                      }}
                                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${apiKeyFinancieras.includes(fin.id) ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 bg-white text-slate-400'}`}
                                  >
                                      <span className="text-[8px] font-black uppercase whitespace-nowrap">{fin.name}</span>
                                  </button>
                              ))}
                          </div>
                      </div>
                  </div>

                  <footer className="p-4 bg-slate-50 border-t border-slate-200 flex gap-2">
                      <button 
                          onClick={() => setIsCreatingApiKey(false)} 
                          className="flex-1 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors"
                      >
                          Cancelar
                      </button>
                      <button
                          disabled={!apiKeyName || apiKeyPermissions.length === 0 || apiKeyFinancieras.length === 0}
                          onClick={() => {
                              if (editingApiKey) {
                                  onUpdateApiKey(editingApiKey.id, editingApiKey.active, apiKeyPermissions, apiKeyFinancieras);
                              } else {
                                  onAddApiKey(apiKeyName, apiKeyPermissions, apiKeyFinancieras);
                              }
                              setIsCreatingApiKey(false);
                              setApiKeyName('');
                              setEditingApiKey(null);
                          }}
                          className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-indigo-100 hover:bg-slate-900 transition-all disabled:opacity-30 disabled:grayscale"
                      >
                          {editingApiKey ? 'Guardar' : 'Generar'}
                      </button>
                  </footer>
              </motion.div>
          </div>
      )}
    </div>
  );
};