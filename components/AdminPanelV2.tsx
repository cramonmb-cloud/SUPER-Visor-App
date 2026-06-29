import React, { useState, useEffect } from 'react';
import { Supervisor, Client, Visit, QRCodeBatch, AppState, SystemUser, RegistrationRules, DeviceMetadata, WorkWeek, Guarantee, Financiera, UserRole, GuarantorRange, ApiPermission, ApiKey } from '../types';
import { 
  Users, QrCode, MapPin, Plus, RefreshCw, Trash2, Printer, FileText, Settings, Save, 
  Archive, Camera, Shield, UserPlus, UserCheck, Pencil, X, Map as MapIcon, Filter, 
  Eye, ImageIcon, Globe, Home, Calendar, PlayCircle, StopCircle, Clock, CheckCircle, 
  Palette, Info, Monitor, Cpu, HardDrive, Smartphone, AlertTriangle, ArrowRight, 
  ShieldCheck, ShieldAlert, ChevronDown, ChevronUp, DollarSign, Download, FileJson, 
  Hash, Loader2, Image as ImageIconLucide, Zap, Activity, History, UserCog, 
  CheckSquare, Square, Search, RotateCcw, Bell, MoreHorizontal, ChevronLeft, 
  ChevronRight, HelpCircle, LogOut, Menu
} from 'lucide-react';
import { VisitsMap } from './VisitsMap';
import { CachedImage } from './CachedImage';

