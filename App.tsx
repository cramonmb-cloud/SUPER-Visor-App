import React, { useState, useEffect } from 'react';
import { Loader2, RefreshCw, Trash2, RotateCcw, X } from 'lucide-react';
import { VERSION } from './version';
import { Layout } from './components/Layout';
import { PinPad } from './components/PinPad';
import { AdminPanel } from './components/AdminPanel';
import { SupervisorPanel } from './components/SupervisorPanel';
import { AppState, UserRole, Supervisor, Client, Visit, QRCodeBatch, SystemSettings, SystemUser, RegistrationRules, WorkWeek, DeviceMetadata, Financiera, GuarantorRange, Guarantor, ApiKey, ApiPermission, Guarantee } from './types';
import { ADMIN_PIN, SUPER_ADMIN_NAME } from './constants';
import { db, auth } from './services/firebase';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getDeviceMetadata } from './services/deviceService';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  setDoc, 
  deleteDoc, 
  doc, 
  query, 
  orderBy,
  updateDoc,
  arrayUnion,
  getDoc,
  getDocs,
  where,
  writeBatch,
  limit
} from 'firebase/firestore';

const CURRENT_APP_VERSION = "8.0-SYNC-FIX";

const INITIAL_STATE: AppState = {
  supervisors: [],
  clients: [],
  visits: [],
  qrBatches: [],
  settings: { 
      qrPrefix: 'TP', 
      nextSequence: '100000', 
      appName: 'SUPER VisorApp', 
      logoUrl: '',
      versionName: 'SISTEMA V1.0',
      versionColor: '#4f46e5',
      registrationRules: { requireFacade: true, requireGuarantee: true },
      footerLogoUrl: '',
      footerInfoHtml: ''
  },
  systemUsers: [],
  weeks: [],
  financieras: [],
  apiKeys: []
};

interface CurrentUserContext {
  role: UserRole;
  data?: Supervisor | SystemUser;
  name: string;
}

const setMetaTag = (name: string, content: string) => {
    let meta = document.querySelector(`meta[name='${name}']`);
    if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('name', name);
        document.head.appendChild(meta);
    }
    meta.setAttribute('content', content);
};

const setLinkTag = (rel: string, href: string) => {
    let link = document.querySelector(`link[rel='${rel}']`) as HTMLLinkElement;
    if (!link) {
        link = document.createElement('link');
        link.rel = rel;
        document.head.appendChild(link);
    }
    link.href = href;
};

