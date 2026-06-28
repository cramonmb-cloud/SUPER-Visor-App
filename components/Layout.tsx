import React from 'react';
import { LogOut, LayoutDashboard, RefreshCw } from 'lucide-react';
import { CachedImage } from './CachedImage';

interface LayoutProps {
  children: React.ReactNode;
  userRole: string;
  userName: string;
  appName?: string;
  onLogout: () => void;
  onRefresh?: () => void;
  assignedFinancieraNames?: string;
  appLogo?: string;
}

export const Layout: React.FC<LayoutProps> = ({ children, userRole, userName, appName = "SUPER VisorApp", onLogout, onRefresh, assignedFinancieraNames, appLogo }) => {
  return (
    <div className="flex flex-col h-screen bg-slate-100">
      <header className="bg-white shadow-sm z-10 flex-none relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            {/* Logo y Nombre App */}
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl shadow-lg flex items-center justify-center overflow-hidden transition-all duration-500 ${appLogo ? 'bg-white border border-slate-100' : 'bg-indigo-600 shadow-indigo-200'}`}>
                {appLogo ? (
                  <CachedImage src={appLogo} alt="Logo" className="w-full h-full object-cover" />
                ) : (
                  <LayoutDashboard className="w-5 h-5 text-white" />
                )}
              </div>
              {onRefresh && (
                <button
                  onClick={onRefresh}
                  className="p-2 bg-blue-50 text-blue-900 hover:bg-blue-900 hover:text-white rounded-xl transition-all active:scale-95 shadow-lg shadow-blue-100"
                  title="Refrescar Datos"
                >
                  <RefreshCw className="w-5 h-5" />
                </button>
              )}
              <div className="hidden xs:block">
                <h1 className="text-sm font-black text-slate-900 leading-none tracking-tight uppercase">{appName}</h1>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{userRole}</p>
              </div>
            </div>
            
            {/* Saludo Usuario y Logout - SIEMPRE VISIBLE */}
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-end">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-0.5">
                  {assignedFinancieraNames ? `Financiera: ${assignedFinancieraNames}` : 'Hola,'}
                </span>
                <span className="text-sm sm:text-base font-black text-slate-800 uppercase leading-none max-w-[140px] truncate text-right">
                  {userName}
                </span>
              </div>

              <div className="h-8 w-px bg-slate-100 mx-1"></div>
              <button
                onClick={onLogout}
                className="p-2.5 bg-red-50 text-red-500 hover:bg-red-600 hover:text-white rounded-xl transition-all active:scale-95 shadow-sm"
                title="Cerrar Sesión"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>
      <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto h-full">
          {children}
        </div>
      </main>
    </div>
  );
};