interface AdminPanelV2Props {
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

export const AdminPanelV2: React.FC<AdminPanelV2Props> = (props) => {
  const { data, isSuperAdmin, isViewer, viewerCanManageWeeks, onUpdateSettings, onAddSupervisor, onDeleteSupervisor, onUpdateSupervisor } = props;
  const [activeTab, setActiveTab] = useState<'supervisors' | 'clients' | 'map' | 'qrs' | 'settings'>('supervisors');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [finFilter, setFinFilter] = useState('ALL');
  const [supFilter, setSupFilter] = useState('ALL');
  const [weekFilter, setWeekFilter] = useState('ALL');
  const [isMapFullScreen, setIsMapFullScreen] = useState(false);

  // Cascading filters logic
  useEffect(() => {
    if (finFilter !== 'ALL') {
      const currentSup = data.supervisors.find(s => s.id === supFilter);
      if (currentSup && currentSup.financieraId !== finFilter) {
        setSupFilter('ALL');
      }
    }
  }, [finFilter, data.supervisors, supFilter]);

  useEffect(() => {
    if (supFilter !== 'ALL') {
      const sup = data.supervisors.find(s => s.id === supFilter);
      if (sup && sup.financieraId) {
        const currentWeek = data.weeks.find(w => w.id === weekFilter);
        if (currentWeek && currentWeek.financieraId !== sup.financieraId) {
          setWeekFilter('ALL');
        }
      }
    }
  }, [supFilter, data.weeks, weekFilter]);

  // Stats calculation
  const totalClients = data?.clients?.length || 0;
  const totalSupervisors = data?.supervisors?.length || 0;
  const activeWeeks = (data?.weeks || []).filter(w => w.isActive).length;

  const filteredSupervisors = (data?.supervisors || []).filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) || s.pin.includes(searchTerm);
    const matchesFin = finFilter === 'ALL' || s.financieraId === finFilter;
    return matchesSearch && matchesFin;
  });

  // Sync with design version change if user wants to go back to v1
  const handleToggleV1 = () => {
    if (!data?.settings) return;
    onUpdateSettings(
      data.settings.qrPrefix || 'TP',
      data.settings.nextSequence || '100000',
      data.settings.appName || 'SUPER VisorApp',
      data.settings.registrationRules,
      data.settings.versionName,
      data.settings.versionColor,
      data.settings.logoUrl,
      'v1',
      data.settings.logoGifUrl,
      data.settings.footerLogoUrl,
      data.settings.footerInfoHtml
    );
  };

  return (
    <div className="flex h-screen bg-[#F8FAFC] text-slate-600 font-sans">
      {/* Sidebar - EXACT DESIGN */}
      <aside className={`bg-white border-r border-slate-200 flex flex-col transition-all duration-300 ${isSidebarOpen ? 'w-64' : 'w-20'}`}>
        {/* Logo */}
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200 flex-shrink-0">
             {data?.settings?.logoUrl ? (
               <CachedImage src={data.settings.logoUrl} className="w-full h-full object-cover rounded-xl" />
             ) : (
               <Zap className="w-6 h-6 text-white fill-white" />
             )}
          </div>
          {isSidebarOpen && <span className="font-black text-slate-800 tracking-tight whitespace-nowrap">{data?.settings?.appName || 'SISTEMA V3.0'}</span>}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 space-y-2 mt-4">
          <NavItem 
            icon={<Users className="w-5 h-5" />} 
            label="Supervisores" 
            active={activeTab === 'supervisors'} 
            onClick={() => setActiveTab('supervisors')}
            collapsed={!isSidebarOpen}
          />
          <NavItem 
            icon={<FileText className="w-5 h-5" />} 
            label="Clientes" 
            active={activeTab === 'clients'} 
            onClick={() => setActiveTab('clients')}
            collapsed={!isSidebarOpen}
          />
          <NavItem 
            icon={<MapPin className="w-5 h-5" />} 
            label="Mapa" 
            active={activeTab === 'map'} 
            onClick={() => setActiveTab('map')}
            collapsed={!isSidebarOpen}
          />
          <NavItem 
            icon={<QrCode className="w-5 h-5" />} 
            label="Lotes QR" 
            active={activeTab === 'qrs'} 
            onClick={() => setActiveTab('qrs')}
            collapsed={!isSidebarOpen}
          />
          <NavItem 
            icon={<Settings className="w-5 h-5" />} 
            label="Ajustes" 
            active={activeTab === 'settings'} 
            onClick={() => setActiveTab('settings')}
            collapsed={!isSidebarOpen}
          />
        </nav>

        {/* Help Card */}
        {isSidebarOpen && (
          <div className="mx-4 mb-6 p-5 bg-indigo-50 rounded-[2rem] border border-indigo-100 relative overflow-hidden group">
            <div className="absolute -right-4 -top-4 w-16 h-16 bg-indigo-200/50 rounded-full blur-2xl group-hover:bg-indigo-300/50 transition-all"></div>
            <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center mb-3 text-indigo-600">
               <HelpCircle className="w-6 h-6" />
            </div>
            <p className="text-sm font-black text-slate-800 mb-1">¿Necesitas ayuda?</p>
            <p className="text-[11px] font-medium text-slate-500 mb-4">Consulta nuestra guía o contáctanos.</p>
            <button className="w-full bg-white text-indigo-600 py-3 rounded-2xl text-[11px] font-black uppercase tracking-wider shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2 group/btn">
               Ver ayuda <ArrowRight className="w-3 h-3 group-hover/btn:translate-x-1 transition-transform" />
            </button>
          </div>
        )}

        {/* User Profile */}
        <div className="p-4 border-t border-slate-100">
          <div className={`flex items-center gap-3 p-2 rounded-2xl hover:bg-slate-50 transition-all cursor-pointer group ${!isSidebarOpen && 'justify-center'}`}>
            <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden border-2 border-white shadow-sm flex-shrink-0">
               <img src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop" alt="Profile" />
            </div>
            {isSidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-slate-800 truncate leading-tight">Cristóbal</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">Administrador</p>
              </div>
            )}
            {isSidebarOpen && <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors" />}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Header */}
        <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-6 flex-1">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl transition-all">
              <Menu className="w-6 h-6" />
            </button>
            
            <div className="relative max-w-md w-full">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Buscar clientes, supervisores, lotes..." 
                className="w-full bg-slate-50 border border-slate-100 rounded-xl py-3 pl-12 pr-12 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 px-2 py-0.5 bg-white border border-slate-200 rounded-md text-[10px] font-black text-slate-400 uppercase tracking-tighter">
                ⌘K
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6">
             <div className="relative cursor-pointer group">
                <div className="p-3 bg-slate-50 text-slate-400 group-hover:text-indigo-600 transition-all rounded-xl relative">
                  <Bell className="w-5 h-5" />
                  <span className="absolute top-2 right-2 w-4 h-4 bg-red-500 border-2 border-white rounded-full text-[8px] font-black text-white flex items-center justify-center">3</span>
                </div>
             </div>
             
             <div className="flex items-center gap-3 pl-6 border-l border-slate-100">
                <div className="text-right">
                  <p className="text-sm font-black text-slate-800 leading-tight">Bienvenido, Cristóbal</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Administrador <ChevronDown className="inline w-3 h-3 ml-1" /></p>
                </div>
                <div className="w-10 h-10 rounded-full bg-indigo-50 border-2 border-white shadow-sm overflow-hidden">
                   <img src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop" alt="User" />
                </div>
             </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-auto bg-[#F8FAFC] p-8">
          <div className="max-w-7xl mx-auto space-y-8">
            
            {/* Page Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <h1 className="text-[28px] font-black text-slate-800 tracking-tight">Administración de Supervisores</h1>
                <p className="text-sm font-medium text-slate-400">Gestiona y controla todos los supervisores del sistema.</p>
              </div>
              <div className="flex items-center gap-3">
                <button className="bg-indigo-600 text-white px-6 py-3.5 rounded-2xl font-black text-sm flex items-center gap-3 shadow-lg shadow-indigo-200 hover:bg-indigo-700 active:scale-[0.98] transition-all">
                  <Plus className="w-5 h-5" /> Nuevo supervisor
                </button>
                <button className="bg-white border border-slate-200 text-slate-600 px-6 py-3.5 rounded-2xl font-black text-sm flex items-center gap-3 hover:bg-slate-50 transition-all">
                  <Download className="w-5 h-5" /> Importar
                </button>
                <button className="p-3.5 bg-white border border-slate-200 text-slate-400 hover:text-slate-600 rounded-2xl transition-all">
                   <MoreHorizontal className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Stats Overview */}
            {activeTab === 'supervisors' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard 
                  icon={<Users className="w-6 h-6 text-white" />} 
                  bgIcon="bg-indigo-600 shadow-indigo-200"
                  label="CARTERA TOTAL"
                  value={totalClients}
                  suffix="Clientes"
                  trend="+ 12 esta semana"
                  trendUp={true}
                  bgColor="bg-indigo-50/30 border-indigo-100/50"
                />
                <StatCard 
                  icon={<UserPlus className="w-6 h-6 text-white" />} 
                  bgIcon="bg-purple-600 shadow-purple-200"
                  label="EQUIPO"
                  value={totalSupervisors}
                  suffix="Supervisores"
                  trend="+ 2 nuevos"
                  trendUp={true}
                  bgColor="bg-purple-50/30 border-purple-100/50"
                />
                <StatCard 
                  icon={<RotateCcw className="w-6 h-6 text-white" />} 
                  bgIcon="bg-emerald-500 shadow-emerald-100"
                  label="CICLO ACTIVO"
                  value={activeWeeks}
                  suffix="Semanas activas"
                  trend="Ver detalle"
                  trendUp={true}
                  bgColor="bg-emerald-50/30 border-emerald-100/50"
                />
              </div>
            )}

            {/* Content Switcher */}
            {activeTab === 'supervisors' && (
              <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-200/50 overflow-hidden">
               {/* Filter Bar */}
               <div className="p-6 border-b border-slate-100 flex flex-wrap items-center gap-4">
                  <div className="relative flex-1 min-w-[240px]">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type="text" 
                      placeholder="Buscar supervisor..." 
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3.5 pl-12 pr-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all"
                    />
                  </div>

                  <div className="relative group">
                    <select 
                      value={finFilter}
                      onChange={(e) => setFinFilter(e.target.value)}
                      className="appearance-none bg-slate-50/50 border border-slate-100 rounded-[1.25rem] pl-5 pr-10 py-3.5 text-sm font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all cursor-pointer"
                    >
                      <option value="ALL">TODAS LAS FINANCIERAS</option>
                      {data?.financieras?.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none flex flex-col items-end">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Financiera</p>
                      <ChevronDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </div>
                  
                  <FilterGroup label="Auditoría" value="Todas" />
                  <FilterGroup label="Permisos" value="Todos" />
                  <FilterGroup label="Estado" value="Todos" />
                  
                  <button onClick={() => { setSearchTerm(''); setFinFilter('ALL'); }} className="flex items-center gap-2 px-6 py-3.5 text-slate-400 hover:text-indigo-600 font-black text-xs uppercase tracking-widest transition-all">
                    <RotateCcw className="w-4 h-4" /> Limpiar filtros
                  </button>
               </div>

               {/* Table Content */}
               <div className="overflow-x-auto">
                 <table className="w-full">
                   <thead>
                     <tr className="bg-[#F8FAFC] border-b border-slate-100">
                        <th className="px-8 py-5 text-left"><div className="w-5 h-5 rounded border-2 border-slate-200"></div></th>
                        <th className="px-6 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Supervisor <ChevronDown className="inline w-3 h-3 ml-1" /></th>
                        <th className="px-6 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Financiera</th>
                        <th className="px-6 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">PIN</th>
                        <th className="px-6 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Permisos</th>
                        <th className="px-6 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Auditoría</th>
                        <th className="px-6 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Estado</th>
                        <th className="px-8 py-5 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Acciones</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-50">
                      {filteredSupervisors.map((s) => {
                        const financiera = (data?.financieras || []).find(f => f.id === s.financieraId);
                        return (
                          <tr key={s.id} className="hover:bg-slate-50/50 transition-all group">
                             <td className="px-8 py-6"><div className="w-5 h-5 rounded border-2 border-slate-200 group-hover:border-indigo-200 transition-all"></div></td>
                             <td className="px-6 py-6">
                                <div className="flex items-center gap-4">
                                  <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 font-black text-sm flex items-center justify-center uppercase border-2 border-white shadow-sm overflow-hidden">
                                     {financiera?.logoUrl ? (
                                       <CachedImage src={financiera.logoUrl} className="w-full h-full object-cover" />
                                     ) : s.name.substring(0, 1)}
                                  </div>
                                  <div>
                                    <p className="text-sm font-black text-slate-800 leading-tight">{s.name}</p>
                                    <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-tighter">{financiera?.name || 'SIN ASIGNAR'}</p>
                                  </div>
                                </div>
                             </td>
                             <td className="px-6 py-6"><span className="text-[10px] font-black text-slate-300">---</span></td>
                             <td className="px-6 py-6"><span className="text-sm font-bold text-slate-600">{s.pin}</span></td>
                             <td className="px-6 py-6">
                                <span className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest ${s.canEditClients ? 'bg-purple-50 text-purple-600' : 'bg-indigo-50 text-indigo-600'}`}>
                                  {s.canEditClients ? 'Edición' : 'Solo Lectura'}
                                </span>
                             </td>
                             <td className="px-6 py-6 text-center">
                                <span className="inline-flex items-center gap-2 px-4 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg text-[9px] font-black uppercase tracking-widest">
                                  <ShieldCheck className="w-3 h-3" /> Íntegro
                                </span>
                             </td>
                             <td className="px-6 py-6">
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                                  <span className="text-xs font-bold text-slate-600">Activo</span>
                                </div>
                             </td>
                             <td className="px-8 py-6 text-right">
                                <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                  <button className="p-2.5 bg-white border border-slate-100 text-slate-400 hover:text-indigo-600 hover:border-indigo-100 hover:shadow-sm rounded-xl transition-all"><Eye className="w-4 h-4" /></button>
                                  <button onClick={() => {/* handle edit */}} className="p-2.5 bg-white border border-slate-100 text-slate-400 hover:text-indigo-600 hover:border-indigo-100 hover:shadow-sm rounded-xl transition-all"><Pencil className="w-4 h-4" /></button>
                                  <button onClick={() => onDeleteSupervisor(s.id)} className="p-2.5 bg-white border border-slate-100 text-slate-400 hover:text-red-600 hover:border-red-100 hover:shadow-sm rounded-xl transition-all"><Trash2 className="w-4 h-4" /></button>
                                </div>
                             </td>
                          </tr>
                        );
                      })}
                      {filteredSupervisors.length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-8 py-12 text-center">
                            <p className="text-sm font-bold text-slate-400">No se encontraron supervisores</p>
                          </td>
                        </tr>
                      )}
                   </tbody>
                 </table>
               </div>

               {/* Pagination footer */}
               <div className="px-8 py-6 border-t border-slate-100 bg-[#F8FAFC]/50 flex items-center justify-between">
                  <p className="text-xs font-bold text-slate-400">Mostrando {filteredSupervisors.length} de {totalSupervisors} supervisores</p>
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <button className="p-2 bg-white border border-slate-200 text-slate-400 hover:text-slate-600 rounded-lg transition-all"><ChevronLeft className="w-4 h-4" /></button>
                      <button className="w-8 h-8 flex items-center justify-center bg-indigo-600 text-white rounded-lg text-xs font-black shadow-lg shadow-indigo-100 transition-all">1</button>
                      <button className="w-8 h-8 flex items-center justify-center bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-xs font-black transition-all">2</button>
                      <button className="p-2 bg-white border border-slate-200 text-slate-400 hover:text-slate-600 rounded-lg transition-all"><ChevronRight className="w-4 h-4" /></button>
                    </div>
                    
                    <div className="flex items-center gap-3">
                       <div className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl cursor-not-allowed">
                          <span className="text-xs font-bold text-slate-600">10 por página</span>
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                       </div>
                    </div>
                  </div>
               </div>
              </div>
            )}

            {activeTab === 'clients' && (
              <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-200/50 p-8 text-center py-20">
                 <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-6">
                    <FileText className="w-10 h-10" />
                 </div>
                 <h2 className="text-xl font-black text-slate-800">Módulo de Clientes</h2>
                 <p className="text-slate-400 max-w-sm mx-auto mt-2">Próximamente: Administración avanzada de clientes con auditoría fotográfica integrada estilo V2.</p>
                 <button onClick={handleToggleV1} className="mt-8 text-xs font-black text-indigo-600 uppercase tracking-widest hover:underline">Usar V1 para gestionar clientes</button>
              </div>
            )}

            {activeTab === 'map' && (
              <div className={`bg-white rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-200/50 overflow-hidden ${isMapFullScreen ? 'fixed inset-0 z-[200] rounded-none h-screen w-screen' : 'h-[700px] flex flex-col'}`}>
                 <div className="p-6 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4 bg-white/80 backdrop-blur-md">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
                            <MapPin className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-slate-800 tracking-tight">Mapa en Tiempo Real</h2>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Seguimiento de visitas y registros v2</p>
                        </div>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-3">
                        <select 
                          value={finFilter}
                          onChange={(e) => setFinFilter(e.target.value)}
                          className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-[10px] font-black uppercase text-slate-800 focus:ring-2 focus:ring-indigo-500/20 outline-none cursor-pointer"
                        >
                          <option value="ALL">TODAS LAS FINANCIERAS</option>
                          {data?.financieras?.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                        </select>

                        <select 
                          value={supFilter}
                          onChange={(e) => setSupFilter(e.target.value)}
                          className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-[10px] font-black uppercase text-slate-800 focus:ring-2 focus:ring-indigo-500/20 outline-none cursor-pointer"
                        >
                          <option value="ALL">TODOS LOS SUPERVISORES</option>
                          {data?.supervisors?.filter(s => finFilter === 'ALL' || s.financieraId === finFilter).map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>

                        <select 
                          value={weekFilter}
                          onChange={(e) => setWeekFilter(e.target.value)}
                          className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-[10px] font-black uppercase text-slate-800 focus:ring-2 focus:ring-indigo-500/20 outline-none cursor-pointer"
                        >
                          <option value="ALL">TODAS LAS SEMANAS</option>
                          {data?.weeks?.filter(w => {
                            if (finFilter !== 'ALL' && w.financieraId !== finFilter) return false;
                            if (supFilter !== 'ALL') {
                              const sup = data.supervisors.find(s => s.id === supFilter);
                              if (sup && w.financieraId !== sup.financieraId) return false;
                            }
                            return true;
                          }).map(w => (
                            <option key={w.id} value={w.id}>{w.name}</option>
                          ))}
                        </select>

                        <button 
                            onClick={() => setIsMapFullScreen(!isMapFullScreen)}
                            className="bg-indigo-600 text-white px-5 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all"
                        >
                            <Monitor className="w-4 h-4" />
                            {isMapFullScreen ? 'Salir' : 'Fullscreen'}
                        </button>
                    </div>
                 </div>

                 <div className="flex-1 relative">
                    <VisitsMap 
                        visits={data.visits.filter(v => {
                            if (weekFilter !== 'ALL' && v.weekId !== weekFilter) return false;
                            if (supFilter !== 'ALL' && v.supervisorId !== supFilter) return false;
                            if (finFilter !== 'ALL') {
                                const client = data.clients.find(c => c.id === v.clientId);
                                if (client && client.financieraId !== finFilter) return false;
                            }
                            return true;
                        })} 
                        clients={data.clients.filter(c => {
                            if (finFilter !== 'ALL' && c.financieraId !== finFilter) return false;
                            if (supFilter !== 'ALL' && c.supervisorId !== supFilter) return false;
                            if (weekFilter !== 'ALL' && c.weekId !== weekFilter) return false;
                            return true;
                        })} 
                        supervisors={data.supervisors}
                        financieras={data.financieras}
                        onClientClick={(client) => {
                            // Since this is V2, it might not have the detail modal yet, 
                            // but we can at least log it or redirect if V1 detail modal was global.
                            // For now, let's just log as per the original V2 code.
                            console.log("Client clicked:", client);
                        }}
                    />
                 </div>
              </div>
            )}

            {activeTab === 'qrs' && (
              <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-200/50 p-8 text-center py-20">
                 <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
                    <QrCode className="w-10 h-10" />
                 </div>
                 <h2 className="text-xl font-black text-slate-800">Generación de QR</h2>
                 <p className="text-slate-400 max-w-sm mx-auto mt-2">El generador masivo de códigos QR está siendo optimizado para esta interfaz.</p>
                 <button onClick={handleToggleV1} className="mt-8 text-xs font-black text-indigo-600 uppercase tracking-widest hover:underline">Usar V1 para generar QRs</button>
              </div>
            )}

            {activeTab === 'settings' && (
              <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-200/50 p-10">
                 <div className="flex justify-between items-center mb-10">
                    <div>
                      <h2 className="text-2xl font-black text-slate-800 tracking-tight">Configuración del Sistema</h2>
                      <p className="text-sm font-medium text-slate-400">Personaliza tu experiencia y gestiona las versiones del diseño.</p>
                    </div>
                    <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
                       <Settings className="w-6 h-6" />
                    </div>
                 </div>

                 <div className="max-w-md space-y-8">
                    <div className="space-y-3">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Diseño Preferido</label>
                       <div className="grid grid-cols-2 gap-4 p-2 bg-slate-50 rounded-2xl border border-slate-100">
                          <button onClick={() => handleToggleV1()} className="py-4 bg-white border border-slate-200 text-slate-400 font-black text-[10px] uppercase tracking-widest rounded-xl hover:text-indigo-600 transition-all">Diseño V1 (Clásico)</button>
                          <div className="py-4 bg-indigo-600 shadow-lg shadow-indigo-100 text-white font-black text-[10px] uppercase tracking-widest rounded-xl text-center flex items-center justify-center gap-2">
                             <CheckCircle className="w-3 h-3" /> Diseño V2
                          </div>
                       </div>
                    </div>

                    <div className="p-6 bg-amber-50 border border-amber-100 rounded-3xl">
                       <div className="flex gap-4">
                          <div className="w-10 h-10 bg-amber-500 text-white rounded-xl flex items-center justify-center flex-shrink-0">
                             <Zap className="w-5 h-5 fill-white" />
                          </div>
                          <div>
                             <p className="text-sm font-black text-amber-900 leading-tight">Beta del Diseño V2</p>
                             <p className="text-[11px] font-medium text-amber-700/80 mt-1">Estamos migrando todos los módulos a esta nueva interfaz. Algunas secciones avanzadas aún requieren el panel clásico.</p>
                          </div>
                       </div>
                    </div>
                 </div>
              </div>
            )}

            {/* V1 Toggle for testing */}
            <div className="flex justify-center pt-8">
               <button 
                 onClick={handleToggleV1}
                 className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-indigo-600 transition-all"
               >
                 Cambiar a diseño V1 <RotateCcw className="w-3 h-3" />
               </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

// Subcomponents
const NavItem = ({ icon, label, active, onClick, collapsed }: { icon: any, label: string, active: boolean, onClick: () => void, collapsed: boolean }) => (
  <button 
    onClick={onClick}
    className={`w-full flex items-center gap-4 font-black transition-all duration-300 group
      ${collapsed ? 'justify-center py-4' : 'px-5 py-4 rounded-2xl'}
      ${active ? 'bg-indigo-50 text-indigo-600 shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-indigo-600'}
    `}
  >
    <div className={`transition-transform duration-300 ${active ? 'scale-110' : 'group-hover:scale-110'}`}>{icon}</div>
    {!collapsed && <span className="text-[13px] tracking-tight">{label}</span>}
  </button>
);

const StatCard = ({ icon, bgIcon, label, value, suffix, trend, trendUp, bgColor }: any) => (
  <div className={`p-8 rounded-[2.5rem] border ${bgColor} flex flex-col gap-6 group hover:scale-[1.02] transition-all duration-500 cursor-default hover:shadow-2xl hover:shadow-indigo-100`}>
    <div className="flex items-center gap-5">
      <div className={`w-14 h-14 ${bgIcon} rounded-[1.25rem] flex items-center justify-center shadow-lg transition-transform group-hover:rotate-6`}>
        {icon}
      </div>
      <div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-black text-slate-800 tracking-tighter">{value}</span>
          <span className="text-xs font-bold text-slate-400">{suffix}</span>
        </div>
      </div>
    </div>
    <div className="flex items-center gap-2">
       <span className={`text-[10px] font-black uppercase tracking-widest ${trendUp ? 'text-indigo-600' : 'text-slate-400'}`}>
         {trendUp ? '↑' : '→'} {trend}
       </span>
    </div>
  </div>
);

const FilterGroup = ({ label, value }: { label: string, value: string }) => (
  <div className="flex items-center gap-3 bg-slate-50/50 border border-slate-100 rounded-[1.25rem] px-5 py-3.5 group hover:border-indigo-100 transition-all cursor-pointer">
    <div>
      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">{label}</p>
      <p className="text-sm font-black text-slate-800 leading-none">{value}</p>
    </div>
    <ChevronDown className="w-4 h-4 text-slate-300 group-hover:text-indigo-400 transition-colors" />
  </div>
);