const App: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [syncCount, setSyncCount] = useState(0); // Para trackear que recibimos datos reales
  const [appState, setAppState] = useState<AppState>(INITIAL_STATE);
  const [currentUser, setCurrentUser] = useState<CurrentUserContext | null>(null);
  const [showFooterModal, setShowFooterModal] = useState(false);

  // LOGICA PWA DINAMICA
  useEffect(() => {
      const settings = appState.settings;
      if (!settings) return;
      const appName = settings.appName || 'SUPER VisorApp';
      const logoUrl = settings.logoUrl;
      const themeColor = settings.versionColor || "#4f46e5";
      document.title = appName;
      setMetaTag('application-name', appName);
      setMetaTag('apple-mobile-web-app-title', appName);
      setMetaTag('theme-color', themeColor);
      if (logoUrl) {
          setLinkTag('icon', logoUrl);
          setLinkTag('apple-touch-icon', logoUrl);
      }
      const manifest = {
          name: appName, short_name: appName, start_url: ".", display: "standalone",
          background_color: "#ffffff", theme_color: themeColor, orientation: "portrait",
          icons: logoUrl ? [{ src: logoUrl, sizes: "512x512", type: "image/png", purpose: "any maskable" }] : []
      };
      const linkManifest = document.querySelector("link[rel='manifest']") as HTMLLinkElement;
      if (linkManifest) linkManifest.href = URL.createObjectURL(new Blob([JSON.stringify(manifest)], {type: 'application/json'}));
  }, [appState.settings]);

  // 1. Core Startup Listeners (Only lightweight configuration collections)
  useEffect(() => {
    let unsubs: (() => void)[] = [];
    
    const setupCoreListeners = () => {
      // Listener de Ajustes (Esencial para arrancar)
      unsubs.push(onSnapshot(doc(db, 'settings', 'global'), (snap) => {
        if (snap.exists()) {
            setAppState(p => ({ ...p, settings: snap.data() as SystemSettings }));
            setSyncCount(c => c + 1);
        }
      }));

      // Listener de Semanas (Esencial para el banner)
      unsubs.push(onSnapshot(query(collection(db, 'weeks'), orderBy('startDate', 'desc'), limit(100)), (snap) => {
          const weeks = snap.docs.map(d => ({ id: d.id, ...d.data() } as WorkWeek));
          setAppState(p => ({ ...p, weeks }));
          setSyncCount(c => c + 1);
      }));

      unsubs.push(onSnapshot(collection(db, 'supervisors'), (snap) => {
          setAppState(p => ({ ...p, supervisors: snap.docs.map(d => ({ id: d.id, ...d.data() } as Supervisor)) }));
      }));

      unsubs.push(onSnapshot(collection(db, 'system_users'), (snap) => {
          setAppState(p => ({ ...p, systemUsers: snap.docs.map(d => ({ id: d.id, ...d.data() } as SystemUser)) }));
      }));

      unsubs.push(onSnapshot(collection(db, 'financieras'), (snap) => {
          setAppState(p => ({ ...p, financieras: snap.docs.map(d => ({ id: d.id, ...d.data() } as Financiera)) }));
      }));

      unsubs.push(onSnapshot(collection(db, 'api_keys'), (snap) => {
          setAppState(p => ({ ...p, apiKeys: snap.docs.map(d => ({ id: d.id, ...d.data() } as ApiKey)) }));
      }));
    };

    onAuthStateChanged(auth, (user) => { 
        if (user) setupCoreListeners(); 
        else signInAnonymously(auth).catch(e => console.error("Auth Error:", e)); 
    });

    return () => unsubs.forEach(f => f());
  }, []);

  // 2. Dynamic, Role-based Resource Listeners (Loaded only AFTER successful login)
  useEffect(() => {
    if (!currentUser) {
      // Clean up heavy state when logged out to prevent carryover
      setAppState(p => ({
        ...p,
        clients: [],
        visits: [],
        qrBatches: []
      }));
      return;
    }

    let unsubs: (() => void)[] = [];
    const oneYearAgo = Date.now() - (365 * 24 * 60 * 60 * 1000);

    if (currentUser.role === UserRole.SUPERVISOR) {
      const supervisor = currentUser.data as Supervisor;
      const finId = supervisor.financieraId || '';

      // Stream clients only belonging to their own financiera (for renewals/coincidences checking)
      // This is dynamic, scoped, and highly performant compared to global streaming of everything.
      const clientsQuery = query(
        collection(db, 'clients'), 
        where('financieraId', '==', finId),
        limit(2000)
      );

      unsubs.push(onSnapshot(clientsQuery, (snap) => {
        setAppState(p => ({ 
          ...p, 
          clients: snap.docs.map(d => ({ id: d.id, ...d.data() } as Client)) 
        }));
      }));

      // Stream visits only registered by this specific supervisor for the last year
      // This reduces visits data from tens of thousands of other supervisors down to theirs only!
      const visitsQuery = query(
        collection(db, 'visits'),
        where('supervisorId', '==', supervisor.id)
      );

      unsubs.push(onSnapshot(visitsQuery, (snap) => {
        setAppState(p => ({ 
          ...p, 
          visits: snap.docs.map(d => ({ id: d.id, ...d.data() } as Visit)) 
        }));
      }));

      // Stream only QR batches corresponding to their company
      const qrQuery = query(
        collection(db, 'qr_batches'),
        where('financieraId', '==', finId),
        limit(150)
      );

      unsubs.push(onSnapshot(qrQuery, (snap) => {
        setAppState(p => ({ 
          ...p, 
          qrBatches: snap.docs.map(d => ({ id: d.id, ...d.data() } as QRCodeBatch)) 
        }));
      }));

    } else {
      // Admins and viewers stream global data (but we enforce proper limits to keep server-side & client-side fast)
      const clientsQuery = query(
        collection(db, 'clients'),
        orderBy('registeredAt', 'desc'),
        limit(3000)
      );
      unsubs.push(onSnapshot(clientsQuery, (snap) => {
        setAppState(p => ({ 
          ...p, 
          clients: snap.docs.map(d => ({ id: d.id, ...d.data() } as Client)) 
        }));
      }));

      const visitsQuery = query(
        collection(db, 'visits'),
        where('timestamp', '>=', oneYearAgo),
        orderBy('timestamp', 'desc'),
        limit(2500)
      );
      unsubs.push(onSnapshot(visitsQuery, (snap) => {
        setAppState(p => ({ 
          ...p, 
          visits: snap.docs.map(d => ({ id: d.id, ...d.data() } as Visit)) 
        }));
      }));

      const qrQuery = query(
        collection(db, 'qr_batches'),
        orderBy('createdAt', 'desc'),
        limit(500)
      );
      unsubs.push(onSnapshot(qrQuery, (snap) => {
        setAppState(p => ({ 
          ...p, 
          qrBatches: snap.docs.map(d => ({ id: d.id, ...d.data() } as QRCodeBatch)) 
        }));
      }));
    }

    return () => unsubs.forEach(f => f());
  }, [currentUser]);

  // Solo quitamos el loading si hemos recibido al menos 2 pulsos de datos (Ajustes + Semanas)
  // o si pasa demasiado tiempo (timeout de 5s para no bloquear al usuario)
  useEffect(() => {
      if (syncCount >= 2) {
          setLoading(false);
      }
      const timeout = setTimeout(() => setLoading(false), 5000);
      return () => clearTimeout(timeout);
  }, [syncCount]);

  // Sync currentUser data with appState (for permission updates)
  useEffect(() => {
      if (currentUser?.role === UserRole.SUPERVISOR && currentUser.data) {
          const updatedSup = appState.supervisors.find(s => s.id === (currentUser.data as Supervisor).id);
          if (updatedSup && JSON.stringify(updatedSup) !== JSON.stringify(currentUser.data)) {
              setCurrentUser(prev => prev ? { ...prev, data: updatedSup, name: updatedSup.name } : null);
          }
      }
  }, [appState.supervisors, currentUser?.role]); // Removed currentUser.data from deps to avoid potential loops, rely on appState update trigger

  const forceRefresh = () => {
      if(confirm("¿Forzar actualización de datos?")) {
          window.location.reload();
      }
  };

  const handleLogin = async (pin: string) => {
    if (pin === ADMIN_PIN) { setCurrentUser({ role: UserRole.ADMIN, name: SUPER_ADMIN_NAME }); return; }
    
    // First, check local loaded state
    let sys = appState.systemUsers.find(u => u.pin === pin);
    let sup = appState.supervisors.find(s => s.pin === pin);
    
    // In case local cache is delayed, check database directly in real-time
    if (!sys && !sup) {
      try {
        const sysQuery = query(collection(db, 'system_users'), where('pin', '==', pin), limit(1));
        const sysSnap = await getDocs(sysQuery);
        if (!sysSnap.empty) {
          const docData = sysSnap.docs[0];
          sys = { id: docData.id, ...docData.data() } as SystemUser;
        } else {
          const supQuery = query(collection(db, 'supervisors'), where('pin', '==', pin), limit(1));
          const supSnap = await getDocs(supQuery);
          if (!supSnap.empty) {
            const docData = supSnap.docs[0];
            sup = { id: docData.id, ...docData.data() } as Supervisor;
          }
        }
      } catch (err) {
        console.error("Direct PIN database check failed:", err);
      }
    }
    
    if (sys) { 
      setCurrentUser({ role: sys.role || UserRole.VIEWER, data: sys, name: sys.name }); 
      return; 
    }
    if (sup) {
      setCurrentUser({ role: UserRole.SUPERVISOR, data: sup, name: sup.name });
      const meta = await getDeviceMetadata();
      await updateDoc(doc(db, 'supervisors', sup.id), { lastLoginMetadata: meta, loginHistory: arrayUnion(meta) });
      return;
    } 
    alert("PIN Inválido");
  };

  // Funciones de Negocio (Iguales)
  const registerClient = async (qrId: string, data: Partial<Client>, isRenewal?: boolean, skipVisit?: boolean, originalClientId?: string) => {
    if (currentUser?.role !== UserRole.SUPERVISOR) return;
    const supervisor = currentUser.data as Supervisor;
    const currentWeek = appState.weeks.find(w => w.isActive && w.financieraId === (supervisor.financieraId || ''));
    if (!currentWeek) {
      alert("No hay una semana activa para esta financiera.");
      return;
    }
    const meta = await getDeviceMetadata();
    await setDoc(doc(db, 'clients', qrId), { 
      ...data, 
      id: qrId, 
      supervisorId: supervisor.id, 
      registeredBySupervisorId: supervisor.id, // NEW: Track who registered them
      financieraId: supervisor.financieraId || '', // Inherit from supervisor
      registeredAt: Date.now(),
      weekId: currentWeek.id, // NEW: Explicitly link to current active week
      isRenewal: !!isRenewal
    });

    if (isRenewal && originalClientId && originalClientId !== qrId) {
      try {
        // Query previous visits
        const visitsQuery = query(collection(db, 'visits'), where('clientId', '==', originalClientId));
        const visitsSnap = await getDocs(visitsQuery);
        const batch = writeBatch(db);
        visitsSnap.forEach((visitDoc) => {
          batch.update(visitDoc.ref, { clientId: qrId });
        });
        await batch.commit();

        // Delete old client document
        await deleteDoc(doc(db, 'clients', originalClientId));
      } catch (err) {
        console.error("Error migrating visits or deleting old client:", err);
      }
    }

    if (!skipVisit) {
      await addDoc(collection(db, 'visits'), { 
        clientId: qrId, 
        supervisorId: (currentUser.data as Supervisor).id, 
        weekId: currentWeek.id, 
        timestamp: Date.now(), 
        latitude: data.latitude, 
        longitude: data.longitude, 
        deviceMetadata: meta,
        isRenewal: !!isRenewal 
      });
    }
  };
  const recordVisit = async (qrId: string, lat: number, lng: number) => {
    if (currentUser?.role !== UserRole.SUPERVISOR) throw new Error("Cerrado");
    const supervisor = currentUser.data as Supervisor;
    const currentWeek = appState.weeks.find(w => w.isActive && w.financieraId === (supervisor.financieraId || ''));
    if (!currentWeek) throw new Error("Cerrado");
    const meta = await getDeviceMetadata();
    await addDoc(collection(db, 'visits'), { clientId: qrId, supervisorId: (currentUser.data as Supervisor).id, weekId: currentWeek.id, timestamp: Date.now(), latitude: lat, longitude: lng, deviceMetadata: meta });
  };
  const updateAvalVisit = async (clientId: string, url: string, lat: number, lng: number, index: number = 0, guarantees?: Guarantee[], photoUrl?: string, isComplete?: boolean) => {
      const clientRef = doc(db, 'clients', clientId);
      const clientDoc = appState.clients.find(c => c.id === clientId);
      
      if (clientDoc) {
          const updatedAvales = [...(clientDoc.avales || [])];
          if (updatedAvales[index]) {
              updatedAvales[index] = {
                  ...updatedAvales[index],
                  facadeUrl: url || updatedAvales[index].facadeUrl,
                  photoUrl: photoUrl || updatedAvales[index].photoUrl,
                  latitude: lat,
                  longitude: lng,
                  visitTimestamp: isComplete ? Date.now() : updatedAvales[index].visitTimestamp,
                  guarantees: guarantees || updatedAvales[index].guarantees
              };
          } else if (index === 0) {
              // Syncing legacy data to array
              updatedAvales[0] = {
                  name: clientDoc.avalName || '',
                  address: clientDoc.avalAddress || '',
                  cellphone: clientDoc.avalCellphone || '',
                  facadeUrl: url,
                  photoUrl: photoUrl,
                  latitude: lat,
                  longitude: lng,
                  visitTimestamp: isComplete ? Date.now() : undefined,
                  guarantees: guarantees
              };
          }
          
          await updateDoc(clientRef, { 
              avales: updatedAvales,
              ...(index === 0 ? {
                  avalFacadeUrl: url, 
                  avalPhotoUrl: photoUrl,
                  avalLatitude: lat, 
                  avalLongitude: lng, 
                  ...(isComplete ? { avalVisitTimestamp: Date.now() } : {})
              } : {})
          });
      } else {
          // Fallback simple update if donor doc not found in state
          await updateDoc(clientRef, { 
              avalFacadeUrl: url, 
              avalLatitude: lat, 
              avalLongitude: lng, 
              ...(isComplete ? { avalVisitTimestamp: Date.now() } : {})
          });
      }
  };
  const createNextWeek = async (financieraId: string) => {
      // 1. Deactivate all currently active weeks for THIS financiera
      const activeWeeks = appState.weeks.filter(w => w.isActive && w.financieraId === financieraId);
      for (const d of activeWeeks) await updateDoc(doc(db, 'weeks', d.id), { isActive: false });

      // 2. Find the most recent week for THIS financiera to determine the next start date
      const lastWeek = appState.weeks
          .filter(w => w.financieraId === financieraId)
          .sort((a, b) => b.startDate - a.startDate)[0] || null;

      let nextStartDate: Date;

      if (lastWeek) {
          // If a previous week exists, the next one starts the day after the previous one ended.
          // Since previous ended on Friday, next starts on Saturday.
          // We can just add 7 days to the previous start date to get the next Saturday.
          nextStartDate = new Date(lastWeek.startDate);
          nextStartDate.setDate(nextStartDate.getDate() + 7);
      } else {
          // If no previous week exists, find the most recent Saturday (or today if today is Saturday)
          const now = new Date();
          const day = now.getDay(); // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
          
          // Logic to find the *current* cycle's Saturday.
          // If today is Saturday (6), we are at the start of the cycle.
          // If today is Friday (5), we are at the end of the cycle (started last Saturday).
          // If today is Sunday (0), we are in the cycle that started yesterday (Saturday).
          
          // We want to go back to the most recent Saturday.
          // diff = (day + 1) % 7 is:
          // Sat(6) -> (7)%7 = 0. Correct.
          // Fri(5) -> (6)%7 = 6. Correct (go back 6 days).
          // Sun(0) -> (1)%7 = 1. Correct (go back 1 day).
          
          const diff = (day + 1) % 7;
          nextStartDate = new Date(now);
          nextStartDate.setDate(now.getDate() - diff);
          nextStartDate.setHours(0, 0, 0, 0);
      }

      // Calculate End Date (Friday)
      // Start (Sat) + 6 days = End (Fri)
      const nextEndDate = new Date(nextStartDate);
      nextEndDate.setDate(nextStartDate.getDate() + 6);
      nextEndDate.setHours(23, 59, 59, 999);

      const id = `W-${nextStartDate.getTime()}-${financieraId}`;
      const name = `SEMANA DEL ${nextStartDate.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }).toUpperCase()} AL ${nextEndDate.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }).toUpperCase()}`;

      await setDoc(doc(db, 'weeks', id), { 
          id, 
          name, 
          startDate: nextStartDate.getTime(), 
          endDate: nextEndDate.getTime(),
          isActive: true, 
          createdAt: Date.now(),
          financieraId
      });
  };
  const addManualWeek = async (name: string, startDateTs: number, financieraId: string) => {
      const activeWeeks = appState.weeks.filter(w => w.isActive && w.financieraId === financieraId);
      for (const d of activeWeeks) await updateDoc(doc(db, 'weeks', d.id), { isActive: false });
      const endDateTs = startDateTs + (7 * 24 * 60 * 60 * 1000) - 1000;
      const id = `W-${startDateTs}-${Date.now()}-${financieraId}`;
      await setDoc(doc(db, 'weeks', id), { id, name: name.toUpperCase(), startDate: startDateTs, endDate: endDateTs, isActive: true, createdAt: Date.now(), financieraId });
  };
  const deleteWeek = async (weekId: string) => { await deleteDoc(doc(db, 'weeks', weekId)); };
  const closeCurrentWeek = async (financieraId: string) => { 
      const activeWeeks = appState.weeks.filter(w => w.isActive && w.financieraId === financieraId);
      for (const d of activeWeeks) await updateDoc(doc(db, 'weeks', d.id), { isActive: false });
  };
  const reopenWeek = async (weekId: string, financieraId: string) => {
      const activeWeeks = appState.weeks.filter(w => w.isActive && w.financieraId === financieraId);
      for (const d of activeWeeks) await updateDoc(doc(db, 'weeks', d.id), { isActive: false });
      await updateDoc(doc(db, 'weeks', weekId), { isActive: true });
  };
  const addSupervisor = async (name: string, pin: string, canEditClients: boolean, canArchiveClients: boolean, canEditPhotos: boolean, financieraId: string) => { 
    const docRef = await addDoc(collection(db, 'supervisors'), { name, pin, canEditClients, canArchiveClients, canEditPhotos, financieraId, createdAt: Date.now(), loginHistory: [] }); 
    if (currentUser?.role === UserRole.VIEWER) {
      const sysUser = currentUser.data as SystemUser;
      await updateDoc(doc(db, 'system_users', sysUser.id), {
        assignedSupervisorIds: [...sysUser.assignedSupervisorIds, docRef.id]
      });
    }
  };
  const updateSupervisor = async (id: string, name: string, pin: string, canEditClients: boolean, canArchiveClients: boolean, canEditPhotos: boolean, financieraId: string) => { await updateDoc(doc(db, 'supervisors', id), { name, pin, canEditClients, canArchiveClients, canEditPhotos, financieraId }); };
  const batchUpdateSupervisors = async (ids: string[], data: Partial<Supervisor>) => {
    for (const id of ids) {
      await updateDoc(doc(db, 'supervisors', id), data);
    }
  };
  const deleteSupervisor = async (id: string) => { 
    await deleteDoc(doc(db, 'supervisors', id)); 
    // Remove from all system users
    for (const user of appState.systemUsers) {
      if (user.assignedSupervisorIds.includes(id)) {
        await updateDoc(doc(db, 'system_users', user.id), {
          assignedSupervisorIds: user.assignedSupervisorIds.filter(sid => sid !== id)
        });
      }
    }
  };
  const updateSettings = async (prefix: string, seq: string, appName: string, rules: any, vName: string, vColor: string, logoUrl: string, designVersion?: 'v1' | 'v2', logoGifUrl?: string, footerLogoUrl?: string, footerInfoHtml?: string) => { 
    await setDoc(doc(db, 'settings', 'global'), { 
      qrPrefix: prefix, 
      nextSequence: seq, 
      appName, 
      logoUrl, 
      registrationRules: rules, 
      versionName: vName, 
      versionColor: vColor,
      adminDesignVersion: designVersion || 'v1',
      logoGifUrl: logoGifUrl || '',
      footerLogoUrl: footerLogoUrl || '',
      footerInfoHtml: footerInfoHtml || ''
    }); 
  };
  const generateQRCodes = async (count: number, prefix: string, financieraId: string) => {
    const codes = []; 
    let currentSeqStr = appState.settings.nextSequence;
    let currentSeqNum = parseInt(currentSeqStr, 10);
    const totalLength = currentSeqStr.length;

    for (let i = 0; i < count; i++) {
        const nextNum = currentSeqNum + i;
        const nextStr = nextNum.toString().padStart(totalLength, '0');
        codes.push(`${prefix}${nextStr}`);
    }
    
    // Calculate next starting sequence
    const newNextNum = currentSeqNum + count;
    const newNextStr = newNextNum.toString().padStart(totalLength, '0');

    await addDoc(collection(db, 'qr_batches'), { id: `B-${Date.now()}`, codes, createdAt: Date.now(), financieraId });
    await updateDoc(doc(db, 'settings', 'global'), { nextSequence: newNextStr });
  };
  const addSystemUser = async (name: string, pin: string, ids: string[], canCreateSupervisors: boolean, canManageWeeks: boolean, assignedFinancieraIds: string[], role: UserRole) => { 
    await addDoc(collection(db, 'system_users'), { 
      name, 
      pin, 
      assignedSupervisorIds: ids, 
      createdAt: Date.now(), 
      canCreateSupervisors, 
      canManageWeeks,
      assignedFinancieraIds,
      role 
    }); 
  };
  const updateSystemUser = async (id: string, name: string, pin: string, ids: string[], canCreateSupervisors: boolean, canManageWeeks: boolean, assignedFinancieraIds: string[], role: UserRole) => { 
    await updateDoc(doc(db, 'system_users', id), { 
      name, 
      pin, 
      assignedSupervisorIds: ids, 
      canCreateSupervisors, 
      canManageWeeks,
      assignedFinancieraIds,
      role 
    }); 
  };
  const deleteSystemUser = async (id: string) => { await deleteDoc(doc(db, 'system_users', id)); };

  const deleteClient = async (clientId: string) => {
    if (currentUser?.role === UserRole.ADMIN) {
      await deleteDoc(doc(db, 'clients', clientId));
      const visitsSnap = await getDocs(query(collection(db, 'visits'), where('clientId', '==', clientId)));
      for (const d of visitsSnap.docs) await deleteDoc(d.ref);
    }
  };
  
  const fetchClientById = async (clientId: string): Promise<Client | null> => {
    try {
      const snap = await getDoc(doc(db, 'clients', clientId));
      if (snap.exists()) {
        const clientData = { id: snap.id, ...snap.data() } as Client;
        // If not in local state, add it temporarily to avoid re-fetching
        setAppState(prev => {
          if (prev.clients.find(c => c.id === clientId)) return prev;
          return { ...prev, clients: [clientData, ...prev.clients] };
        });
        return clientData;
      }
    } catch (error) {
      console.error("Error fetching client:", error);
    }
    return null;
  };

  const searchClientsByName = async (nameQuery: string): Promise<Client[]> => {
    try {
      const q = query(
        collection(db, 'clients'),
        where('name', '>=', nameQuery.toUpperCase()),
        where('name', '<=', nameQuery.toUpperCase() + '\uf8ff'),
        limit(20)
      );
      const snap = await getDocs(q);
      const results = snap.docs.map(d => ({ id: d.id, ...d.data() } as Client));
      
      if (results.length > 0) {
        setAppState(prev => {
          const newClients = [...prev.clients];
          results.forEach(res => {
            if (!newClients.find(c => c.id === res.id)) {
              newClients.unshift(res);
            }
          });
          return { ...prev, clients: newClients };
        });
      }
      return results;
    } catch (error) {
      console.error("Error searching clients by name:", error);
      return [];
    }
  };

  const addFinanciera = async (name: string, minGuarantees?: number, requireClientPhoto?: boolean, requireFacade?: boolean, logoUrl?: string, guarantorRules?: GuarantorRange[], logoGifUrl?: string, requireGuaranteesForAval?: boolean, minGuaranteesForAval?: number, requireGuarantorPhoto?: boolean, requireGuarantorFacade?: boolean, maxClientActiveLoans?: number, maxAvalRegistrations?: number, maxClientAsAval?: number) => { 
    await addDoc(collection(db, 'financieras'), { 
      name: name.toUpperCase(), 
      createdAt: Date.now(), 
      minGuarantees, 
      requireClientPhoto, 
      requireFacade, 
      logoUrl, 
      guarantorRules, 
      logoGifUrl: logoGifUrl || '', 
      requireGuaranteesForAval: !!requireGuaranteesForAval, 
      minGuaranteesForAval: minGuaranteesForAval || 0, 
      requireGuarantorPhoto: !!requireGuarantorPhoto,
      requireGuarantorFacade: requireGuarantorFacade !== false, // Defaults to true
      maxClientActiveLoans: maxClientActiveLoans ?? 1, // Defaults to 1
      maxAvalRegistrations: maxAvalRegistrations ?? 2, // Defaults to 2
      maxClientAsAval: maxClientAsAval ?? 2 // Defaults to 2
    }); 
  };
  
  const updateFinanciera = async (id: string, name: string, minGuarantees?: number, requireClientPhoto?: boolean, requireFacade?: boolean, logoUrl?: string, guarantorRules?: GuarantorRange[], logoGifUrl?: string, requireGuaranteesForAval?: boolean, minGuaranteesForAval?: number, requireGuarantorPhoto?: boolean, requireGuarantorFacade?: boolean, maxClientActiveLoans?: number, maxAvalRegistrations?: number, maxClientAsAval?: number) => { 
    await updateDoc(doc(db, 'financieras', id), { 
      name: name.toUpperCase(), 
      minGuarantees, 
      requireClientPhoto, 
      requireFacade, 
      logoUrl, 
      guarantorRules, 
      logoGifUrl: logoGifUrl || '', 
      requireGuaranteesForAval: !!requireGuaranteesForAval, 
      minGuaranteesForAval: minGuaranteesForAval || 0, 
      requireGuarantorPhoto: !!requireGuarantorPhoto,
      requireGuarantorFacade: requireGuarantorFacade !== false,
      maxClientActiveLoans: maxClientActiveLoans ?? 1,
      maxAvalRegistrations: maxAvalRegistrations ?? 2,
      maxClientAsAval: maxClientAsAval ?? 2
    }); 
  };
  const deleteFinanciera = async (id: string) => { await deleteDoc(doc(db, 'financieras', id)); };
  
  const addApiKey = async (name: string, permissions: ApiPermission[], assignedFinancieraIds: string[]) => {
      const key = 'sv_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      await addDoc(collection(db, 'api_keys'), {
          name,
          key,
          permissions,
          assignedFinancieraIds,
          active: true,
          createdAt: Date.now()
      });
  };
  const updateApiKey = async (id: string, active: boolean, permissions: ApiPermission[], assignedFinancieraIds: string[]) => {
      await updateDoc(doc(db, 'api_keys', id), { active, permissions, assignedFinancieraIds });
  };
  const deleteApiKey = async (id: string) => { await deleteDoc(doc(db, 'api_keys', id)); };

  const deleteQRBatch = async (batchId: string) => { 
      // The batchId passed here is the 'B-...' string stored in the 'id' field of the document,
      // NOT the Firestore Document ID (because of how we load data in setupListeners).
      // We need to find the document that has this 'id' field.
      const q = query(collection(db, 'qr_batches'), where('id', '==', batchId));
      const snapshot = await getDocs(q);
      snapshot.forEach(async (doc) => {
          await deleteDoc(doc.ref);
      });
  };

  const migrateWeeksToLaFortuna = async () => {
    if (currentUser?.role !== UserRole.ADMIN) return;
    
    // 1. Find "La Fortuna" financiera
    let fortuna = appState.financieras.find(f => f.name.toUpperCase() === "LA FORTUNA");
    let fortunaId = fortuna?.id;

    if (!fortuna) {
      // Create it if it doesn't exist
      const docRef = await addDoc(collection(db, 'financieras'), { 
        name: "LA FORTUNA", 
        createdAt: Date.now(), 
        minGuarantees: 0, 
        requireClientPhoto: false, 
        requireFacade: false 
      });
      fortunaId = docRef.id;
      alert("Se creó la financiera 'LA FORTUNA' ya que no existía.");
    }

    if (!fortunaId) return;

    try {
      const batch = writeBatch(db);
      let count = 0;
      appState.weeks.forEach(week => {
        if (!week.financieraId) {
          batch.update(doc(db, 'weeks', week.id), { financieraId: fortunaId });
          count++;
        }
      });

      if (count > 0) {
        await batch.commit();
        alert(`Se migraron ${count} semanas a 'LA FORTUNA'.`);
      } else {
        alert("No hay semanas sin financiera asignada.");
      }
    } catch (error) {
      console.error("Error migrating weeks:", error);
      alert("Hubo un error al migrar las semanas.");
    }
  };

  const updateClient = async (clientId: string, data: Partial<Client>) => {
    if (currentUser?.role === UserRole.SUPERVISOR) {
        // Check if supervisor has permission
        const sup = currentUser.data as Supervisor;
        // If canEditClients is undefined, default to false (or true? User request implies default might be false or selective)
        // "solo a ella le doy el permiso" implies default is false.
        if (!sup.canEditClients) return;
    } else if (currentUser?.role !== UserRole.ADMIN && currentUser?.role !== UserRole.VIEWER) {
        return;
    }
    await updateDoc(doc(db, 'clients', clientId), data);
  };

  const moveClientsToWeek = async (clientIds: string[], targetWeekId: string) => {
    if (currentUser?.role !== UserRole.ADMIN && currentUser?.role !== UserRole.VIEWER) return;
    
    const targetWeek = appState.weeks.find(w => w.id === targetWeekId);
    if (!targetWeek) return;

    try {
      const batch = writeBatch(db);
      
      clientIds.forEach(id => {
        batch.update(doc(db, 'clients', id), { 
            weekId: targetWeekId,
            registeredAt: targetWeek.startDate + 1000 // Add 1 second to ensure it falls within the week
        });
      });
      
      const visitsToMove = appState.visits.filter(v => clientIds.includes(v.clientId));
      visitsToMove.forEach(v => {
        batch.update(doc(db, 'visits', v.id), { weekId: targetWeekId });
      });

      await batch.commit();
    } catch (error) {
      console.error("Error moving clients to week:", error);
      alert("Hubo un error al mover los clientes.");
    }
  };

  const moveClientsToFinanciera = async (clientIds: string[], targetFinancieraId: string) => {
    if (currentUser?.role !== UserRole.ADMIN) return;
    
    try {
      const batch = writeBatch(db);
      clientIds.forEach(id => {
        batch.update(doc(db, 'clients', id), { financieraId: targetFinancieraId });
      });
      await batch.commit();
    } catch (error) {
      console.error("Error moving clients to financiera:", error);
      alert("Hubo un error al mover los clientes de financiera.");
    }
  };

  const validQRs = new Set(appState.qrBatches.flatMap(b => b.codes || []).map(code => code.trim().toUpperCase()));
  const dashboardData = currentUser?.role === UserRole.VIEWER ? (() => {
    const user = currentUser.data as SystemUser;
    const assignedSupIds = user.assignedSupervisorIds || [];
    const assignedFinIds = user.assignedFinancieraIds || [];
    const hasAssignedSups = assignedSupIds.length > 0;
    const hasAssignedFins = assignedFinIds.length > 0;

    return {
      ...appState,
      financieras: appState.financieras.filter(f => {
        if (hasAssignedSups) {
          return appState.supervisors.some(s => s.financieraId === f.id && assignedSupIds.includes(s.id));
        }
        return assignedFinIds.includes(f.id);
      }),
      supervisors: appState.supervisors.filter(s => {
        if (hasAssignedSups) {
          return assignedSupIds.includes(s.id);
        }
        return assignedFinIds.includes(s.financieraId || '');
      }),
      clients: appState.clients.filter(c => {
        if (hasAssignedSups) {
          return assignedSupIds.includes(c.supervisorId);
        }
        return assignedFinIds.includes(c.financieraId || '');
      }),
      visits: appState.visits.filter(v => {
        if (hasAssignedSups) {
          return assignedSupIds.includes(v.supervisorId);
        }
        const sup = appState.supervisors.find(s => s.id === v.supervisorId);
        return assignedFinIds.includes(sup?.financieraId || '');
      }),
      qrBatches: appState.qrBatches.filter(b => {
        return assignedFinIds.includes(b.financieraId || '');
      }),
      weeks: appState.weeks.filter(w => {
        return assignedFinIds.includes(w.financieraId || '');
      })
    };
  })() : appState;

  const assignedFinancieraNames = currentUser?.role === UserRole.VIEWER 
    ? appState.financieras
        .filter(f => ((currentUser.data as SystemUser).assignedFinancieraIds || []).includes(f.id))
        .map(f => f.name)
        .join(", ")
    : "";

  const userActiveWeek = currentUser?.role === UserRole.SUPERVISOR 
    ? appState.weeks.find(w => w.isActive && w.financieraId === ((currentUser.data as Supervisor).financieraId || ''))
    : appState.weeks.find(w => w.isActive);

  if (loading) return (
    <div className="h-screen flex flex-col items-center justify-center bg-white p-6 text-center">
        <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mb-4" />
        <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Sincronizando Clientes</h2>
        <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest mt-2 max-w-xs">
            Estamos conectando a la base de datos central. Espera un momento...
        </p>
        <button onClick={() => window.location.reload()} className="mt-8 flex items-center gap-2 text-indigo-600 font-black uppercase text-[10px] border border-indigo-100 px-4 py-2 rounded-full">
            <RotateCcw className="w-3 h-3" /> Reintentar Conexión
        </button>
    </div>
  );

  return (
    <>
      <div className="text-white flex items-center justify-center gap-4 text-[9px] py-1 font-black z-[100] fixed top-0 w-full uppercase tracking-widest shadow-md" style={{ backgroundColor: appState.settings.versionColor }}>
         <span>{appState.settings.versionName || 'SISTEMA'} • {userActiveWeek?.name || 'SISTEMA CERRADO'}</span>
         <button onClick={forceRefresh} className="p-1 hover:bg-white/20 rounded transition-colors" title="Refrescar Datos">
            <RefreshCw className="w-2.5 h-2.5" />
         </button>
      </div>
      <div className="pt-6 h-full">
        {!currentUser ? (
          <div className="h-full bg-slate-100 flex flex-col items-center justify-center p-4 relative overflow-hidden">
            <div className="absolute top-8 flex items-center justify-center text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-200/50 px-3 py-1 rounded-full border border-slate-200/20 backdrop-blur-sm">
              Compilación: v{VERSION}
            </div>
            <PinPad 
              onSuccess={handleLogin} 
              title={appState.settings.appName} 
              logoUrl={appState.settings.logoUrl} 
              logoGifUrl={appState.settings.logoGifUrl} 
            />
            
            {/* Footer Logo */}
            {appState.settings.footerLogoUrl && (
              <div className="absolute bottom-2 flex flex-col items-center gap-2">
                <button 
                  onClick={() => setShowFooterModal(true)}
                  className="transition-transform active:scale-95 grayscale hover:grayscale-0 opacity-40 hover:opacity-100 duration-300"
                >
                  <img src={appState.settings.footerLogoUrl} alt="Footer Logo" className="h-4 md:h-5 object-contain" />
                </button>
              </div>
            )}

            {/* Footer Modal */}
            {showFooterModal && (
              <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-6 animate-in fade-in duration-300">
                <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300 border border-slate-100 italic">
                  <div className="p-5 border-b border-slate-100 flex justify-end items-center bg-slate-50/50">
                    <button onClick={() => setShowFooterModal(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                      <X className="w-5 h-5 text-slate-500" />
                    </button>
                  </div>
                  <div className="p-10 max-h-[70vh] overflow-y-auto custom-scrollbar">
                    <div 
                      className="text-slate-600 font-medium leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: appState.settings.footerInfoHtml || '' }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <Layout 
            userRole={currentUser.role === UserRole.VIEWER ? 'VISOR' : currentUser.role} 
            userName={currentUser.name} 
            appName={appState.settings.appName} 
            onLogout={() => setCurrentUser(null)}
            onRefresh={forceRefresh}
            assignedFinancieraNames={assignedFinancieraNames}
            appLogo={appState.settings.logoUrl}
          >
            {(currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.VIEWER) ? (
              <AdminPanel 
                data={dashboardData} 
                isSuperAdmin={currentUser.role === UserRole.ADMIN} 
                isViewer={currentUser.role === UserRole.VIEWER}
                viewerCanCreateSups={currentUser.role === UserRole.VIEWER ? (currentUser.data as SystemUser).canCreateSupervisors : false}
                viewerCanManageWeeks={currentUser.role === UserRole.VIEWER ? (currentUser.data as SystemUser).canManageWeeks : false}
                onAddSupervisor={addSupervisor} 
                onUpdateSupervisor={updateSupervisor} 
                onGenerateQR={generateQRCodes} 
                onDeleteSupervisor={deleteSupervisor} 
                onUpdateSettings={updateSettings} 
                onAddSystemUser={addSystemUser} 
                onUpdateSystemUser={updateSystemUser} 
                onDeleteSystemUser={deleteSystemUser} 
                onAddFinanciera={addFinanciera}
                onUpdateFinanciera={updateFinanciera}
                onDeleteFinanciera={deleteFinanciera}
                onDeleteQRBatch={deleteQRBatch}
                onBatchUpdateSupervisors={batchUpdateSupervisors}
                onUpdateClient={updateClient} 
                onDeleteClient={deleteClient}
                onFetchClient={fetchClientById}
                onSearchClientsByName={searchClientsByName}
                fullSupervisorsList={appState.supervisors} 
                onCreateWeek={createNextWeek} 
                onCloseWeek={closeCurrentWeek} 
                onReopenWeek={reopenWeek}
                onAddManualWeek={addManualWeek}
                onDeleteWeek={deleteWeek}
                onMoveClientsToWeek={moveClientsToWeek}
                onMoveClientsToFinanciera={moveClientsToFinanciera}
                onMigrateWeeksToLaFortuna={migrateWeeksToLaFortuna}
                onAddApiKey={addApiKey}
                onUpdateApiKey={updateApiKey}
                onDeleteApiKey={deleteApiKey}
              />
            ) : <SupervisorPanel 
                  supervisor={currentUser.data as Supervisor} 
                  clients={appState.clients} 
                  visits={appState.visits} 
                  onRegisterClient={registerClient} 
                  onRecordVisit={recordVisit} 
                  onUpdateAvalVisit={updateAvalVisit} 
                  onUpdateClient={updateClient}
                  onDeleteClient={deleteClient}
                  onFetchClient={fetchClientById}
                  validQRs={validQRs} 
                  settings={appState.settings} 
                  currentWeek={appState.weeks.find(w => w.isActive && w.financieraId === ((currentUser.data as Supervisor).financieraId || ''))} 
                  allWeeks={appState.weeks.filter(w => w.financieraId === ((currentUser.data as Supervisor).financieraId || ''))} 
                  allSupervisors={appState.supervisors}
                  financieras={appState.financieras}
                />}
          </Layout>
        )}
      </div>
    </>
  );
};
export default App;