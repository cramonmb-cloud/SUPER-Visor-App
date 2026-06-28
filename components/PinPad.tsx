import React, { useState, useEffect } from 'react';
import { Lock, Delete, Download, Share } from 'lucide-react';
import { CachedImage } from './CachedImage';

interface PinPadProps {
  onSuccess: (pin: string) => void;
  title?: string;
  error?: string;
  logoUrl?: string;
  logoGifUrl?: string;
}

export const PinPad: React.FC<PinPadProps> = ({ onSuccess, title = "Ingrese PIN", error, logoUrl, logoGifUrl }) => {
  const [pin, setPin] = useState('');
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    
    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(userAgent));

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  const handleNum = (num: string) => {
    if (pin.length < 4) {
      setPin(prev => prev + num);
      if ((pin + num).length === 4) {
          onSuccess(pin + num);
      }
    }
  };

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1));
  };

  return (
    <div className="flex flex-col items-center justify-center w-full max-w-sm mx-auto p-6 bg-white rounded-2xl shadow-xl">
      <div className={`mb-6 flex items-center justify-center overflow-hidden transition-all duration-500 ${(logoGifUrl || logoUrl) ? 'w-24 h-24 rounded-full shadow-2xl border-4 border-white' : 'p-4 bg-indigo-50 rounded-full w-20 h-20'}`}>
        {logoGifUrl ? (
          <CachedImage src={logoGifUrl} alt="Logo Animado" className="w-full h-full object-cover" />
        ) : logoUrl ? (
          <CachedImage src={logoUrl} alt="Logo" className="w-full h-full object-cover" />
        ) : (
          <Lock className="w-8 h-8 text-indigo-600" />
        )}
      </div>
      <p className="text-sm text-slate-500 mb-6">Código de 4 dígitos</p>
      
      <div className="flex gap-4 mb-8">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`w-4 h-4 rounded-full transition-colors duration-200 ${
              pin.length > i ? 'bg-indigo-600' : 'bg-slate-200'
            }`}
          />
        ))}
      </div>

      {error && (
        <p className="text-red-500 text-sm mb-4 animate-pulse">{error}</p>
      )}

      <div className="grid grid-cols-3 gap-4 w-full">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
          <button
            key={num}
            onClick={() => handleNum(num.toString())}
            className="h-16 w-full rounded-xl bg-slate-50 text-2xl font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 active:bg-indigo-100 transition-colors"
          >
            {num}
          </button>
        ))}
        <div className="col-span-1"></div> {/* Spacer */}
        <button
          onClick={() => handleNum('0')}
          className="h-16 w-full rounded-xl bg-slate-50 text-2xl font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 active:bg-indigo-100 transition-colors"
        >
          0
        </button>
        <button
          onClick={handleDelete}
          className="h-16 w-full rounded-xl flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
        >
          <Delete className="w-6 h-6" />
        </button>
      </div>

      {deferredPrompt && (
        <button
          onClick={handleInstallClick}
          className="mt-8 w-full py-4 bg-indigo-600 text-white rounded-xl font-black uppercase text-xs shadow-lg shadow-indigo-200 active:scale-95 transition-all flex items-center justify-center gap-2 animate-in fade-in slide-in-from-bottom-4"
        >
          <Download className="w-4 h-4" /> Instalar App
        </button>
      )}

      {isIOS && !deferredPrompt && (
        <div className="mt-8 p-4 bg-slate-50 rounded-xl text-center animate-in fade-in slide-in-from-bottom-4 border border-slate-100">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Para instalar en iOS:</p>
          <p className="text-xs font-bold text-slate-600 flex items-center justify-center gap-1">
            Toca <span className="p-1 bg-slate-200 rounded"><Share className="w-3 h-3 inline" /></span> y luego "Agregar a Inicio"
          </p>
        </div>
      )}
    </div>
  );
};