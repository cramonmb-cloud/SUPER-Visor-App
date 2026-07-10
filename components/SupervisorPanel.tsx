import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Supervisor, Client, Visit, Guarantee, SystemSettings, WorkWeek, Financiera, GuarantorRange, Guarantor } from '../types';
import { Scan, MapPin, Camera, Check, X, Loader2, RefreshCw, UploadCloud, Map as MapIcon, User, Clock, CheckCircle, Home, Plus, Archive, Trash2, Lock, Smartphone, DollarSign, UserCheck, Users, QrCode, ChevronDown, ChevronUp, Calendar, Hash, Phone, History, Navigation, Package, Pencil, AlertTriangle, MessageSquare, Save, Search, ShieldCheck, ShieldAlert, Monitor, Image as LucideImage, Eye } from 'lucide-react';
import { storage, db } from '../services/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { query, collection, where, getDocs, limit } from 'firebase/firestore';
import jsQR from "jsqr";
import { CachedImage } from './CachedImage';
import { checkClientCompleteness } from './AdminPanel';

interface SupervisorPanelProps {
    supervisor: Supervisor;
    clients: Client[];
    visits: Visit[];
    onRegisterClient: (qrId: string, data: Partial<Client>, isRenewal?: boolean, skipVisit?: boolean, originalClientId?: string) => Promise<void>;
    onRecordVisit: (qrId: string, lat: number, lng: number) => Promise<void>;
    onUpdateAvalVisit: (clientId: string, facadeUrl: string, lat: number, lng: number, index?: number, guarantees?: Guarantee[], photoUrl?: string, isComplete?: boolean) => Promise<void>;
    onUpdateClient: (clientId: string, data: Partial<Client>) => Promise<void>;
    onDeleteClient: (clientId: string) => Promise<void>;
    onFetchClient: (clientId: string) => Promise<Client | null>;
    validQRs: Set<string>;
    settings: SystemSettings;
    currentWeek?: WorkWeek;
    allWeeks: WorkWeek[];
    allSupervisors: Supervisor[];
    financieras: Financiera[];
}

const compressImage = (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                const elem = document.createElement('canvas');
                const maxWidth = 1024;
                let width = img.width;
                let height = img.height;
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }
                elem.width = width;
                elem.height = height;
                const ctx = elem.getContext('2d');
                ctx?.drawImage(img, 0, 0, width, height);
                ctx?.canvas.toBlob((blob) => {
                    if (!blob) { reject(new Error('Canvas is empty')); return; }
                    const newFile = new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() });
                    resolve(newFile);
                }, 'image/jpeg', 0.7);
            };
            img.onerror = (error) => reject(error);
        };
        reader.onerror = (error) => reject(error);
    });
};

export const SupervisorPanel: React.FC<SupervisorPanelProps> = ({
    supervisor, clients, visits, onRegisterClient, onRecordVisit, onUpdateAvalVisit, onUpdateClient, onDeleteClient, onFetchClient, validQRs, settings, currentWeek, allWeeks = [], allSupervisors = [], financieras = []
}) => {
    const [view, setView] = useState<'list' | 'scan' | 'aval_visit'>('list');
    const [targetAvalClient, setTargetAvalClient] = useState<Client | null>(null);
    const [selectedClientHistory, setSelectedClientHistory] = useState<Client | null>(null);
    const [editingClient, setEditingClient] = useState<Client | null>(null); // State for editing
    const [deletingClient, setDeletingClient] = useState<Client | null>(null); // State for deleting confirmation
    const [scannedCode, setScannedCode] = useState<string>('');
    const [scanStatus, setScanStatus] = useState<'idle' | 'scanning' | 'processing' | 'found_new' | 'recording_visit' | 'visit_success' | 'invalid' | 'error'>('idle');
    const [cameraError, setCameraError] = useState<string>('');
    const [isUploading, setIsUploading] = useState(false);
    const [expandedHistWeek, setExpandedHistWeek] = useState<string | null>(null);
    const [showCommentsModal, setShowCommentsModal] = useState<Client | null>(null); // NEW: Modal for comments
    const [isRenewalMode, setIsRenewalMode] = useState(false); // NEW: Renewal mode
    const [renewalSourceClientId, setRenewalSourceClientId] = useState<string | null>(null); // NEW: Original Client ID for renewal
    const [clientSearchQuery, setClientSearchQuery] = useState(''); // NEW: Search query for renewal
    const [coincidenceClient, setCoincidenceClient] = useState<Client | null>(null); // NEW: Coincidence check state
    const [coincidenceAval, setCoincidenceAval] = useState<{ client: Client, count: number, isAlreadyClient: boolean, limit: number } | null>(null); // NEW: Coincidence check for aval
    const [ignoredNames, setIgnoredNames] = useState<string[]>([]); // NEW: Track ignored names to avoid re-triggering modal
    const [ignoredAvalNames, setIgnoredAvalNames] = useState<string[]>([]); // NEW: Track ignored aval names
    const [fullPhotoUrl, setFullPhotoUrl] = useState<string | null>(null); // NEW: Full screen photo view
    const [registrationError, setRegistrationError] = useState<{ title: string, message: string } | null>(null); // NEW: Registration error modal
    const [showManualInput, setShowManualInput] = useState(false); // NEW: Manual QR entry
    const [manualCodeInput, setManualCodeInput] = useState(''); // NEW: Manual QR entry value
    const [showCycleModal, setShowCycleModal] = useState(false); // NEW: Welcome modal for new cycle
    const [hasCheckedCycle, setHasCheckedCycle] = useState(false); // NEW: Avoid showing welcome modal multiple times
    const [dataLoaded, setDataLoaded] = useState(false); // NEW: Delay welcome modal check until data is synced

    // NEW: State for existing client as guarantor
    const [aval1IsClient, setAval1IsClient] = useState(false);
    const [aval2IsClient, setAval2IsClient] = useState(false);
    const [aval1Search, setAval1Search] = useState('');
    const [aval2Search, setAval2Search] = useState('');
    const [aval1SelectedClient, setAval1SelectedClient] = useState<Client | null>(null);
    const [aval2SelectedClient, setAval2SelectedClient] = useState<Client | null>(null);

    // Forms state
    const [clientName, setClientName] = useState('');
    const [clientAddress, setClientAddress] = useState('');
    const [creditAmount, setCreditAmount] = useState('');
    const [cellphone, setCellphone] = useState('');
    const [clientComments, setClientComments] = useState(''); // NEW: State for comments

    const [avalName, setAvalName] = useState('');
    const [avalAddress, setAvalAddress] = useState('');
    const [avalCellphone, setAvalCellphone] = useState('');

    const [aval2Name, setAval2Name] = useState('');
    const [aval2Address, setAval2Address] = useState('');
    const [aval2Cellphone, setAval2Cellphone] = useState('');

    const [aval3Name, setAval3Name] = useState('');
    const [aval3Address, setAval3Address] = useState('');
    const [aval3Cellphone, setAval3Cellphone] = useState('');

    const [facadeFile, setFacadeFile] = useState<File | null>(null);
    const [facadePreview, setFacadePreview] = useState<string | null>(null);
    const [avalGuarantees, setAvalGuarantees] = useState<Guarantee[]>([]);
    const [newAvalGuarantee, setNewAvalGuarantee] = useState('');
    const [aval1Guarantees, setAval1Guarantees] = useState<string[]>([]);
    const [newAval1Guarantee, setNewAval1Guarantee] = useState('');
    const [aval2Guarantees, setAval2Guarantees] = useState<string[]>([]);
    const [newAval2Guarantee, setNewAval2Guarantee] = useState('');
    const [aval3Guarantees, setAval3Guarantees] = useState<string[]>([]);
    const [newAval3Guarantee, setNewAval3Guarantee] = useState('');

    const handleAddAval1Guarantee = () => {
        if (newAval1Guarantee.trim()) {
            setAval1Guarantees([...aval1Guarantees, newAval1Guarantee.trim().toUpperCase()]);
            setNewAval1Guarantee('');
        }
    };
    const handleAddAval2Guarantee = () => {
        if (newAval2Guarantee.trim()) {
            setAval2Guarantees([...aval2Guarantees, newAval2Guarantee.trim().toUpperCase()]);
            setNewAval2Guarantee('');
        }
    };
    const handleAddAval3Guarantee = () => {
        if (newAval3Guarantee.trim()) {
            setAval3Guarantees([...aval3Guarantees, newAval3Guarantee.trim().toUpperCase()]);
            setNewAval3Guarantee('');
        }
    };
    const [clientPhotoFile, setClientPhotoFile] = useState<File | null>(null);
    const [clientPhotoPreview, setClientPhotoPreview] = useState<string | null>(null);
    const [avalFacadeFile, setAvalFacadeFile] = useState<File | null>(null);
    const [avalFacadePreview, setAvalFacadePreview] = useState<string | null>(null);
    const [avalPhotoFile, setAvalPhotoFile] = useState<File | null>(null);
    const [avalPhotoPreview, setAvalPhotoPreview] = useState<string | null>(null);
    const [selectedAvalIndex, setSelectedAvalIndex] = useState<number>(0);
    const [guarantees, setGuarantees] = useState<string[]>([]);
    const [newGuarantee, setNewGuarantee] = useState('');
    const [showCompletedFacade, setShowCompletedFacade] = useState(false);
    const [showCompletedAvalPhoto, setShowCompletedAvalPhoto] = useState(false);
    const [showCompletedGuarantees, setShowCompletedGuarantees] = useState(false);
    const [onlyShowPending, setOnlyShowPending] = useState(false);

    // Determine minGuarantees: Prefer financiera-specific setting, fallback to global
    const supervisorFinanciera = financieras.find(f => f.id === supervisor.financieraId);
    const minGuarantees = supervisorFinanciera?.minGuarantees ??
        settings.registrationRules?.minGuarantees ??
        (settings.registrationRules?.requireGuarantee ? 1 : 0);
    const requireClientPhoto = supervisorFinanciera?.requireClientPhoto ?? false;
    const requireFacade = supervisorFinanciera?.requireFacade ?? settings.registrationRules?.requireFacade ?? true;
    const requireGuarantorPhoto = supervisorFinanciera?.requireGuarantorPhoto ?? false;
    const requireGuarantorFacade = supervisorFinanciera?.requireGuarantorFacade ?? true;
    const maxClientActiveLoans = supervisorFinanciera?.maxClientActiveLoans ?? 1;
    const maxAvalRegistrations = supervisorFinanciera?.maxAvalRegistrations ?? 2;
    const maxClientAsAval = supervisorFinanciera?.maxClientAsAval ?? 2;

    // NEW: Calculate required avales based on credit amount
    const amountNum = Number(creditAmount);
    let requiredAvales = 1;
    if (supervisorFinanciera?.guarantorRules && supervisorFinanciera.guarantorRules.length > 0) {
        const match = supervisorFinanciera.guarantorRules.find(r => amountNum >= r.minAmount && amountNum <= r.maxAmount);
        if (match) requiredAvales = match.requiredGuarantors;
        else {
            // If amount exceeds all ranges, take the rule with the highest minAmount
            const sortedRules = [...supervisorFinanciera.guarantorRules].sort((a, b) => b.minAmount - a.minAmount);
            if (amountNum > sortedRules[0].maxAmount) {
                requiredAvales = sortedRules[0].requiredGuarantors;
            }
        }
    }

    const getClientFormProgress = () => {
        let total = 4; // Name, Address, Amount, Cellphone
        let filled = 0;
        if (clientName.trim()) filled++;
        if (clientAddress.trim()) filled++;
        if (Number(creditAmount) > 0) filled++;
        if (cellphone.trim().length >= 10) filled++;

        // Guarantees
        total += 1;
        const minG = supervisorFinanciera?.minGuarantees ?? 0;
        if (guarantees.length >= minG) filled++;

        // Photos
        if (requireFacade) {
            total++;
            if (facadeFile || facadePreview) filled++;
        }
        if (requireClientPhoto) {
            total++;
            if (clientPhotoFile || clientPhotoPreview) filled++;
        }

        return Math.round((filled / total) * 100);
    };

    const getAvalFormProgress = () => {
        let total = 0;
        let filled = 0;

        // Aval 1
        total += 4;
        if (avalName.trim()) filled++;
        if (avalAddress.trim()) filled++;
        if (avalCellphone.trim().length >= 10) filled++;
        const minGAval = supervisorFinanciera?.minGuaranteesForAval ?? 0;
        if (aval1Guarantees.length >= minGAval) filled++;

        // Photos
        if (requireGuarantorFacade) {
            total++;
            if (avalFacadeFile || avalFacadePreview) filled++;
        }
        if (requireGuarantorPhoto) {
            total++;
            if (avalPhotoFile || avalPhotoPreview) filled++;
        }

        // Aval 2
        if (requiredAvales >= 2) {
            total += 4;
            if (aval2Name.trim()) filled++;
            if (aval2Address.trim()) filled++;
            if (aval2Cellphone.trim().length >= 10) filled++;
            if (aval2Guarantees.length >= minGAval) filled++;
        }

        // Aval 3
        if (requiredAvales >= 3) {
            total += 4;
            if (aval3Name.trim()) filled++;
            if (aval3Address.trim()) filled++;
            if (aval3Cellphone.trim().length >= 10) filled++;
            if (aval3Guarantees.length >= minGAval) filled++;
        }

        return Math.round((filled / total) * 100);
    };

    const getClientDetailProgress = (client: any) => {
        let total = 4;
        let filled = 0;
        if (client.name?.trim()) filled++;
        if (client.address?.trim()) filled++;
        if (Number(client.creditAmount) > 0) filled++;
        if (client.cellphone?.trim().length >= 10) filled++;

        const minG = supervisorFinanciera?.minGuarantees ?? 0;
        total += 1;
        if ((client.guarantees?.length || 0) >= minG) filled++;

        if (requireFacade) {
            total++;
            if (client.facadeUrl) filled++;
        }
        if (requireClientPhoto) {
            total++;
            if (client.clientPhotoUrl) filled++;
        }

        return Math.round((filled / total) * 100);
    };

    const getAvalDetailProgress = (client: any) => {
        let total = 0;
        let filled = 0;

        const minGAval = supervisorFinanciera?.minGuaranteesForAval ?? 0;
        const list = client.avales && client.avales.length > 0
            ? client.avales
            : [{
                name: client.avalName,
                address: client.avalAddress,
                cellphone: client.avalCellphone,
                facadeUrl: client.avalFacadeUrl,
                photoUrl: client.avalPhotoUrl,
                guarantees: []
            }];

        // Determine required avales based on client creditAmount
        const amt = Number(client.creditAmount || 0);
        let reqAvals = 1;
        if (supervisorFinanciera?.guarantorRules && supervisorFinanciera.guarantorRules.length > 0) {
            const match = supervisorFinanciera.guarantorRules.find(r => amt >= r.minAmount && amt <= r.maxAmount);
            if (match) reqAvals = match.requiredGuarantors;
            else {
                const sortedRules = [...supervisorFinanciera.guarantorRules].sort((a, b) => b.minAmount - a.minAmount);
                if (amt > sortedRules[0].maxAmount) {
                    reqAvals = sortedRules[0].requiredGuarantors;
                }
            }
        }

        list.slice(0, reqAvals).forEach((av: any, idx: number) => {
            total += 4;
            if (av.name?.trim()) filled++;
            if (av.address?.trim()) filled++;
            if (av.cellphone?.trim().length >= 10) filled++;
            if ((av.guarantees?.length || 0) >= minGAval) filled++;

            if (idx === 0) {
                if (requireGuarantorFacade) {
                    total++;
                    if (av.facadeUrl || client.avalFacadeUrl) filled++;
                }
                if (requireGuarantorPhoto) {
                    total++;
                    if (av.photoUrl || client.avalPhotoUrl) filled++;
                }
            }
        });

        // If list length is less than required, add the missing ones to the total
        if (list.length < reqAvals) {
            total += (reqAvals - list.length) * 4;
        }

        return total > 0 ? Math.round((filled / total) * 100) : 0;
    };

    const getProgressStyles = (pct: number) => {
        if (pct < 20) {
            return {
                pill: "bg-red-50 border-red-100/50 text-red-700",
                barBg: "bg-red-100/60",
                barFill: "bg-red-500"
            };
        } else if (pct < 100) {
            return {
                pill: "bg-blue-50 border-blue-100/50 text-blue-700",
                barBg: "bg-blue-100/60",
                barFill: "bg-blue-600"
            };
        } else {
            return {
                pill: "bg-emerald-50 border-emerald-100/50 text-emerald-700",
                barBg: "bg-emerald-100/60",
                barFill: "bg-emerald-600"
            };
        }
    };

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationFrameRef = useRef<number>(0);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const clientPhotoInputRef = useRef<HTMLInputElement>(null);
    const guarantorPhotoInputRef = useRef<HTMLInputElement>(null);
    const guarantorFacadeInputRef = useRef<HTMLInputElement>(null);

    // Grouping logic for clients
    const supervisorClients = clients.filter(c => c.supervisorId === supervisor.id && !c.isArchived);

    // Clients from the same financiera for renewal search
    const financieraClients = useMemo(() => clients.filter(c =>
        c.financieraId === supervisor.financieraId &&
        !c.isArchived
    ), [clients, supervisor.financieraId]);

    const financieraGuarantorCandidates = useMemo(() => {
        const list: { name: string; address: string; cellphone: string; facadeUrl?: string; photoUrl?: string }[] = [];
        const seen = new Set<string>();

        financieraClients.forEach(c => {
            const normalized = c.name.trim().toUpperCase();
            if (!normalized || seen.has(normalized)) return;
            seen.add(normalized);
            list.push({
                name: c.name,
                address: c.address || '',
                cellphone: c.cellphone || '',
                facadeUrl: c.facadeUrl,
                photoUrl: c.clientPhotoUrl
            });
        });

        financieraClients.forEach(c => {
            if (c.avales && Array.isArray(c.avales)) {
                c.avales.forEach(av => {
                    const normalized = av.name.trim().toUpperCase();
                    if (!normalized || seen.has(normalized)) return;
                    seen.add(normalized);
                    list.push({
                        name: av.name,
                        address: av.address || '',
                        cellphone: av.cellphone || '',
                        facadeUrl: av.facadeUrl,
                        photoUrl: av.photoUrl
                    });
                });
            }
            if (c.avalName) {
                const normalized = c.avalName.trim().toUpperCase();
                if (!normalized || seen.has(normalized)) return;
                seen.add(normalized);
                list.push({
                    name: c.avalName,
                    address: c.avalAddress || '',
                    cellphone: c.avalCellphone || '',
                    facadeUrl: c.avalFacadeUrl,
                    photoUrl: c.avalPhotoUrl
                });
            }
        });

        return list;
    }, [financieraClients]);

    const currentWeekClients = supervisorClients.filter(c => {
        if (!currentWeek) return false;
        // Prioritize explicit weekId if present
        if (c.weekId) return c.weekId === currentWeek.id;
        // Fallback to date range for older clients
        const end = currentWeek.endDate || (currentWeek.startDate + 7 * 24 * 60 * 60 * 1000);
        return c.registeredAt >= currentWeek.startDate && c.registeredAt <= end;
    }).sort((a, b) => b.registeredAt - a.registeredAt);

    const pastWeeksGrouped = allWeeks
        .filter(w => w.id !== currentWeek?.id)
        .map(week => {
            const end = week.endDate || (week.startDate + 7 * 24 * 60 * 60 * 1000);
            const matched = supervisorClients.filter(c => {
                if (c.weekId) return c.weekId === week.id;
                return c.registeredAt >= week.startDate && c.registeredAt <= end;
            });
            return { week, clients: matched };
        })
        .filter(g => g.clients.length > 0)
        .sort((a, b) => b.week.startDate - a.week.startDate);

    const otherClients = supervisorClients.filter(c => {
        // Is not in current week
        const inCurrent = currentWeek && c.registeredAt >= currentWeek.startDate && c.registeredAt <= (currentWeek.endDate || (currentWeek.startDate + 7 * 24 * 60 * 60 * 1000));
        if (inCurrent) return false;
        // Is not in any other week
        const inAnyWeek = allWeeks.some(w => {
            const end = w.endDate || (w.startDate + 7 * 24 * 60 * 60 * 1000);
            return c.registeredAt >= w.startDate && c.registeredAt <= end;
        });
        return !inAnyWeek;
    }).sort((a, b) => b.registeredAt - a.registeredAt);

    const getCurrentLocation = (): Promise<{ lat: number, lng: number }> => {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) { reject(new Error("No GPS")); return; }
            navigator.geolocation.getCurrentPosition(
                (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                (err) => reject(err),
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        });
    };

    const startScanning = useCallback(() => {
        if (!currentWeek) return;
        setScanStatus('scanning');
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
            .then((stream) => {
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.setAttribute("playsinline", "true");
                    videoRef.current.play();
                    requestAnimationFrame(tick);
                }
            }).catch(() => { setCameraError("Error cámara"); setScanStatus('error'); });
    }, [currentWeek]);

    const tick = () => {
        if (!videoRef.current || !canvasRef.current) return;
        if (videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
            const canvas = canvasRef.current;
            const video = videoRef.current;
            canvas.height = video.videoHeight; canvas.width = video.videoWidth;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const code = jsQR(imageData.data, imageData.width, imageData.height);
                if (code?.data) { handleScanSuccess(code.data); return; }
            }
        }
        animationFrameRef.current = requestAnimationFrame(tick);
    };

    const stopScanning = useCallback(() => {
        if (videoRef.current?.srcObject) (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    }, []);

    useEffect(() => {
        if (view === 'scan') startScanning(); else stopScanning();
        return () => stopScanning();
    }, [view, startScanning, stopScanning]);

    useEffect(() => {
        if (view === 'aval_visit' && targetAvalClient) {
            setShowCompletedFacade(false);
            setShowCompletedAvalPhoto(false);
            setShowCompletedGuarantees(false);

            const curAval = targetAvalClient.avales?.[selectedAvalIndex];
            if (curAval) {
                setAvalGuarantees(curAval.guarantees || []);
                setAvalFacadePreview(curAval.facadeUrl || null);
                setAvalPhotoPreview(curAval.photoUrl || null);
                // Also reset current files if we start a new visit session
                setFacadeFile(null);
                setAvalPhotoFile(null);
            } else if (selectedAvalIndex === 1 || selectedAvalIndex === 2) {
                // New structure might not have indices 1 or 2 yet
                setAvalGuarantees([]);
                setAvalFacadePreview(null);
                setAvalPhotoPreview(null);
            } else {
                // Fallback for primary aval if using legacy fields (usually index 0)
                setAvalGuarantees(targetAvalClient.guarantees?.filter(g => g.description).map(g => ({ description: g.description })) || []);
                setAvalFacadePreview(targetAvalClient.avalFacadeUrl || null);
                setAvalPhotoPreview(targetAvalClient.avalPhotoUrl || null);
            }
        }
    }, [view, targetAvalClient, selectedAvalIndex]);

    const handleScanSuccess = async (code: string) => {
        try {
            stopScanning();
            const normalizedCode = code.trim().toUpperCase();
            setScannedCode(normalizedCode);
            setScanStatus('processing');

            // Timeout de seguridad: Si en 10 segundos no ha cambiado de estado, resetear
            const safetyTimeout = setTimeout(() => {
                setScanStatus(prev => prev === 'processing' ? 'error' : prev);
            }, 10000);

            // 1. Primero buscamos si el cliente ya existe en el ciclo/base de datos
            // Quitamos el delay artificial de 800ms para que sea instantáneo
            let existing = clients.find(c => c.id === normalizedCode);
            if (!existing) {
                existing = await onFetchClient(normalizedCode);
            }

            clearTimeout(safetyTimeout);

            if (existing) {
                // El cliente ya existe
                if (existing.supervisorId !== supervisor.id) {
                    // Buscamos el nombre del supervisor para un error más descriptivo
                    const ownerSup = allSupervisors.find(s => s.id === existing?.supervisorId);
                    setScanStatus('invalid');
                    console.warn(`Código ${normalizedCode} pertenece a otro supervisor: ${ownerSup?.name || existing.supervisorId}`);
                    return;
                }
                // Pertenece al supervisor actual, registramos la visita
                handleRecordVisit(existing);
            } else {
                // Es un cliente nuevo. Verificamos si su código está dentro del lote pre-autorizado
                // Optimizamos el chequeo: Si ya está en el Set local (que es lo más común), no consultamos Firebase
                let isAuthorized = validQRs.has(normalizedCode);

                if (!isAuthorized) {
                    // Doble chequeo directo en Firebase SOLO si no está en el set local
                    try {
                        const q = query(collection(db, 'qr_batches'), where('codes', 'array-contains', normalizedCode), limit(1));
                        const snap = await getDocs(q);
                        isAuthorized = !snap.empty;
                    } catch (err) {
                        console.error("Direct Firestore QR check failed:", err);
                    }
                }

                if (!isAuthorized) {
                    setScanStatus('invalid');
                    console.warn(`Código ${normalizedCode} no encontrado en lotes autorizados.`);
                    return;
                }
                setScanStatus('found_new');
            }
        } catch (error) {
            console.error("Scan Error:", error);
            setScanStatus('error');
        }
    };

    const handleRecordVisit = async (client: Client) => {
        setScanStatus('recording_visit');
        try {
            const loc = await getCurrentLocation();
            await onRecordVisit(client.id, loc.lat, loc.lng);
            setScanStatus('visit_success');
        } catch { setScanStatus('error'); }
    };

    const handleRegister = async () => {
        if (!clientName || clientName.trim() === '') {
            alert("Por favor ingrese el nombre del cliente."); return;
        }

        // Photos are now optional as per user request
        // if (requireFacade && !facadeFile) { alert("Foto de fachada obligatoria"); return; }
        // if (requireClientPhoto && !clientPhotoFile) { alert("Foto del cliente obligatoria"); return; }

        // Final check for aval limits
        const getAvalLimitInfo = (name: string) => {
            if (!name) return { ok: true, limit: 2, count: 0 };
            const norm = name.trim().toUpperCase();
            const isAlreadyClient = clients.some(cl => !cl.isArchived && cl.name?.trim().toUpperCase() === norm);
            const limit = isAlreadyClient ? maxClientAsAval : maxAvalRegistrations;

            let count = 0;
            clients.forEach(cl => {
                if (cl.isArchived) return;
                const isAval = cl.avalName?.trim().toUpperCase() === norm ||
                    cl.avales?.some(a => a.name?.trim().toUpperCase() === norm);
                if (isAval) count++;
            });
            return { ok: count < limit, limit, count };
        };

        const checkClientLimit = (name: string) => {
            if (!name) return true;
            const norm = name.trim().toUpperCase();
            if (isRenewalMode) return true;

            let clientOccurrenceCount = 0;
            clients.forEach(cl => {
                if (cl.isArchived) return;
                if (cl.name?.trim().toUpperCase() === norm) {
                    clientOccurrenceCount++;
                }
            });
            return clientOccurrenceCount < maxClientActiveLoans;
        };

        if (!checkClientLimit(clientName)) {
            setRegistrationError({
                title: "Límite de Clientes",
                message: `El cliente ${clientName} ya cuenta con un registro activo. Por reglamento, una persona solo puede estar como CLIENTE ${maxClientActiveLoans} vez/veces.`
            });
            return;
        }

        const aval1Limit = getAvalLimitInfo(avalName);
        if (!aval1Limit.ok) {
            setRegistrationError({
                title: "Límite Excedido",
                message: `El aval ${avalName} ya cuenta con ${aval1Limit.count} registros previos. Por reglamento de esta financiera, no se permiten más de ${aval1Limit.limit} vinculaciones.`
            });
            return;
        }
        if (requiredAvales >= 2) {
            const aval2Limit = getAvalLimitInfo(aval2Name);
            if (!aval2Limit.ok) {
                setRegistrationError({
                    title: "Límite Excedido",
                    message: `El aval 2 (${aval2Name}) ya cuenta con ${aval2Limit.count} registros previos. Por reglamento de esta financiera, no se permiten más de ${aval2Limit.limit} vinculaciones.`
                });
                return;
            }
        }
        if (requiredAvales >= 3) {
            const aval3Limit = getAvalLimitInfo(aval3Name);
            if (!aval3Limit.ok) {
                setRegistrationError({
                    title: "Límite Excedido",
                    message: `El aval 3 (${aval3Name}) ya cuenta con ${aval3Limit.count} registros previos. Por reglamento de esta financiera, no se permiten más de ${aval3Limit.limit} vinculaciones.`
                });
                return;
            }
        }

        setIsUploading(true);
        try {
            const loc = await getCurrentLocation();

            // Upload Facade if provided
            let facadeUrl = isRenewalMode && facadePreview && !facadeFile ? facadePreview : '';
            if (facadeFile) {
                const compressed = await compressImage(facadeFile);
                const facadeRef = ref(storage, `facades/${scannedCode}_${Date.now()}.jpg`);
                const facadeSnapshot = await uploadBytes(facadeRef, compressed);
                facadeUrl = await getDownloadURL(facadeSnapshot.ref);
            }

            // Upload Client Photo if provided
            let clientPhotoUrl = isRenewalMode && clientPhotoPreview && !clientPhotoFile ? clientPhotoPreview : '';
            if (clientPhotoFile) {
                const compressed = await compressImage(clientPhotoFile);
                const clientRef = ref(storage, `clients/${scannedCode}_${Date.now()}.jpg`);
                const clientSnapshot = await uploadBytes(clientRef, compressed);
                clientPhotoUrl = await getDownloadURL(clientSnapshot.ref);
            }

            const currentAvales: Guarantor[] = [
                {
                    name: avalName.toUpperCase(),
                    address: avalAddress.toUpperCase(),
                    cellphone: avalCellphone,
                    facadeUrl: aval1IsClient ? (aval1SelectedClient?.facadeUrl || '') : '',
                    photoUrl: aval1IsClient ? (aval1SelectedClient?.clientPhotoUrl || '') : '',
                    guarantees: aval1Guarantees.map(g => ({ description: g.toUpperCase() }))
                }
            ];
            if (requiredAvales >= 2) {
                currentAvales.push({
                    name: aval2Name.toUpperCase(),
                    address: aval2Address.toUpperCase(),
                    cellphone: aval2Cellphone,
                    facadeUrl: aval2IsClient ? (aval2SelectedClient?.facadeUrl || '') : '',
                    photoUrl: aval2IsClient ? (aval2SelectedClient?.clientPhotoUrl || '') : '',
                    guarantees: aval2Guarantees.map(g => ({ description: g.toUpperCase() }))
                });
            }
            if (requiredAvales >= 3) {
                currentAvales.push({
                    name: aval3Name.toUpperCase(),
                    address: aval3Address.toUpperCase(),
                    cellphone: aval3Cellphone,
                    guarantees: aval3Guarantees.map(g => ({ description: g.toUpperCase() }))
                });
            }

            const isComplete =
                (!requireFacade || !!facadeUrl) &&
                (!requireClientPhoto || !!clientPhotoUrl) &&
                (guarantees.length >= (supervisorFinanciera?.minGuarantees || 0));

            await onRegisterClient(scannedCode, {
                name: clientName.toUpperCase(),
                address: clientAddress.toUpperCase(),
                creditAmount: Number(creditAmount),
                cellphone: cellphone,
                facadeUrl: facadeUrl,
                clientPhotoUrl: clientPhotoUrl,
                guarantees: guarantees.map(g => ({ description: g.toUpperCase() })),
                avalName: avalName.toUpperCase(),
                avalAddress: avalAddress.toUpperCase(),
                avalCellphone,
                avales: currentAvales,
                latitude: loc.lat,
                longitude: loc.lng,
                comments: clientComments.toUpperCase() // NEW: Include comments
            }, isRenewalMode, false, renewalSourceClientId || undefined); // ALWAYS record a visit upon registration

            if (!isComplete) {
                alert("Registro guardado como PENDIENTE. Faltan fotos o datos obligatorios según la financiera.");
            } else {
                alert("Registro completado exitosamente");
            }

            setView('list'); resetForm();
        } catch (e) { alert("Error de registro"); } finally { setIsUploading(false); }
    };

    const handleAvalVisit = async () => {
        if (!targetAvalClient) return; // targetAvalClient is used when view === 'aval_visit'

        // Photos are now optional
        /*
        if (requireGuarantorPhoto && !avalPhotoFile) {
            alert("Se requiere la foto del aval (persona).");
            return;
        }
        */

        // Check for minimum guarantees if required
        const fin = supervisorFinanciera;
        const minG = fin?.minGuaranteesForAval || 0;
        if (fin?.requireGuaranteesForAval && avalGuarantees.length < minG) {
            alert(`Se requieren al menos ${minG} garantías para el aval.`);
            return;
        }

        setIsUploading(true);
        try {
            const loc = await getCurrentLocation();

            let facadeUrl = '';
            if (facadeFile) {
                const compressedFacade = await compressImage(facadeFile);
                const facadeRef = ref(storage, `aval_facades/${targetAvalClient.id}_${Date.now()}.jpg`);
                const snapshotFacade = await uploadBytes(facadeRef, compressedFacade);
                facadeUrl = await getDownloadURL(snapshotFacade.ref);
            }

            let guarantorPhotoUrl = '';
            if (avalPhotoFile) {
                const compressedPhoto = await compressImage(avalPhotoFile);
                const photoRef = ref(storage, `aval_photos/${targetAvalClient.id}_${Date.now()}.jpg`);
                const snapshotPhoto = await uploadBytes(photoRef, compressedPhoto);
                guarantorPhotoUrl = await getDownloadURL(snapshotPhoto.ref);
            }

            const isAvalComplete =
                (!requireGuarantorFacade || !!facadeUrl || !!targetAvalClient.avales?.[selectedAvalIndex]?.facadeUrl) &&
                (!fin?.requireGuarantorPhoto || !!guarantorPhotoUrl || !!targetAvalClient.avales?.[selectedAvalIndex]?.photoUrl);

            await onUpdateAvalVisit(targetAvalClient.id, facadeUrl, loc.lat, loc.lng, selectedAvalIndex, avalGuarantees, guarantorPhotoUrl, isAvalComplete);

            if (!isAvalComplete) {
                alert("Visita de aval guardada parcialmente (PENDIENTE). Faltan fotos obligatorias.");
            } else {
                alert("Visita de aval registrada correctamente");
            }

            setView('list'); resetForm();
        } catch (e) {
            console.error(e);
            alert("Error al registrar visita de aval");
        } finally { setIsUploading(false); }
    };

    const handleUpdateClientData = async () => {
        if (!editingClient) return;
        setIsUploading(true);
        try {
            // Optional upload for new photos if they exist
            let facadeUrl = editingClient.facadeUrl || '';
            let clientPhotoUrl = editingClient.clientPhotoUrl || '';
            let avalFacadeUrl = editingClient.avalFacadeUrl || (editingClient.avales?.[0]?.facadeUrl || '');
            let avalPhotoUrl = editingClient.avalPhotoUrl || (editingClient.avales?.[0]?.photoUrl || '');

            if (supervisor.canEditPhotos) {
                if (facadeFile) {
                    const compressed = await compressImage(facadeFile);
                    const ref_ = ref(storage, `facades/${editingClient.id}_${Date.now()}.jpg`);
                    const snap = await uploadBytes(ref_, compressed);
                    facadeUrl = await getDownloadURL(snap.ref);
                }
                if (clientPhotoFile) {
                    const compressed = await compressImage(clientPhotoFile);
                    const ref_ = ref(storage, `clients/${editingClient.id}_${Date.now()}.jpg`);
                    const snap = await uploadBytes(ref_, compressed);
                    clientPhotoUrl = await getDownloadURL(snap.ref);
                }
                if (avalFacadeFile) {
                    const compressed = await compressImage(avalFacadeFile);
                    const ref_ = ref(storage, `aval_facades/${editingClient.id}_${Date.now()}.jpg`);
                    const snap = await uploadBytes(ref_, compressed);
                    avalFacadeUrl = await getDownloadURL(snap.ref);
                }
                if (avalPhotoFile) {
                    const compressed = await compressImage(avalPhotoFile);
                    const ref_ = ref(storage, `aval_photos/${editingClient.id}_${Date.now()}.jpg`);
                    const snap = await uploadBytes(ref_, compressed);
                    avalPhotoUrl = await getDownloadURL(snap.ref);
                }
            }

            const currentAvales: Guarantor[] = [
                {
                    name: avalName.toUpperCase(),
                    address: avalAddress.toUpperCase(),
                    cellphone: avalCellphone,
                    facadeUrl: aval1IsClient ? (aval1SelectedClient?.facadeUrl || '') : avalFacadeUrl,
                    photoUrl: aval1IsClient ? (aval1SelectedClient?.clientPhotoUrl || '') : avalPhotoUrl,
                    guarantees: aval1Guarantees.map(g => ({ description: g.toUpperCase() }))
                }
            ];
            if (requiredAvales >= 2) {
                currentAvales.push({
                    name: aval2Name.toUpperCase(),
                    address: aval2Address.toUpperCase(),
                    cellphone: aval2Cellphone,
                    facadeUrl: aval2IsClient ? (aval2SelectedClient?.facadeUrl || '') : (editingClient.avales?.[1]?.facadeUrl || ''),
                    photoUrl: aval2IsClient ? (aval2SelectedClient?.clientPhotoUrl || '') : (editingClient.avales?.[1]?.photoUrl || ''),
                    guarantees: aval2Guarantees.map(g => ({ description: g.toUpperCase() }))
                });
            }
            if (requiredAvales >= 3) {
                currentAvales.push({
                    name: aval3Name.toUpperCase(),
                    address: aval3Address.toUpperCase(),
                    cellphone: aval3Cellphone,
                    guarantees: aval3Guarantees.map(g => ({ description: g.toUpperCase() }))
                });
            }

            const updates: Partial<Client> = {
                name: clientName.toUpperCase(),
                address: clientAddress.toUpperCase(),
                creditAmount: Number(creditAmount),
                cellphone: cellphone,
                avalName: avalName.toUpperCase(),
                avalAddress: avalAddress.toUpperCase(),
                avalCellphone: avalCellphone,
                avales: currentAvales,
                guarantees: guarantees.map(g => ({ description: g.toUpperCase() })),
                comments: clientComments.toUpperCase(),
                facadeUrl,
                clientPhotoUrl,
                avalFacadeUrl,
                avalPhotoUrl
            };

            await onUpdateClient(editingClient.id, updates);
            setEditingClient(null);
            resetForm();
        } catch (e) { alert("Error al actualizar"); } finally { setIsUploading(false); }
    };

    const confirmDeleteClient = async (client: Client) => {
        setDeletingClient(client);
    };

    const handleArchiveClient = async () => {
        if (!deletingClient) return;
        try {
            await onUpdateClient(deletingClient.id, { isArchived: true });
            setDeletingClient(null);
        } catch (e) { alert("Error al archivar"); }
    };

    const openEditModal = (client: Client) => {
        setEditingClient(client);
        setClientName(client.name);
        setClientAddress(client.address || '');
        setCreditAmount(client.creditAmount?.toString() || '');
        setCellphone(client.cellphone || '');
        setAvalName(client.avalName || '');
        setAvalAddress(client.avalAddress || '');
        setAvalCellphone(client.avalCellphone || '');

        // NEW: Populate multiple avales and their guarantees if they exist
        if (client.avales && client.avales.length > 0) {
            setAval1Guarantees(client.avales[0].guarantees || []);
            if (client.avales.length > 1) {
                setAval2Name(client.avales[1].name);
                setAval2Address(client.avales[1].address || '');
                setAval2Cellphone(client.avales[1].cellphone || '');
                setAval2Guarantees(client.avales[1].guarantees || []);
                if (client.avales.length > 2) {
                    setAval3Name(client.avales[2].name);
                    setAval3Address(client.avales[2].address || '');
                    setAval3Cellphone(client.avales[2].cellphone || '');
                    setAval3Guarantees(client.avales[2].guarantees || []);
                }
            } else {
                setAval2Name(''); setAval2Address(''); setAval2Cellphone(''); setAval2Guarantees([]);
                setAval3Name(''); setAval3Address(''); setAval3Cellphone(''); setAval3Guarantees([]);
            }
        } else {
            setAval1Guarantees([]);
            setAval2Name(''); setAval2Address(''); setAval2Cellphone(''); setAval2Guarantees([]);
            setAval3Name(''); setAval3Address(''); setAval3Cellphone(''); setAval3Guarantees([]);
        }

        setGuarantees(client.guarantees ? client.guarantees.map(g => g.description) : []);
        setClientComments(client.comments || ''); // NEW: Set comments

        // Set previews if they exist
        setFacadePreview(client.facadeUrl || null);
        setClientPhotoPreview(client.clientPhotoUrl || null);
        setAvalFacadePreview(client.avalFacadeUrl || null);
        setAvalPhotoPreview(client.avalPhotoUrl || null);
    };

    const resetForm = () => {
        setClientName(''); setClientAddress(''); setCreditAmount(''); setCellphone('');
        setClientComments(''); // NEW: Reset comments
        setIsRenewalMode(false); setRenewalSourceClientId(null); setClientSearchQuery(''); // NEW: Reset renewal state
        setAvalName(''); setAvalAddress(''); setAvalCellphone('');
        setAval2Name(''); setAval2Address(''); setAval2Cellphone('');
        setAval3Name(''); setAval3Address(''); setAval3Cellphone('');
        setFacadeFile(null); setFacadePreview(null);
        setClientPhotoFile(null); setClientPhotoPreview(null);
        setAvalFacadeFile(null); setAvalFacadePreview(null);
        setAvalPhotoFile(null); setAvalPhotoPreview(null);
        setGuarantees([]); setAvalGuarantees([]); setScannedCode('');
        setAval1Guarantees([]); setAval2Guarantees([]); setAval3Guarantees([]);
        setNewAval1Guarantee(''); setNewAval2Guarantee(''); setNewAval3Guarantee('');
        setTargetAvalClient(null); setScanStatus('idle');
        setEditingClient(null); setCoincidenceClient(null);
        setAval1IsClient(false); setAval2IsClient(false);
        setAval1Search(''); setAval2Search('');
        setAval1SelectedClient(null); setAval2SelectedClient(null);
        setNewAvalGuarantee('');
        setShowManualInput(false); setManualCodeInput('');
    };

    // Helper para agregar garantía de aval
    const handleAddAvalGuarantee = () => {
        if (!newAvalGuarantee.trim()) return;
        setAvalGuarantees([...avalGuarantees, { description: newAvalGuarantee.trim().toUpperCase() }]);
        setNewAvalGuarantee('');
    };

    // Helper para agregar garantía
    const handleAddGuarantee = () => {
        if (!newGuarantee.trim()) return;
        setGuarantees([...guarantees, newGuarantee.trim().toUpperCase()]);
        setNewGuarantee('');
    };

    const getWeekName = (weekId: string) => {
        const w = allWeeks.find(wk => wk.id === weekId);
        return w ? w.name : 'Semana Desconocida';
    };

    const handleUpdateComments = async () => {
        if (!showCommentsModal) return;
        setIsUploading(true);
        try {
            await onUpdateClient(showCommentsModal.id, {
                comments: clientComments.toUpperCase()
            });
            setShowCommentsModal(null);
            setClientComments('');
        } catch (e) { alert("Error al actualizar comentarios"); } finally { setIsUploading(false); }
    };

    const handleUpdatePhoto = async (clientId: string, type: 'facadeUrl' | 'clientPhotoUrl' | 'avalFacadeUrl', file: File) => {
        setIsUploading(true);
        try {
            const compressedFile = await compressImage(file);
            const photoRef = ref(storage, `photos/${clientId}_${type}_${Date.now()}.jpg`);
            const snapshot = await uploadBytes(photoRef, compressedFile);
            const url = await getDownloadURL(snapshot.ref);
            await onUpdateClient(clientId, { [type]: url });

            // Update local state if the modal is open
            if (selectedClientHistory && selectedClientHistory.id === clientId) {
                setSelectedClientHistory({ ...selectedClientHistory, [type]: url });
            }
            alert("Foto actualizada correctamente");
        } catch (e) {
            alert("Error al actualizar la foto");
        } finally {
            setIsUploading(false);
        }
    };

    // NEW: Coincidence check effect
    useEffect(() => {
        if (!clientName || view !== 'scan' || scanStatus !== 'found_new' || isRenewalMode) {
            setCoincidenceClient(null);
            return;
        }

        const normalizedTyped = clientName.trim().toUpperCase();
        if (!normalizedTyped || ignoredNames.includes(normalizedTyped)) {
            setCoincidenceClient(null);
            return;
        }

        // Find EXACT coincidence (Full Name equality) within the same financiera
        const found = financieraClients.find(c => {
            const normalizedClientName = c.name.trim().toUpperCase();
            return normalizedClientName === normalizedTyped;
        });

        if (found) {
            // Only trigger if not already showing this one
            if (!coincidenceClient || coincidenceClient.id !== found.id) {
                setCoincidenceClient(found);
            }
        } else {
            setCoincidenceClient(null);
        }
    }, [clientName, view, scanStatus, financieraClients, isRenewalMode]);

    // NEW: Aval Coincidence check effect
    useEffect(() => {
        if (!avalName || view !== 'scan' || scanStatus !== 'found_new' || isRenewalMode) {
            setCoincidenceAval(null);
            return;
        }

        const normalizedTyped = avalName.trim().toUpperCase();
        if (!normalizedTyped || ignoredAvalNames.includes(normalizedTyped) || normalizedTyped.length < 5) {
            setCoincidenceAval(null);
            return;
        }

        // Find coincidence in all clients (since avales can be anywhere)
        let avalCount = 0;
        let firstMatchClient: Client | null = null;
        let isAlreadyClient = false;

        clients.forEach(cl => {
            if (cl.isArchived) return;
            const normalizedName = cl.name?.trim().toUpperCase();
            const normalizedAvalName = cl.avalName?.trim().toUpperCase();
            const isAvalInThisRecord = normalizedAvalName === normalizedTyped ||
                cl.avales?.some(a => a.name?.trim().toUpperCase() === normalizedTyped);

            if (normalizedName === normalizedTyped) {
                isAlreadyClient = true;
                if (!firstMatchClient) firstMatchClient = cl;
            }

            if (isAvalInThisRecord) {
                avalCount++;
                if (!firstMatchClient) firstMatchClient = cl;
            }
        });

        if ((avalCount > 0 || isAlreadyClient) && firstMatchClient) {
            const currentLimit = isAlreadyClient ? maxClientAsAval : maxAvalRegistrations;
            if (!coincidenceAval || coincidenceAval.client.id !== firstMatchClient.id || coincidenceAval.count !== avalCount || coincidenceAval.isAlreadyClient !== isAlreadyClient || coincidenceAval.limit !== currentLimit) {
                setCoincidenceAval({ client: firstMatchClient, count: avalCount, isAlreadyClient, limit: currentLimit });
            }
        } else {
            setCoincidenceAval(null);
        }
    }, [avalName, view, scanStatus, clients, isRenewalMode, ignoredAvalNames]);

    // NEW: Delay welcome modal check to let Firestore sync initial data
    useEffect(() => {
        const t = setTimeout(() => setDataLoaded(true), 1200);
        return () => clearTimeout(t);
    }, []);

    // NEW: Detect if it's a new cycle with 0 registrations or visits for this supervisor and show welcome modal
    useEffect(() => {
        if (!dataLoaded) return;
        if (currentWeek && !hasCheckedCycle) {
            const hasVisits = visits.some(
                v => v.supervisorId === supervisor.id && v.weekId === currentWeek.id
            );
            const hasRegistrations = currentWeekClients.length > 0;

            if (!hasVisits && !hasRegistrations) {
                setShowCycleModal(true);
            }
            setHasCheckedCycle(true);
        }
    }, [currentWeek, supervisor.id, visits, currentWeekClients, hasCheckedCycle, dataLoaded]);

    const getFormattedTodayDate = () => {
        const date = new Date();
        const options: Intl.DateTimeFormatOptions = {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        };
        const formatted = date.toLocaleDateString('es-MX', options);
        return formatted.charAt(0).toUpperCase() + formatted.slice(1);
    };

    const handleSelectRenewalClient = (client: Client) => {
        setRenewalSourceClientId(client.id);
        setClientName(client.name);
        setClientAddress(client.address || '');
        setCellphone(client.cellphone || '');
        setAvalName(client.avalName || '');
        setAvalAddress(client.avalAddress || '');
        setAvalCellphone(client.avalCellphone || '');

        // Pre-fill multiple avales if they exist
        if (client.avales && client.avales.length > 0) {
            setAvalName(client.avales[0].name);
            setAvalAddress(client.avales[0].address || '');
            setAvalCellphone(client.avales[0].cellphone || '');
            if (client.avales.length > 1) {
                setAval2Name(client.avales[1].name);
                setAval2Address(client.avales[1].address || '');
                setAval2Cellphone(client.avales[1].cellphone || '');
            }
            if (client.avales.length > 2) {
                setAval3Name(client.avales[2].name);
                setAval3Address(client.avales[2].address || '');
                setAval3Cellphone(client.avales[2].cellphone || '');
            }
        }

        setGuarantees([]);
        setClientComments(client.comments || '');
        setClientSearchQuery('');

        // Inherit photos for renewal
        setFacadePreview(client.facadeUrl || null);
        setClientPhotoPreview(client.clientPhotoUrl || null);
        setAvalFacadePreview(client.avalFacadeUrl || null);

        setIsRenewalMode(true);
    };

    const renderClientCard = (client: Client) => {
        // Determine if client is editable
        // Now controlled by specific permission. If permission granted, can edit any client.
        const canEdit = supervisor.canEditClients;
        const canArchive = supervisor.canArchiveClients;

        return (
            <div
                key={client.id}
                onClick={() => setSelectedClientHistory(client)}
                className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-2 active:bg-slate-50 transition-colors cursor-pointer relative group"
            >
                <div className="absolute top-3 right-3 flex gap-2">
                    <button
                        onClick={(e) => { e.stopPropagation(); setClientComments(client.comments || ''); setShowCommentsModal(client); }}
                        className="p-2 bg-amber-50 text-amber-600 rounded-full hover:bg-amber-600 hover:text-white transition-colors"
                        title="Comentarios"
                    >
                        <MessageSquare className="w-3.5 h-3.5" />
                    </button>

                    {canEdit && (
                        <button
                            onClick={(e) => { e.stopPropagation(); openEditModal(client); }}
                            className="p-2 bg-slate-100 text-slate-500 rounded-full hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                            title="Editar Cliente"
                        >
                            <Pencil className="w-3.5 h-3.5" />
                        </button>
                    )}

                    {canArchive && (
                        <button
                            onClick={(e) => { e.stopPropagation(); confirmDeleteClient(client); }}
                            className="p-2 bg-slate-100 text-slate-500 rounded-full hover:bg-red-50 hover:text-red-600 transition-colors"
                            title="Archivar Cliente"
                        >
                            <Archive className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>

                <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3 flex-1 pr-16">
                        {client.clientPhotoUrl && (
                            <div className="w-12 h-12 rounded-xl overflow-hidden border border-slate-100 flex-shrink-0 shadow-sm">
                                <CachedImage src={client.clientPhotoUrl} className="w-full h-full object-cover" />
                            </div>
                        )}
                        <div className="flex-1 min-w-0">
                            <h3 className="font-black text-slate-800 uppercase text-sm flex items-center gap-2 truncate">
                                {client.name}
                                {visits.some(v => v.clientId === client.id && v.weekId === currentWeek?.id) && (
                                    <CheckCircle className="w-4 h-4 text-green-500" />
                                )}
                            </h3>
                            <p className="text-[9px] text-slate-400 font-mono font-bold uppercase mb-2">{client.id}</p>
                            <div className="flex flex-wrap gap-2 text-[10px] uppercase font-black text-slate-500">
                                <span className="flex items-center gap-1 bg-indigo-50 text-indigo-600 px-2 py-1 rounded-lg"><DollarSign className="w-3 h-3" /> ${client.creditAmount}</span>
                                {client.cellphone && (
                                    <a href={`tel:${client.cellphone}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-indigo-600 px-2 py-1 rounded-lg transition-colors">
                                        <Smartphone className="w-3 h-3" /> {client.cellphone}
                                    </a>
                                )}
                                {(() => {
                                    const clientFin = financieras.find(f => f.id === client.financieraId);
                                    const completion = checkClientCompleteness(client, clientFin);
                                    return completion.isComplete ? (
                                        <span className="flex items-center gap-1 text-[10px] text-green-700 bg-green-100 px-2 py-1 rounded-lg border border-green-200">
                                            <CheckCircle className="w-3 h-3" /> COMPLETO
                                        </span>
                                    ) : (
                                        <div className="relative group/status flex">
                                            <span className="flex items-center gap-1 text-[10px] text-rose-700 bg-rose-100 px-2 py-1 rounded-lg border border-rose-200 cursor-help">
                                                <AlertTriangle className="w-3 h-3" /> INCOMPLETO
                                            </span>
                                            <div className="pointer-events-none absolute bottom-full left-0 mb-2 w-max max-w-xs bg-slate-900 text-white text-[10px] rounded-lg p-2 opacity-0 group-hover/status:opacity-100 transition-opacity z-50 text-left shadow-xl">
                                                <div className="font-bold text-slate-300 mb-1 border-b border-slate-700 pb-1">FALTA INFORMACIÓN:</div>
                                                <ul className="list-disc pl-4 space-y-0.5">
                                                    {completion.missing.map((m, i) => <li key={i}>{m}</li>)}
                                                </ul>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Aval Info Compact */}
                <div className="pt-3 border-t border-slate-50 flex items-center justify-between text-[10px]">
                    <div className="flex flex-col">
                        <span className="text-slate-400 font-black uppercase tracking-widest">Aval</span>
                        <span className="font-bold text-slate-700 uppercase truncate max-w-[150px]">{client.avalName || 'Sin Aval'}</span>
                    </div>
                    <div className="flex items-center gap-1 text-slate-600 font-mono font-bold bg-slate-100 px-2 py-1 rounded-lg">
                        <Phone className="w-3 h-3" /> {client.avalCellphone || 'N/A'}
                    </div>
                </div>

                <div className="flex justify-end items-center mt-2 pt-2 border-t border-slate-50">
                    <div className="flex items-center gap-2">
                        <a
                            href={`https://www.google.com/maps/search/?api=1&query=${client.latitude},${client.longitude}`}
                            target="_blank"
                            onClick={(e) => e.stopPropagation()}
                            className="p-1.5 bg-slate-100 rounded-lg text-slate-500 hover:text-indigo-600"
                        >
                            <MapIcon className="w-3.5 h-3.5" />
                        </a>
                        <div className="flex items-center gap-1 text-[9px] font-black text-indigo-400 uppercase">
                            <History className="w-3 h-3" /> Ver Historial
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="h-full flex flex-col pb-20 overflow-auto no-scrollbar relative">
            <input
                type="file"
                capture="environment"
                ref={fileInputRef}
                className="hidden"
                onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                        const c = await compressImage(f);
                        setFacadeFile(c);
                        const r = new FileReader();
                        r.onload = () => setFacadePreview(r.result as string);
                        r.readAsDataURL(c);
                    }
                }}
            />

            <input
                type="file"
                capture="user"
                ref={clientPhotoInputRef}
                className="hidden"
                onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                        const c = await compressImage(f);
                        setClientPhotoFile(c);
                        const r = new FileReader();
                        r.onload = () => setClientPhotoPreview(r.result as string);
                        r.readAsDataURL(c);
                    }
                }}
            />

            <input
                type="file"
                capture="user"
                ref={guarantorPhotoInputRef}
                className="hidden"
                onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                        const c = await compressImage(f);
                        setAvalPhotoFile(c);
                        const r = new FileReader();
                        r.onload = () => setAvalPhotoPreview(r.result as string);
                        r.readAsDataURL(c);
                    }
                }}
            />

            <input
                type="file"
                capture="environment"
                ref={guarantorFacadeInputRef}
                className="hidden"
                onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                        const c = await compressImage(f);
                        setAvalFacadeFile(c);
                        const r = new FileReader();
                        r.onload = () => setAvalFacadePreview(r.result as string);
                        r.readAsDataURL(c);
                    }
                }}
            />

            <div className="flex justify-between items-start mb-8 px-1">
                <div className="flex-1">
                    <h1 className="text-3xl font-black text-black leading-tight">
                        Hola, <br />
                        <span className="text-indigo-600 uppercase">
                            {supervisor.name.split(' ')[0]}
                        </span>
                    </h1>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-2">
                        {view === 'list' ? 'Gestión de Cartera' : view === 'scan' ? 'Modo Escáner' : 'Registro de Aval'}
                    </p>
                </div>
                {(supervisorFinanciera?.logoGifUrl || supervisorFinanciera?.logoUrl) && (
                    <div className="w-24 h-24 bg-white rounded-3xl shadow-2xl shadow-indigo-100 border border-slate-50 flex items-center justify-center overflow-hidden transition-all duration-500 hover:scale-105">
                        <CachedImage
                            src={supervisorFinanciera.logoGifUrl || supervisorFinanciera.logoUrl || ''}
                            alt="Logo"
                            className="w-full h-full object-cover"
                        />
                    </div>
                )}
            </div>

            {view === 'list' && (
                <div className="space-y-6">
                    {/* BOTÓN REGISTRAR VISITA - MAXI TAMAÑO PARA MÓVIL */}
                    <button
                        onClick={() => currentWeek ? setView('scan') : alert("Sistema Cerrado")}
                        disabled={!currentWeek}
                        className={`w-full py-6 rounded-3xl flex flex-col items-center justify-center gap-2 text-white font-black shadow-2xl uppercase transition-all active:scale-95 ${currentWeek ? 'bg-indigo-600 shadow-indigo-200' : 'bg-slate-300'}`}
                    >
                        <div className="flex items-center gap-3">
                            <Scan className="w-8 h-8" />
                            <span className="text-lg tracking-wider">Registrar Visita</span>
                        </div>
                        <span className="text-[9px] opacity-80 font-bold">Pulsa para escanear código del cliente</span>
                    </button>

                    {/* SEMANA ACTUAL */}
                    <div className="space-y-3">
                        <h4 className="text-[10px] font-black text-indigo-500 uppercase tracking-widest flex items-center gap-2 px-2">
                            <Calendar className="w-3 h-3" /> Ciclo Actual ({currentWeek?.name || 'Cerrada'}) ({supervisorFinanciera?.name || 'S/F'})
                        </h4>
                        {currentWeekClients.length > 0 ? (
                            currentWeekClients.map(renderClientCard)
                        ) : (
                            <div className="p-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-center">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Sin registros este ciclo</p>
                            </div>
                        )}
                    </div>

                    {/* HISTÓRICO Y OTROS */}
                    {(pastWeeksGrouped.length > 0 || otherClients.length > 0) && (
                        <div className="space-y-3 pt-4 border-t border-slate-100">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Historial / Semanas Anteriores</h4>

                            {pastWeeksGrouped.map(group => (
                                <div key={group.week.id} className="bg-slate-50/50 rounded-2xl border border-slate-100 overflow-hidden">
                                    <button
                                        onClick={() => setExpandedHistWeek(expandedHistWeek === group.week.id ? null : group.week.id)}
                                        className="w-full p-4 flex justify-between items-center hover:bg-slate-100 transition-colors"
                                    >
                                        <div className="flex items-center gap-3">
                                            <Clock className="w-4 h-4 text-slate-400" />
                                            <span className="text-[11px] font-black uppercase text-slate-600">{group.week.name} ({supervisorFinanciera?.name || 'S/F'})</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-bold text-slate-400">{group.clients.length}</span>
                                            {expandedHistWeek === group.week.id ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                                        </div>
                                    </button>
                                    {expandedHistWeek === group.week.id && (
                                        <div className="p-4 space-y-3 bg-white/50 border-t border-slate-100">
                                            {group.clients.map(renderClientCard)}
                                        </div>
                                    )}
                                </div>
                            ))}

                            {otherClients.length > 0 && (
                                <div className="bg-slate-50/50 rounded-2xl border border-slate-100 overflow-hidden">
                                    <button
                                        onClick={() => setExpandedHistWeek(expandedHistWeek === 'OTHERS' ? null : 'OTHERS')}
                                        className="w-full p-4 flex justify-between items-center hover:bg-slate-100 transition-colors"
                                    >
                                        <div className="flex items-center gap-3">
                                            <Hash className="w-4 h-4 text-slate-400" />
                                            <span className="text-[11px] font-black uppercase text-slate-600">Otros Registros</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-bold text-slate-400">{otherClients.length}</span>
                                            {expandedHistWeek === 'OTHERS' ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                                        </div>
                                    </button>
                                    {expandedHistWeek === 'OTHERS' && (
                                        <div className="p-4 space-y-3 bg-white/50 border-t border-slate-100">
                                            {otherClients.map(renderClientCard)}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Vistas scan y aval_visit */}
            {view === 'aval_visit' && (
                <div className="bg-white p-6 rounded-3xl shadow-xl border border-slate-100 max-w-lg mx-auto w-full animate-in zoom-in duration-200">
                    <div className="flex justify-between items-center mb-6">
                        <button onClick={() => setView('list')} className="p-2 bg-slate-100 rounded-full"><X className="w-5 h-5" /></button>
                        <h3 className="text-lg font-black text-blue-900 uppercase">Visita de Aval</h3>
                        <div className="w-8"></div>
                    </div>
                    <p className="text-xs text-slate-400 mb-8 text-center font-bold uppercase">
                        REGISTRANDO DOMICILIO PARA: <span className="text-blue-600 font-black">
                            {(targetAvalClient?.avales && targetAvalClient.avales[selectedAvalIndex])
                                ? targetAvalClient.avales[selectedAvalIndex].name
                                : targetAvalClient?.avalName}
                        </span>
                    </p>

                    <div className="space-y-8">
                        {/* HELPER TEXT TO INDICATE PENDING ITEMS */}
                        <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl flex items-center justify-between animate-in fade-in">
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-xl shadow-sm ${onlyShowPending ? 'bg-amber-100 text-amber-600' : 'bg-indigo-100 text-indigo-600'}`}>
                                    {onlyShowPending ? <Hash className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </div>
                                <div>
                                    <p className="text-[10px] font-black text-slate-900 uppercase">Filtro de Campos</p>
                                    <p className="text-[9px] font-bold text-slate-500 uppercase">{onlyShowPending ? 'Mostrando solo lo pendiente' : 'Mostrando todos los campos'}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setOnlyShowPending(!onlyShowPending)}
                                className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase transition-all ${onlyShowPending ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-white border border-slate-200 text-slate-600'}`}
                            >
                                {onlyShowPending ? 'Ver Todo' : 'Solo Pendiente'}
                            </button>
                        </div>

                        <div className={`grid gap-3 ${(requireGuarantorPhoto && requireGuarantorFacade) ? 'grid-cols-2' : 'grid-cols-1'}`}>
                            {/* FACHADA */}
                            {requireGuarantorFacade && (
                                (!(targetAvalClient?.avales?.[selectedAvalIndex]?.facadeUrl || (selectedAvalIndex === 0 && targetAvalClient?.avalFacadeUrl)) || facadeFile || showCompletedFacade || !onlyShowPending) ? (
                                    <div className={`border-2 border-dashed rounded-3xl p-3 text-center transition-all ${(!(targetAvalClient?.avales?.[selectedAvalIndex]?.facadeUrl || (selectedAvalIndex === 0 && targetAvalClient?.avalFacadeUrl)) || facadeFile || showCompletedFacade) ? 'border-slate-100 bg-slate-50/50' : 'border-emerald-200 bg-emerald-50/30 opacity-60'}`}>
                                        {(!(targetAvalClient?.avales?.[selectedAvalIndex]?.facadeUrl || (selectedAvalIndex === 0 && targetAvalClient?.avalFacadeUrl)) || facadeFile || showCompletedFacade) ? (
                                            <>
                                                {!facadePreview ? (
                                                    <div onClick={() => fileInputRef.current?.click()} className="cursor-pointer py-6 space-y-2">
                                                        <Camera className="w-8 h-8 text-blue-500 mx-auto opacity-80" />
                                                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-tight">Foto Fachada</p>
                                                    </div>
                                                ) : (
                                                    <div className="relative">
                                                        <img src={facadePreview} className="h-32 w-full object-cover rounded-2xl shadow-md" />
                                                        <button onClick={() => { setFacadeFile(null); setFacadePreview(null); }} className="absolute -top-1.5 -right-1.5 bg-red-500 text-white p-1 rounded-full shadow-lg"><Trash2 className="w-3.5 h-3.5" /></button>
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <div className="py-4 flex flex-col items-center justify-center gap-1">
                                                <CheckCircle className="w-6 h-6 text-emerald-500" />
                                                <p className="text-[8px] font-black text-emerald-600 uppercase">Fachada Lista</p>
                                                <button onClick={() => setShowCompletedFacade(true)} className="text-[7px] font-bold text-slate-400 underline uppercase mt-1">Editar</button>
                                            </div>
                                        )}
                                    </div>
                                ) : null
                            )}

                            {/* FOTO AVAL PERSONA */}
                            {requireGuarantorPhoto && (
                                (!(targetAvalClient?.avales?.[selectedAvalIndex]?.photoUrl || (selectedAvalIndex === 0 && targetAvalClient?.avalPhotoUrl)) || avalPhotoFile || showCompletedAvalPhoto || !onlyShowPending) ? (
                                    <div className={`border-2 border-dashed rounded-3xl p-3 text-center transition-all ${(!(targetAvalClient?.avales?.[selectedAvalIndex]?.photoUrl || (selectedAvalIndex === 0 && targetAvalClient?.avalPhotoUrl)) || avalPhotoFile || showCompletedAvalPhoto) ? 'border-slate-100 bg-slate-50/50' : 'border-emerald-200 bg-emerald-50/30 opacity-60'}`}>
                                        {(!(targetAvalClient?.avales?.[selectedAvalIndex]?.photoUrl || (selectedAvalIndex === 0 && targetAvalClient?.avalPhotoUrl)) || avalPhotoFile || showCompletedAvalPhoto) ? (
                                            <>
                                                {!avalPhotoPreview ? (
                                                    <div onClick={() => guarantorPhotoInputRef.current?.click()} className="cursor-pointer py-6 space-y-2">
                                                        <User className="w-8 h-8 text-blue-500 mx-auto opacity-80" />
                                                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-tight">Foto Aval</p>
                                                    </div>
                                                ) : (
                                                    <div className="relative">
                                                        <img src={avalPhotoPreview} className="h-32 w-full object-cover rounded-2xl shadow-md" />
                                                        <button onClick={() => { setAvalPhotoFile(null); setAvalPhotoPreview(null); }} className="absolute -top-1.5 -right-1.5 bg-red-500 text-white p-1 rounded-full shadow-lg"><Trash2 className="w-3.5 h-3.5" /></button>
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <div className="py-4 flex flex-col items-center justify-center gap-1">
                                                <CheckCircle className="w-6 h-6 text-emerald-500" />
                                                <p className="text-[8px] font-black text-emerald-600 uppercase">Aval Listo</p>
                                                <button onClick={() => setShowCompletedAvalPhoto(true)} className="text-[7px] font-bold text-slate-400 underline uppercase mt-1">Editar</button>
                                            </div>
                                        )}
                                    </div>
                                ) : null
                            )}
                        </div>

                        {/* FORMULARIO DE GARANTIAS DEL AVAL */}
                        {supervisorFinanciera?.requireGuaranteesForAval && (
                            (avalGuarantees.length < (supervisorFinanciera?.minGuaranteesForAval || 1) || showCompletedGuarantees || !onlyShowPending) ? (
                                <div className="space-y-4 bg-slate-50 p-6 rounded-3xl border border-slate-100 animate-in slide-in-from-top-4">
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-l-4 border-blue-500 pl-3 flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                            <ShieldCheck className="w-4 h-4" /> Inventario de Garantías del Aval ({avalGuarantees.length})
                                        </div>
                                        {supervisorFinanciera?.minGuaranteesForAval ? (
                                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${avalGuarantees.length >= supervisorFinanciera.minGuaranteesForAval ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'}`}>
                                                MÍNIMO: {supervisorFinanciera.minGuaranteesForAval}
                                            </span>
                                        ) : null}
                                    </h4>

                                    {(avalGuarantees.length < (supervisorFinanciera?.minGuaranteesForAval || 1) || showCompletedGuarantees) ? (
                                        <div className="flex flex-col gap-3">
                                            <input
                                                type="text"
                                                value={newAvalGuarantee}
                                                onChange={e => setNewAvalGuarantee(e.target.value.toUpperCase())}
                                                onKeyDown={(e) => e.key === 'Enter' && handleAddAvalGuarantee()}
                                                className="w-full p-4 border border-slate-200 rounded-2xl font-bold text-slate-900 bg-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 outline-none transition-shadow uppercase text-sm"
                                                placeholder="Ej: Moto Itallika 2024"
                                            />
                                            <button
                                                onClick={handleAddAvalGuarantee}
                                                className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg shadow-blue-100 flex items-center justify-center gap-2 hover:bg-blue-700 active:scale-95 transition-all"
                                            >
                                                <Plus className="w-5 h-5" /> Agregar Garantía
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-3 flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <CheckCircle className="w-4 h-4 text-emerald-500" />
                                                <span className="text-[10px] font-black text-emerald-900 uppercase">Mínimo de Garantías Cubierto</span>
                                            </div>
                                            <button
                                                onClick={() => setShowCompletedGuarantees(true)}
                                                className="text-[8px] font-black text-blue-600 uppercase underline"
                                            >
                                                AGREGAR MÁS
                                            </button>
                                        </div>
                                    )}

                                    <div className="space-y-2 mt-4">
                                        {avalGuarantees.length === 0 && (
                                            <p className="text-[10px] font-bold text-slate-300 italic text-center py-2">
                                                Lista vacía
                                            </p>
                                        )}
                                        {avalGuarantees.map((g, i) => (
                                            <div key={i} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center animate-in slide-in-from-bottom-1">
                                                <div className="flex items-center gap-3 overflow-hidden">
                                                    <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0"></div>
                                                    <span className="text-xs font-black text-slate-700 uppercase truncate">{g.description}</span>
                                                </div>
                                                <button
                                                    onClick={() => setAvalGuarantees(avalGuarantees.filter((_, idx) => idx !== i))}
                                                    className="p-3 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 hover:text-red-600 transition-colors"
                                                >
                                                    <Trash2 className="w-5 h-5" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : null
                        )}

                        <button
                            disabled={isUploading}
                            onClick={handleAvalVisit}
                            className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-blue-100 flex items-center justify-center gap-3 disabled:opacity-50 transition-all active:scale-95"
                        >
                            {isUploading ? <Loader2 className="animate-spin" /> : <Check className="w-5 h-5" />}
                            Confirmar Visita de Aval
                        </button>
                    </div>
                </div>
            )}

            {view === 'scan' && scanStatus === 'found_new' && (
                <div className="p-6 bg-white rounded-3xl shadow-xl border border-slate-100 space-y-8 animate-in slide-in-from-right-4">
                    <div className="flex justify-between items-center border-b pb-6">
                        <button onClick={() => setView('list')} className="p-2 bg-slate-100 rounded-full"><X className="w-5 h-5" /></button>
                        <div className="text-center">
                            <h3 className="text-xl font-black text-indigo-900 uppercase">Nuevo Cliente</h3>
                            <div className="bg-indigo-50 inline-flex items-center gap-2 px-4 py-1.5 rounded-full mt-3">
                                <QrCode className="w-3 h-3 text-indigo-600" />
                                <span className="text-[11px] font-black text-indigo-600 font-mono tracking-tighter uppercase">{scannedCode}</span>
                            </div>
                        </div>
                        <div className="w-9"></div>
                    </div>

                    <div className="space-y-8">
                        <div className="flex flex-col gap-4">
                            <button
                                onClick={() => {
                                    const nextVal = !isRenewalMode;
                                    setIsRenewalMode(nextVal);
                                    if (!nextVal) {
                                        setRenewalSourceClientId(null);
                                    }
                                }}
                                className={`w-full py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all flex items-center justify-center gap-2 border-2 ${isRenewalMode ? 'bg-amber-100 border-amber-500 text-amber-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}
                            >
                                <RefreshCw className={`w-4 h-4 ${isRenewalMode ? 'animate-spin' : ''}`} />
                                {isRenewalMode ? 'Modo Renovación Activo' : '¿Es una Renovación?'}
                            </button>

                            {isRenewalMode && (
                                <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                                    <div className="relative">
                                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <input
                                            type="text"
                                            value={clientSearchQuery}
                                            onChange={(e) => setClientSearchQuery(e.target.value)}
                                            placeholder="Buscar cliente por nombre..."
                                            className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-amber-500 outline-none uppercase text-xs"
                                        />
                                    </div>
                                    {clientSearchQuery.length > 2 && (
                                        <div className="max-h-40 overflow-y-auto border border-slate-100 rounded-2xl bg-white shadow-sm divide-y divide-slate-50">
                                            {financieraClients
                                                .filter(c => c.name.toLowerCase().includes(clientSearchQuery.toLowerCase()))
                                                .slice(0, 5)
                                                .map(c => (
                                                    <button
                                                        key={c.id}
                                                        onClick={() => handleSelectRenewalClient(c)}
                                                        className="w-full p-3 text-left hover:bg-slate-50 transition-colors flex items-center gap-3"
                                                    >
                                                        {c.clientPhotoUrl ? (
                                                            <div className="w-10 h-10 rounded-lg overflow-hidden border border-slate-100 flex-shrink-0 shadow-sm">
                                                                <CachedImage src={c.clientPhotoUrl} className="w-full h-full object-cover" />
                                                            </div>
                                                        ) : (
                                                            <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 flex-shrink-0">
                                                                <User className="w-5 h-5" />
                                                            </div>
                                                        )}
                                                        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                                                            <div className="flex items-center justify-between gap-2">
                                                                <span className="text-[11px] font-black text-slate-800 uppercase truncate">{c.name}</span>
                                                                <div className="flex-shrink-0 flex items-center gap-1 bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full border border-indigo-100">
                                                                    <UserCheck className="w-2.5 h-2.5" />
                                                                    <span className="text-[8px] font-black uppercase whitespace-nowrap">
                                                                        {allSupervisors.find(s => s.id === c.supervisorId)?.name || 'S/S'}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <span className="text-[9px] font-bold text-slate-500 uppercase leading-tight truncate">{c.address}</span>
                                                            <span className="text-[9px] font-bold text-indigo-600 flex items-center gap-1">
                                                                <Phone className="w-2.5 h-2.5" /> {c.cellphone}
                                                            </span>
                                                        </div>
                                                    </button>
                                                ))
                                            }
                                            {financieraClients.filter(c => c.name.toLowerCase().includes(clientSearchQuery.toLowerCase())).length === 0 && (
                                                <p className="p-4 text-center text-[10px] font-bold text-slate-400 uppercase">No se encontraron coincidencias</p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* SECCIÓN CLIENTE */}
                        <div className="space-y-6 bg-gradient-to-br from-indigo-50/70 via-purple-50/40 to-pink-50/30 p-6 rounded-[2rem] border border-indigo-200/80 shadow-sm animate-in zoom-in-95">
                            <h3 className="text-sm font-black text-indigo-900 uppercase tracking-wider flex items-center justify-between w-full">
                                <span className="flex items-center gap-2">
                                    <User className="w-4 h-4 text-indigo-600" /> DATOS DEL CLIENTE
                                </span>
                                {(() => {
                                    const pct = getClientFormProgress();
                                    const styles = getProgressStyles(pct);
                                    return (
                                        <span className={`flex items-center gap-2 border px-2 py-0.5 rounded-full text-[8.5px] font-black transition-colors ${styles.pill}`}>
                                            <span className={`w-20 h-1 rounded-full overflow-hidden block ${styles.barBg}`}>
                                                <span className={`h-full block transition-all duration-300 ${styles.barFill}`} style={{ width: `${pct}%` }}></span>
                                            </span>
                                            {pct}%
                                        </span>
                                    );
                                })()}
                            </h3>

                            <div className="space-y-4">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-l-4 border-indigo-500 pl-3">Datos Generales</h4>
                                <div className="space-y-3">
                                    <div className="relative">
                                        <input
                                            type="text"
                                            value={clientName}
                                            onChange={e => setClientName(e.target.value.toUpperCase())}
                                            disabled={isRenewalMode && !!clientName}
                                            className={`w-full p-4 border border-slate-200 rounded-2xl font-bold text-slate-900 bg-white placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow uppercase ${isRenewalMode && clientName ? 'opacity-60 bg-slate-50 cursor-not-allowed' : ''}`}
                                            placeholder="Nombre completo"
                                        />
                                        {isRenewalMode && clientName && (
                                            <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                                <Lock className="w-4 h-4 text-slate-400" />
                                            </div>
                                        )}
                                    </div>
                                    <input type="text" value={clientAddress} onChange={e => setClientAddress(e.target.value.toUpperCase())} className="w-full p-4 border border-slate-200 rounded-2xl font-bold text-slate-900 bg-white placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow uppercase" placeholder="Domicilio" />
                                    <div className="grid grid-cols-2 gap-3">
                                        <input type="number" inputMode="numeric" value={creditAmount} onChange={e => setCreditAmount(e.target.value)} className="w-full p-4 border border-slate-200 rounded-2xl font-bold text-slate-900 bg-white placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow" placeholder="Monto $" />
                                        <input type="tel" inputMode="numeric" pattern="[0-9]*" maxLength={10} value={cellphone} onChange={e => setCellphone(e.target.value.replace(/\D/g, ''))} className="w-full p-4 border border-slate-200 rounded-2xl font-bold text-slate-900 bg-white placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow" placeholder="Celular" />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-l-4 border-green-500 pl-3 flex items-center gap-2">
                                    <Package className="w-4 h-4 text-green-500" /> GARANTIAS DEL CLIENTE ({guarantees.length})
                                </h4>
                                <div className="flex flex-col gap-3">
                                    <input
                                        type="text"
                                        value={newGuarantee}
                                        onChange={e => setNewGuarantee(e.target.value.toUpperCase())}
                                        onKeyDown={(e) => e.key === 'Enter' && handleAddGuarantee()}
                                        className="w-full p-4 border border-slate-200 rounded-2xl font-bold text-slate-900 bg-white placeholder-slate-400 focus:ring-2 focus:ring-green-500 outline-none transition-shadow uppercase text-sm"
                                        placeholder="Ej: TV Samsung 50 pulgadas"
                                    />
                                    <button
                                        onClick={handleAddGuarantee}
                                        className="w-full py-3 bg-green-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest shadow-md flex items-center justify-center gap-2 hover:bg-green-700 active:scale-95 transition-all"
                                    >
                                        <Plus className="w-4 h-4" /> Agregar Artículo
                                    </button>
                                </div>
                                <div className="space-y-2 mt-2">
                                    {guarantees.length === 0 ? (
                                        <p className="text-center text-[10px] text-slate-400 font-bold uppercase py-2 opacity-50 border-2 border-dashed border-slate-200 rounded-xl">Sin garantías registradas</p>
                                    ) : (
                                        guarantees.map((g, i) => (
                                            <div key={i} className="bg-white p-2 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center">
                                                <span className="text-xs font-black text-slate-700 uppercase truncate">{g}</span>
                                                <button onClick={() => setGuarantees(guarantees.filter((_, idx) => idx !== i))} className="p-2 text-red-500 rounded-lg hover:bg-red-55"><Trash2 className="w-4 h-4" /></button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {(requireFacade || requireClientPhoto) && (
                                <div className="space-y-3">
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-l-4 border-indigo-500 pl-3">FOTOGRAFIAS DEL CLIENTE</h4>
                                    <div className="grid grid-cols-2 gap-3">
                                        {requireFacade && (
                                            <div className="space-y-2">
                                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Fachada Cliente</label>
                                                <div className="aspect-square border-4 border-dashed border-slate-100 rounded-3xl flex items-center justify-center bg-white overflow-hidden cursor-pointer relative group" onClick={() => fileInputRef.current?.click()}>
                                                    {facadePreview ? <img src={facadePreview} className="w-full h-full object-cover" /> : <div className="text-center p-4"><Home className="w-8 h-8 text-indigo-400 mx-auto mb-1" /><p className="text-[8px] font-black text-slate-400 uppercase">Tocar</p></div>}
                                                </div>
                                            </div>
                                        )}
                                        {requireClientPhoto && (
                                            <div className="space-y-2">
                                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Foto Cliente</label>
                                                <div className="aspect-square border-4 border-dashed border-slate-100 rounded-3xl flex items-center justify-center bg-white overflow-hidden cursor-pointer relative group" onClick={() => clientPhotoInputRef.current?.click()}>
                                                    {clientPhotoPreview ? <img src={clientPhotoPreview} className="w-full h-full object-cover" /> : <div className="text-center p-4"><User className="w-8 h-8 text-indigo-400 mx-auto mb-1" /><p className="text-[8px] font-black text-slate-400 uppercase">Tocar</p></div>}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            <div className="space-y-3">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-l-4 border-amber-500 pl-3 flex items-center gap-2">
                                    <MessageSquare className="w-4 h-4 text-amber-500" /> Comentarios Extras (Opcional)
                                </h4>
                                <textarea
                                    value={clientComments}
                                    onChange={e => setClientComments(e.target.value.toUpperCase())}
                                    className="w-full p-4 border border-slate-200 rounded-2xl font-bold text-slate-900 bg-white placeholder-slate-400 focus:ring-2 focus:ring-amber-500 outline-none transition-shadow uppercase text-sm min-h-[80px]"
                                    placeholder="Ej: Trabaja en la zapatería del centro, portón café..."
                                />
                            </div>
                        </div>

                        {/* SECCIÓN AVAL */}
                        <div className="space-y-6 bg-gradient-to-br from-blue-50/70 via-sky-50/40 to-indigo-50/30 p-6 rounded-[2rem] border border-blue-200/80 shadow-sm animate-in zoom-in-95">
                            <h3 className="text-sm font-black text-blue-900 uppercase tracking-wider flex items-center justify-between w-full">
                                <span className="flex items-center gap-2">
                                    <User className="w-4 h-4 text-blue-600" /> DATOS DEL AVAL
                                </span>
                                {(() => {
                                    const pct = getAvalFormProgress();
                                    const styles = getProgressStyles(pct);
                                    return (
                                        <span className={`flex items-center gap-2 border px-2 py-0.5 rounded-full text-[8.5px] font-black transition-colors ${styles.pill}`}>
                                            <span className={`w-20 h-1 rounded-full overflow-hidden block ${styles.barBg}`}>
                                                <span className={`h-full block transition-all duration-300 ${styles.barFill}`} style={{ width: `${pct}%` }}></span>
                                            </span>
                                            {pct}%
                                        </span>
                                    );
                                })()}
                            </h3>

                            {/* AVAL 1 */}
                            <div className="space-y-4 bg-white p-5 rounded-3xl border border-blue-100">
                                <div className="flex items-center justify-between">
                                    <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Aval Principal</p>
                                    <label className="flex items-center gap-2 cursor-pointer group">
                                        <input
                                            type="checkbox"
                                            checked={aval1IsClient}
                                            onChange={e => {
                                                setAval1IsClient(e.target.checked);
                                                if (!e.target.checked) setAval1SelectedClient(null);
                                            }}
                                            className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                                        />
                                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest group-hover:text-blue-600 transition-colors">¿Es cliente?</span>
                                    </label>
                                </div>

                                {aval1IsClient && (
                                    <div className="space-y-2 animate-in fade-in zoom-in-95 duration-200">
                                        <div className="relative">
                                            <input
                                                type="text"
                                                value={aval1Search}
                                                onChange={e => setAval1Search(e.target.value)}
                                                className="w-full p-4 pl-10 border border-blue-200 rounded-2xl font-bold text-slate-900 bg-slate-50 placeholder-slate-400 focus:ring-2 focus:ring-blue-500 outline-none"
                                                placeholder="Buscar cliente o aval..."
                                            />
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        </div>
                                        {aval1Search.length > 0 && (
                                            <div className="max-h-[150px] overflow-y-auto border border-slate-100 rounded-2xl bg-white shadow-xl divide-y divide-slate-50 scrollbar-hide z-[10]">
                                                {financieraGuarantorCandidates
                                                    .filter(c => c.name.toUpperCase().includes(aval1Search.toUpperCase()))
                                                    .map((c, idx) => (
                                                        <button
                                                            key={idx}
                                                            type="button"
                                                            onClick={() => {
                                                                setAval1SelectedClient({ id: 'AUTO', name: c.name, address: c.address, cellphone: c.cellphone, facadeUrl: c.facadeUrl, clientPhotoUrl: c.photoUrl } as any);
                                                                setAvalName(c.name);
                                                                setAvalAddress(c.address || '');
                                                                setAvalCellphone(c.cellphone || '');
                                                                if (c.facadeUrl) setAvalFacadePreview(c.facadeUrl);
                                                                if (c.photoUrl) setAvalPhotoPreview(c.photoUrl);
                                                                setAval1Search('');
                                                            }}
                                                            className="w-full p-3 text-left hover:bg-blue-50 transition-colors flex items-center justify-between group"
                                                        >
                                                            <div className="flex flex-col">
                                                                <span className="font-black text-slate-800 text-[10px] uppercase">{c.name}</span>
                                                                <span className="text-[8px] text-slate-400 font-mono">{c.cellphone}</span>
                                                            </div>
                                                            <UserCheck className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition-colors" />
                                                        </button>
                                                    ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                <input type="text" value={avalName} onChange={e => { setAvalName(e.target.value.toUpperCase()); if (aval1IsClient) setAval1IsClient(false); }} className="w-full p-4 border border-slate-200 rounded-2xl font-bold text-slate-900 bg-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 outline-none uppercase" placeholder="Nombre completo" />
                                <input type="text" value={avalAddress} onChange={e => { setAvalAddress(e.target.value.toUpperCase()); if (aval1IsClient) setAval1IsClient(false); }} className="w-full p-4 border border-slate-200 rounded-2xl font-bold text-slate-900 bg-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 outline-none uppercase" placeholder="Domicilio completo" />
                                <input type="tel" inputMode="numeric" pattern="[0-9]*" maxLength={10} value={avalCellphone} onChange={e => { setAvalCellphone(e.target.value.replace(/\D/g, '')); if (aval1IsClient) setAval1IsClient(false); }} className="w-full p-4 border border-slate-200 rounded-2xl font-bold text-slate-900 bg-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Celular" />

                                {/* Garantías del Aval 1 */}
                                <div className="space-y-3 pt-2 border-t border-slate-100">
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Garantías del Aval</p>
                                    <div className="flex flex-col gap-3">
                                        <input
                                            type="text"
                                            value={newAval1Guarantee}
                                            onChange={e => setNewAval1Guarantee(e.target.value.toUpperCase())}
                                            onKeyDown={(e) => e.key === 'Enter' && handleAddAval1Guarantee()}
                                            className="w-full p-4 border border-slate-200 rounded-2xl font-bold text-slate-900 bg-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 outline-none transition-shadow uppercase text-sm"
                                            placeholder="Ej: Moto Italika 125cc"
                                        />
                                        <button
                                            onClick={handleAddAval1Guarantee}
                                            className="w-full py-3 bg-blue-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest shadow-md flex items-center justify-center gap-2 hover:bg-blue-700 active:scale-95 transition-all"
                                        >
                                            <Plus className="w-4 h-4" /> Agregar Artículo
                                        </button>
                                    </div>
                                    <div className="space-y-2 mt-2">
                                        {aval1Guarantees.length === 0 ? (
                                            <p className="text-center text-[10px] text-slate-400 font-bold uppercase py-2 opacity-50 border-2 border-dashed border-slate-200 rounded-xl">Sin garantías registradas</p>
                                        ) : (
                                            aval1Guarantees.map((g, i) => (
                                                <div key={i} className="bg-white p-2 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center">
                                                    <span className="text-xs font-black text-slate-700 uppercase truncate">{g}</span>
                                                    <button onClick={() => setAval1Guarantees(aval1Guarantees.filter((_, idx) => idx !== i))} className="p-2 text-red-500 rounded-lg hover:bg-red-55"><Trash2 className="w-4 h-4" /></button>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* AVAL 2 */}
                            {requiredAvales >= 2 && (
                                <div className="space-y-4 bg-white p-5 rounded-3xl border border-blue-100">
                                    <div className="flex items-center justify-between">
                                        <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Segundo Aval (Requerido)</p>
                                        <label className="flex items-center gap-2 cursor-pointer group">
                                            <input
                                                type="checkbox"
                                                checked={aval2IsClient}
                                                onChange={e => {
                                                    setAval2IsClient(e.target.checked);
                                                    if (!e.target.checked) setAval2SelectedClient(null);
                                                }}
                                                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                                            />
                                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest group-hover:text-blue-600 transition-colors">¿Es cliente?</span>
                                        </label>
                                    </div>

                                    {aval2IsClient && (
                                        <div className="space-y-2 animate-in fade-in zoom-in-95 duration-200">
                                            <div className="relative">
                                                <input
                                                    type="text"
                                                    value={aval2Search}
                                                    onChange={e => setAval2Search(e.target.value)}
                                                    className="w-full p-4 pl-10 border border-blue-200 rounded-2xl font-bold text-slate-900 bg-slate-50 placeholder-slate-400 focus:ring-2 focus:ring-blue-500 outline-none"
                                                    placeholder="Buscar cliente o aval..."
                                                />
                                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                            </div>
                                            {aval2Search.length > 0 && (
                                                <div className="max-h-[150px] overflow-y-auto border border-slate-100 rounded-2xl bg-white shadow-xl divide-y divide-slate-50 scrollbar-hide z-[10]">
                                                    {financieraGuarantorCandidates
                                                        .filter(c => c.name.toUpperCase().includes(aval2Search.toUpperCase()))
                                                        .map((c, idx) => (
                                                            <button
                                                                key={idx}
                                                                type="button"
                                                                onClick={() => {
                                                                    setAval2SelectedClient({ id: 'AUTO', name: c.name, address: c.address, cellphone: c.cellphone, facadeUrl: c.facadeUrl, clientPhotoUrl: c.photoUrl } as any);
                                                                    setAval2Name(c.name);
                                                                    setAval2Address(c.address || '');
                                                                    setAval2Cellphone(c.cellphone || '');
                                                                    setAval2Search('');
                                                                }}
                                                                className="w-full p-3 text-left hover:bg-blue-50 transition-colors flex items-center justify-between group"
                                                            >
                                                                <div className="flex flex-col">
                                                                    <span className="font-black text-slate-800 text-[10px] uppercase">{c.name}</span>
                                                                    <span className="text-[8px] text-slate-400 font-mono">{c.cellphone}</span>
                                                                </div>
                                                                <UserCheck className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition-colors" />
                                                            </button>
                                                        ))}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <input type="text" value={aval2Name} onChange={e => { setAval2Name(e.target.value.toUpperCase()); if (aval2IsClient) setAval2IsClient(false); }} className="w-full p-4 border border-slate-200 rounded-2xl font-bold text-slate-900 bg-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 outline-none uppercase" placeholder="Nombre completo" />
                                    <input type="text" value={aval2Address} onChange={e => { setAval2Address(e.target.value.toUpperCase()); if (aval2IsClient) setAval2IsClient(false); }} className="w-full p-4 border border-slate-200 rounded-2xl font-bold text-slate-900 bg-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 outline-none uppercase" placeholder="Domicilio completo" />
                                    <input type="tel" inputMode="numeric" pattern="[0-9]*" maxLength={10} value={aval2Cellphone} onChange={e => { setAval2Cellphone(e.target.value.replace(/\D/g, '')); if (aval2IsClient) setAval2IsClient(false); }} className="w-full p-4 border border-slate-200 rounded-2xl font-bold text-slate-900 bg-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Celular" />

                                    {/* Garantías del Aval 2 */}
                                    <div className="space-y-3 pt-2 border-t border-slate-100">
                                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Garantías del Aval 2</p>
                                        <div className="flex flex-col gap-3">
                                            <input
                                                type="text"
                                                value={newAval2Guarantee}
                                                onChange={e => setNewAval2Guarantee(e.target.value.toUpperCase())}
                                                onKeyDown={(e) => e.key === 'Enter' && handleAddAval2Guarantee()}
                                                className="w-full p-4 border border-slate-200 rounded-2xl font-bold text-slate-900 bg-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 outline-none transition-shadow uppercase text-sm"
                                                placeholder="Garantía de Aval 2"
                                            />
                                            <button onClick={handleAddAval2Guarantee} className="w-full py-3 bg-blue-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest shadow-md flex items-center justify-center gap-2 hover:bg-blue-700 active:scale-95 transition-all">
                                                <Plus className="w-4 h-4" /> Agregar Artículo
                                            </button>
                                        </div>
                                        <div className="space-y-2 mt-2">
                                            {aval2Guarantees.length === 0 ? (
                                                <p className="text-center text-[10px] text-slate-400 font-bold uppercase py-2 opacity-50 border-2 border-dashed border-slate-200 rounded-xl">Sin garantías registradas</p>
                                            ) : (
                                                aval2Guarantees.map((g, i) => (
                                                    <div key={i} className="bg-white p-2 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center">
                                                        <span className="text-xs font-black text-slate-700 uppercase truncate">{g}</span>
                                                        <button onClick={() => setAval2Guarantees(aval2Guarantees.filter((_, idx) => idx !== i))} className="p-2 text-red-500 rounded-lg hover:bg-red-55"><Trash2 className="w-4 h-4" /></button>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* AVAL 3 */}
                            {requiredAvales >= 3 && (
                                <div className="space-y-4 bg-white p-5 rounded-3xl border border-blue-100">
                                    <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Tercer Aval (Requerido)</p>
                                    <input type="text" value={aval3Name} onChange={e => setAval3Name(e.target.value.toUpperCase())} className="w-full p-4 border border-slate-200 rounded-2xl font-bold text-slate-900 bg-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 outline-none uppercase" placeholder="Nombre completo" />
                                    <input type="text" value={aval3Address} onChange={e => setAval3Address(e.target.value.toUpperCase())} className="w-full p-4 border border-slate-200 rounded-2xl font-bold text-slate-900 bg-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 outline-none uppercase" placeholder="Domicilio completo" />
                                    <input type="tel" inputMode="numeric" pattern="[0-9]*" maxLength={10} value={aval3Cellphone} onChange={e => setAval3Cellphone(e.target.value.replace(/\D/g, ''))} className="w-full p-4 border border-slate-200 rounded-2xl font-bold text-slate-900 bg-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Celular" />

                                    {/* Garantías del Aval 3 */}
                                    <div className="space-y-3 pt-2 border-t border-slate-100">
                                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Garantías del Aval 3</p>
                                        <div className="flex flex-col gap-3">
                                            <input
                                                type="text"
                                                value={newAval3Guarantee}
                                                onChange={e => setNewAval3Guarantee(e.target.value.toUpperCase())}
                                                onKeyDown={(e) => e.key === 'Enter' && handleAddAval3Guarantee()}
                                                className="w-full p-4 border border-slate-200 rounded-2xl font-bold text-slate-900 bg-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 outline-none transition-shadow uppercase text-sm"
                                                placeholder="Garantía de Aval 3"
                                            />
                                            <button onClick={handleAddAval3Guarantee} className="w-full py-3 bg-blue-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest shadow-md flex items-center justify-center gap-2 hover:bg-blue-700 active:scale-95 transition-all">
                                                <Plus className="w-4 h-4" /> Agregar Artículo
                                            </button>
                                        </div>
                                        <div className="space-y-2 mt-2">
                                            {aval3Guarantees.length === 0 ? (
                                                <p className="text-center text-[10px] text-slate-400 font-bold uppercase py-2 opacity-50 border-2 border-dashed border-slate-200 rounded-xl">Sin garantías registradas</p>
                                            ) : (
                                                aval3Guarantees.map((g, i) => (
                                                    <div key={i} className="bg-white p-2 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center">
                                                        <span className="text-xs font-black text-slate-700 uppercase truncate">{g}</span>
                                                        <button onClick={() => setAval3Guarantees(aval3Guarantees.filter((_, idx) => idx !== i))} className="p-2 text-red-500 rounded-lg hover:bg-red-55"><Trash2 className="w-4 h-4" /></button>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* FOTOGRAFIAS DEL AVAL (Condicionales según Financiera) */}
                            {(requireGuarantorFacade || requireGuarantorPhoto) && (
                                <div className="space-y-3 bg-white p-5 rounded-3xl border border-blue-100">
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">FOTOGRAFIAS DEL AVAL</h4>
                                    <div className="grid grid-cols-2 gap-3">
                                        {requireGuarantorFacade && (
                                            <div className="space-y-2">
                                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Fachada Aval</label>
                                                <div className="aspect-square border-4 border-dashed border-slate-100 rounded-3xl flex items-center justify-center bg-white overflow-hidden cursor-pointer relative group" onClick={() => guarantorFacadeInputRef.current?.click()}>
                                                    {avalFacadePreview ? <img src={avalFacadePreview} className="w-full h-full object-cover" /> : <div className="text-center p-4"><Home className="w-8 h-8 text-blue-400 mx-auto mb-1" /><p className="text-[8px] font-black text-slate-400 uppercase">Tocar</p></div>}
                                                </div>
                                            </div>
                                        )}
                                        {requireGuarantorPhoto && (
                                            <div className="space-y-2">
                                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Foto Aval</label>
                                                <div className="aspect-square border-4 border-dashed border-slate-100 rounded-3xl flex items-center justify-center bg-white overflow-hidden cursor-pointer relative group" onClick={() => guarantorPhotoInputRef.current?.click()}>
                                                    {avalPhotoPreview ? <img src={avalPhotoPreview} className="w-full h-full object-cover" /> : <div className="text-center p-4"><User className="w-8 h-8 text-blue-400 mx-auto mb-1" /><p className="text-[8px] font-black text-slate-400 uppercase">Tocar</p></div>}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        <button
                            disabled={isUploading}
                            onClick={handleRegister}
                            className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-2xl shadow-indigo-100 flex items-center justify-center gap-3 transition-all active:scale-95 disabled:opacity-50"
                        >
                            {isUploading ? <Loader2 className="animate-spin w-5 h-5" /> : <Check className="w-5 h-5" />}
                            Finalizar Registro
                        </button>
                    </div>
                </div>
            )}

            {view === 'scan' && (scanStatus === 'idle' || scanStatus === 'scanning' || scanStatus === 'error') && (
                <div className="flex-1 bg-black rounded-3xl overflow-hidden relative shadow-2xl border-4 border-white">
                    <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" />
                    <canvas ref={canvasRef} className="hidden" />
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-6 text-center bg-black/30 backdrop-blur-[1px]">
                        <div className="w-64 h-64 border-2 border-white/50 rounded-3xl relative mb-8">
                            <div className="absolute inset-0 border-4 border-indigo-500 animate-pulse rounded-2xl"></div>
                        </div>
                        <p className="text-white font-black text-xs uppercase tracking-widest bg-indigo-600/90 px-6 py-2.5 rounded-full shadow-lg border border-indigo-400">Escanea Código del Cliente</p>

                        {!showManualInput ? (
                            <button
                                onClick={() => setShowManualInput(true)}
                                className="mt-4 bg-indigo-500/80 text-white px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl border border-indigo-400 flex items-center gap-2 active:scale-95 transition-all"
                            >
                                <Hash className="w-4 h-4" />
                                Ingresar Código Manual
                            </button>
                        ) : (
                            <div className="mt-4 w-full max-w-[240px] space-y-2 animate-in zoom-in duration-200">
                                <input
                                    autoFocus
                                    type="text"
                                    value={manualCodeInput}
                                    onChange={(e) => setManualCodeInput(e.target.value.toUpperCase())}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && manualCodeInput.trim()) {
                                            handleScanSuccess(manualCodeInput.trim());
                                        }
                                    }}
                                    placeholder="CÓDIGO (EJ: Q-001)"
                                    className="w-full text-center p-3 bg-white border-2 border-indigo-500 rounded-xl font-black text-slate-900 placeholder-slate-400 focus:ring-4 focus:ring-indigo-500/20 outline-none uppercase"
                                />
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => {
                                            if (manualCodeInput.trim()) handleScanSuccess(manualCodeInput.trim());
                                        }}
                                        disabled={!manualCodeInput.trim()}
                                        className="flex-1 bg-green-600 text-white p-3 rounded-xl text-[10px] font-black uppercase disabled:opacity-50"
                                    >
                                        Confirmar
                                    </button>
                                    <button
                                        onClick={() => { setShowManualInput(false); setManualCodeInput(''); }}
                                        className="bg-red-500 text-white p-3 rounded-xl text-[10px] font-black uppercase"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        )}

                        <button onClick={() => setView('list')} className="mt-8 bg-white/20 text-white px-6 py-2 rounded-xl text-xs font-black uppercase backdrop-blur-md">Cancelar</button>
                        {cameraError && <p className="text-red-400 mt-6 text-[10px] font-black uppercase bg-black/60 px-4 py-2 rounded-lg">{cameraError}</p>}
                    </div>
                </div>
            )}

            {scanStatus === 'processing' && (
                <div className="flex-1 flex flex-col items-center justify-center bg-slate-900 text-white rounded-3xl p-6 text-center">
                    <Loader2 className="w-12 h-12 animate-spin text-indigo-500 mb-6" />
                    <p className="font-black uppercase text-xs tracking-widest mb-8">Analizando Código...</p>
                    <button
                        onClick={() => setScanStatus('idle')}
                        className="bg-white/10 text-white/60 px-6 py-2 rounded-xl text-[10px] font-black uppercase backdrop-blur-md border border-white/10"
                    >
                        Cancelar
                    </button>
                </div>
            )}
            {scanStatus === 'recording_visit' && <div className="flex-1 flex flex-col items-center justify-center bg-indigo-50 text-indigo-900 rounded-3xl p-8 text-center animate-pulse"><Loader2 className="w-20 h-20 animate-spin text-indigo-600 mb-8" /><h3 className="text-2xl font-black uppercase tracking-tight">Obteniendo GPS...</h3></div>}
            {scanStatus === 'visit_success' && <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-3xl p-8 text-center shadow-inner"><div className="bg-green-100 p-6 rounded-full mb-6"><CheckCircle className="w-24 h-24 text-green-500" /></div><h2 className="text-3xl font-black text-slate-800 uppercase tracking-tight text-slate-900">Visita Registrada</h2><button onClick={() => setView('list')} className="mt-10 bg-slate-900 text-white px-10 py-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl active:scale-95 transition-transform">Entendido</button></div>}

            {scanStatus === 'invalid' && (
                <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-3xl p-8 text-center shadow-inner border border-slate-100 max-w-md mx-auto space-y-6">
                    <div className="bg-amber-50 p-6 rounded-full border border-amber-200">
                        <ShieldAlert className="w-20 h-20 text-amber-500 animate-bounce" />
                    </div>
                    <div className="space-y-3">
                        <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Código No Autorizado</h2>
                        <div className="bg-slate-50 border border-slate-100 inline-flex items-center gap-2 px-4 py-1.5 rounded-full">
                            <QrCode className="w-4 h-4 text-slate-500" />
                            <span className="text-xs font-black text-slate-600 font-mono tracking-tight uppercase">{scannedCode}</span>
                        </div>
                        <p className="text-sm text-slate-500 leading-relaxed max-w-sm">
                            {(() => {
                                const existing = clients.find(c => c.id === scannedCode);
                                if (existing && existing.supervisorId !== supervisor.id) {
                                    const owner = allSupervisors.find(s => s.id === existing.supervisorId);
                                    return `Este código YA ESTÁ REGISTRADO por el supervisor "${owner?.name || 'otro supervisor'}". No puedes utilizar un código que ya pertenece a otra ruta.`;
                                }
                                return "El código ingresado no pertenece a un lote de códigos QR pre-autorizados o no está registrado para este ciclo.";
                            })()}
                        </p>
                        <p className="text-[11px] text-amber-600 font-bold bg-amber-50 rounded-xl p-3 leading-snug">
                            {clients.some(c => c.id === scannedCode)
                                ? "⚠️ Si crees que esto es un error, contacta al administrador para reasignar el código o archivarlo del supervisor anterior."
                                : "⚠️ Si este código pertenece a una tarjeta física o documento válido de un nuevo cliente, se recomienda registrar su lote QR en el Panel de Administrador."
                            }
                        </p>
                    </div>

                    <div className="w-full flex flex-col gap-3 pt-4">
                        <button
                            onClick={() => setScanStatus('found_new')}
                            className="w-full py-4 bg-amber-600 hover:bg-amber-700 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2"
                        >
                            <Plus className="w-4 h-4 text-amber-200" />
                            Omitir Validación y Registrar Nuevo Cliente
                        </button>

                        <div className="flex gap-2">
                            <button
                                onClick={() => setScanStatus('idle')}
                                className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold uppercase text-[10px] tracking-widest transition-colors flex items-center justify-center gap-2"
                            >
                                <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
                                Reintentar
                            </button>
                            <button
                                onClick={() => setView('list')}
                                className="flex-1 py-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold uppercase text-[10px] tracking-widest transition-colors"
                            >
                                Volver a la Lista
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL COINCIDENCIA DE NOMBRE */}
            <AnimatePresence>
                {coincidenceClient && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.9, y: 20 }}
                            className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden"
                        >
                            <div className="bg-amber-500 p-4 flex items-center gap-3 text-white">
                                <AlertTriangle className="w-6 h-6 animate-pulse" />
                                <h3 className="font-black uppercase text-sm tracking-tight text-white">¡Duplicidad Detectada!</h3>
                            </div>

                            <div className="p-6 space-y-6">
                                <div className="flex flex-col items-center text-center">
                                    <div className="w-24 h-24 rounded-2xl overflow-hidden border-4 border-slate-100 shadow-lg mb-4 bg-slate-50">
                                        {coincidenceClient.clientPhotoUrl || coincidenceClient.facadeUrl ? (
                                            <CachedImage src={coincidenceClient.clientPhotoUrl || coincidenceClient.facadeUrl || ''} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-slate-300">
                                                <User className="w-10 h-10" />
                                            </div>
                                        )}
                                    </div>
                                    <h4 className="text-xl font-black text-slate-900 uppercase leading-tight">{coincidenceClient.name}</h4>
                                    <p className="mt-2 text-[10px] font-black text-red-600 bg-red-50 px-4 py-1.5 rounded-full border border-red-100 uppercase">
                                        ¡ESTA PERSONA YA ES UN CLIENTE! (LÍMITE: 1 VEZ)
                                    </p>
                                </div>

                                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3">
                                    <p className="text-[10px] font-bold text-slate-600 text-center uppercase leading-tight">
                                        POR REGLAMENTO, UNA PERSONA SOLO PUEDE SER <span className="text-indigo-600 font-black">CLIENTE 1 VEZ</span> Y <span className="text-indigo-600 font-black">AVAL 2 VECES</span>.
                                    </p>
                                    <p className="text-[9px] font-bold text-slate-400 text-center uppercase">
                                        Si se trata de una renovación, selecciona la opción correspondiente abajo para reutilizar los datos.
                                    </p>
                                </div>

                                <div className="flex gap-3">
                                    <button
                                        onClick={() => {
                                            setClientName('');
                                            setCoincidenceClient(null);
                                        }}
                                        className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-200 transition-all active:scale-95"
                                    >
                                        Ignorar
                                    </button>
                                    <button
                                        onClick={() => {
                                            handleSelectRenewalClient(coincidenceClient);
                                            setCoincidenceClient(null);
                                        }}
                                        className="flex-2 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-indigo-100 flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all active:scale-95"
                                    >
                                        <RefreshCw className="w-3.5 h-3.5" />
                                        Renovar/Usar Datos
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* MODAL COINCIDENCIA DE AVAL */}
            <AnimatePresence>
                {coincidenceAval && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.9, y: 20 }}
                            className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden"
                        >
                            <div className={`${coincidenceAval.count >= coincidenceAval.limit ? 'bg-red-500' : 'bg-amber-500'} p-4 flex items-center gap-3 text-white`}>
                                <AlertTriangle className="w-6 h-6 animate-pulse" />
                                <h3 className="font-black uppercase text-sm tracking-tight">
                                    {coincidenceAval.count >= coincidenceAval.limit ? 'Límite de Avales Alcanzado' : coincidenceAval.isAlreadyClient ? 'Persona ya es Cliente' : 'Aval con Registros Previos'}
                                </h3>
                            </div>

                            <div className="p-6 space-y-6">
                                <div className="flex flex-col items-center">
                                    <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 mb-4 border-4 border-white shadow-md">
                                        <UserCheck className="w-10 h-10" />
                                    </div>
                                    <h4 className="text-xl font-black text-slate-900 uppercase text-center leading-tight">
                                        {avalName}
                                    </h4>
                                    <div className="mt-2 flex flex-col items-center gap-1">
                                        <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
                                            Vinculado actualmente a:
                                        </span>
                                        <div className="flex items-center gap-2 px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full border border-indigo-100">
                                            <span className="text-[10px] font-black uppercase">
                                                Sup: {allSupervisors.find(s => s.id === coincidenceAval.client.supervisorId)?.name || 'Desconocido'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3">
                                    <p className="text-[10px] font-bold text-slate-600 text-center uppercase leading-tight">
                                        {coincidenceAval.isAlreadyClient && (
                                            <span className="block text-red-600 mb-2 border-b border-red-100 pb-2">¡ESTA PERSONA YA ES UN CLIENTE REGISTRADO! (LÍMITE DE PRÉSTAMOS ACTIVOS: {maxClientActiveLoans})</span>
                                        )}
                                        <span className="block text-indigo-600 font-black mb-1">REGLAMENTO MÁX: CLIENTE {maxClientActiveLoans} V. + AVAL (NO-CLIENTE) {maxAvalRegistrations} V. / (CLIENTE) {maxClientAsAval} V.</span>
                                        {coincidenceAval.count >= coincidenceAval.limit
                                            ? `ESTA PERSONA YA TIENE ${coincidenceAval.count} REGISTROS COMO AVAL. NO PUEDE SER VINCULADO MÁS VECES.`
                                            : `ESTA PERSONA TIENE ${coincidenceAval.count} REGISTRO(S) COMO AVAL (LÍMITE MÁX: ${coincidenceAval.limit}).`
                                        }
                                    </p>

                                    {coincidenceAval.count < coincidenceAval.limit && (
                                        <div className="pt-2 border-t border-slate-200">
                                            <p className="text-[9px] font-black text-slate-400 uppercase mb-2">Datos existentes:</p>
                                            <div className="flex flex-col gap-1">
                                                <span className="text-[11px] font-bold text-slate-700 uppercase flex items-center gap-2">
                                                    <MapPin className="w-3 h-3 text-slate-400" /> {coincidenceAval.client.avalAddress}
                                                </span>
                                                <span className="text-[11px] font-bold text-slate-700 flex items-center gap-2">
                                                    <Phone className="w-3 h-3 text-slate-400" /> {coincidenceAval.client.avalCellphone}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="flex gap-3">
                                    {coincidenceAval.count >= coincidenceAval.limit ? (
                                        <button
                                            onClick={() => {
                                                setAvalName('');
                                                setCoincidenceAval(null);
                                            }}
                                            className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl transition-all active:scale-95"
                                        >
                                            Entendido / Cambiar Aval
                                        </button>
                                    ) : (
                                        <>
                                            <button
                                                onClick={() => {
                                                    setAvalName('');
                                                    setCoincidenceAval(null);
                                                }}
                                                className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-200 transition-all active:scale-95"
                                            >
                                                Ignorar
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setAvalAddress(coincidenceAval.client.avalAddress || '');
                                                    setAvalCellphone(coincidenceAval.client.avalCellphone || '');
                                                    const currentName = avalName.trim().toUpperCase();
                                                    if (currentName) setIgnoredAvalNames(prev => [...prev, currentName]);
                                                    setCoincidenceAval(null);
                                                }}
                                                className="flex-2 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-indigo-100 flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all active:scale-95"
                                            >
                                                <UserCheck className="w-3.5 h-3.5" />
                                                Tomar Datos
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* MODAL DE ERROR DE REGISTRO */}
            <AnimatePresence>
                {registrationError && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4 backdrop-blur-xl"
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.9, y: 20 }}
                            className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-sm overflow-hidden border border-red-100"
                        >
                            <div className="bg-red-600 p-6 flex flex-col items-center text-white text-center">
                                <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mb-4 backdrop-blur-md">
                                    <ShieldAlert className="w-10 h-10" />
                                </div>
                                <h3 className="text-xl font-black uppercase tracking-tight leading-none mb-1">
                                    {registrationError.title}
                                </h3>
                                <p className="text-[11px] font-bold opacity-80 uppercase tracking-widest italic">Restricción de Seguridad</p>
                            </div>

                            <div className="p-8 space-y-6">
                                <p className="text-slate-600 font-bold text-center uppercase text-sm leading-relaxed">
                                    {registrationError.message}
                                </p>

                                <button
                                    onClick={() => setRegistrationError(null)}
                                    className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs tracking-[0.2em] shadow-xl shadow-slate-200 transition-all active:scale-95 flex items-center justify-center gap-2"
                                >
                                    Entendido
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* MODAL COMENTARIOS EXTRAS */}
            {showCommentsModal && (
                <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-sm p-6 animate-in slide-in-from-bottom-10 sm:zoom-in duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-black text-slate-900 uppercase">Comentarios Extras</h3>
                            <button onClick={() => setShowCommentsModal(null)} className="p-2 hover:bg-slate-100 rounded-full"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="space-y-4">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cliente: <span className="text-indigo-600">{showCommentsModal.name}</span></p>
                            <textarea
                                value={clientComments}
                                onChange={e => setClientComments(e.target.value.toUpperCase())}
                                className="w-full p-4 border border-slate-200 rounded-2xl font-bold text-slate-900 bg-white placeholder-slate-400 focus:ring-2 focus:ring-amber-500 outline-none transition-shadow uppercase text-sm min-h-[150px]"
                                placeholder="Agrega información para localizar al cliente..."
                            />
                            <button
                                disabled={isUploading}
                                onClick={handleUpdateComments}
                                className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
                            >
                                {isUploading ? <Loader2 className="animate-spin w-4 h-4" /> : <Save className="w-4 h-4" />}
                                Guardar Comentarios
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL CONFIRMACIÓN ELIMINAR */}
            {deletingClient && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 text-center animate-in zoom-in duration-200">
                        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <AlertTriangle className="w-8 h-8 text-red-600" />
                        </div>
                        <h3 className="text-lg font-black text-slate-900 uppercase mb-2">¿Archivar Cliente?</h3>
                        <p className="text-xs text-slate-500 font-medium mb-6">
                            Estás a punto de archivar a <span className="font-bold text-slate-800">{deletingClient.name}</span>.
                            <br />El cliente desaparecerá de tu lista pero permanecerá en el sistema como histórico.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setDeletingClient(null)}
                                className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-black uppercase text-xs hover:bg-slate-200 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleArchiveClient}
                                className="flex-1 py-3 bg-red-600 text-white rounded-xl font-black uppercase text-xs shadow-lg shadow-red-200 hover:bg-red-700 transition-colors"
                            >
                                Archivar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL EDICIÓN CLIENTE */}
            {editingClient && (
                <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-10 sm:zoom-in duration-200">
                        <div className="p-5 border-b flex justify-between items-center bg-indigo-600 text-white">
                            <div>
                                <h3 className="text-lg font-black uppercase tracking-tight leading-none mb-1">Editar Cliente</h3>
                                <p className="text-[10px] font-mono opacity-80">{editingClient.id}</p>
                            </div>
                            <button onClick={() => { setEditingClient(null); resetForm(); }} className="p-2 bg-white/20 hover:bg-white/30 rounded-full transition-colors"><X className="w-5 h-5" /></button>
                        </div>

                        <div className="overflow-y-auto p-6 space-y-6">
                            {/* SECCIÓN CLIENTE */}
                            <div className="space-y-6 bg-gradient-to-br from-indigo-50/70 via-purple-50/40 to-pink-50/30 p-6 rounded-[2rem] border border-indigo-200/80 shadow-sm animate-in zoom-in-95">
                                <h3 className="text-sm font-black text-indigo-900 uppercase tracking-wider flex items-center justify-between w-full">
                                    <span className="flex items-center gap-2">
                                        <User className="w-4 h-4 text-indigo-600" /> DATOS DEL CLIENTE
                                    </span>
                                    {(() => {
                                        const pct = getClientFormProgress();
                                        const styles = getProgressStyles(pct);
                                        return (
                                            <span className={`flex items-center gap-2 border px-2 py-0.5 rounded-full text-[8.5px] font-black transition-colors ${styles.pill}`}>
                                                <span className={`w-20 h-1 rounded-full overflow-hidden block ${styles.barBg}`}>
                                                    <span className={`h-full block transition-all duration-300 ${styles.barFill}`} style={{ width: `${pct}%` }}></span>
                                                </span>
                                                {pct}%
                                            </span>
                                        );
                                    })()}
                                </h3>

                                <div className="space-y-4">
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-l-4 border-indigo-500 pl-3">Datos Generales</h4>
                                    <div className="space-y-3">
                                        <input type="text" value={clientName} onChange={e => setClientName(e.target.value.toUpperCase())} className="w-full p-4 border border-slate-200 rounded-2xl font-bold text-slate-900 bg-white placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow uppercase" placeholder="Nombre completo" />
                                        <input type="text" value={clientAddress} onChange={e => setClientAddress(e.target.value.toUpperCase())} className="w-full p-4 border border-slate-200 rounded-2xl font-bold text-slate-900 bg-white placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow uppercase" placeholder="Domicilio" />
                                        <div className="grid grid-cols-2 gap-3">
                                            <input type="number" inputMode="numeric" value={creditAmount} onChange={e => setCreditAmount(e.target.value)} className="w-full p-4 border border-slate-200 rounded-2xl font-bold text-slate-900 bg-white placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow" placeholder="Monto $" />
                                            <input type="tel" inputMode="numeric" pattern="[0-9]*" maxLength={10} value={cellphone} onChange={e => setCellphone(e.target.value.replace(/\D/g, ''))} className="w-full p-4 border border-slate-200 rounded-2xl font-bold text-slate-900 bg-white placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow" placeholder="Celular" />
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-l-4 border-green-500 pl-3 flex items-center gap-2">
                                        <Package className="w-4 h-4 text-green-500" /> GARANTIAS DEL CLIENTE ({guarantees.length})
                                    </h4>

                                    <div className="flex flex-col gap-3">
                                        <input
                                            type="text"
                                            value={newGuarantee}
                                            onChange={e => setNewGuarantee(e.target.value.toUpperCase())}
                                            onKeyDown={(e) => e.key === 'Enter' && handleAddGuarantee()}
                                            className="w-full p-4 border border-slate-200 rounded-2xl font-bold text-slate-900 bg-white placeholder-slate-400 focus:ring-2 focus:ring-green-500 outline-none transition-shadow uppercase text-sm"
                                            placeholder="Ej: TV Samsung 50 pulgadas"
                                        />
                                        <button
                                            onClick={handleAddGuarantee}
                                            className="w-full py-3 bg-green-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest shadow-md flex items-center justify-center gap-2 hover:bg-green-700 active:scale-95 transition-all"
                                        >
                                            <Plus className="w-4 h-4" /> Agregar Artículo
                                        </button>
                                    </div>

                                    <div className="space-y-2 mt-2">
                                        {guarantees.length === 0 ? (
                                            <p className="text-center text-[10px] text-slate-400 font-bold uppercase py-2 opacity-50 border-2 border-dashed border-slate-200 rounded-xl">
                                                Sin garantías registradas
                                            </p>
                                        ) : (
                                            guarantees.map((g, i) => (
                                                <div key={i} className="bg-white p-2 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center animate-in slide-in-from-bottom-1">
                                                    <span className="text-xs font-black text-slate-700 uppercase truncate">{g}</span>
                                                    <button
                                                        onClick={() => setGuarantees(guarantees.filter((_, idx) => idx !== i))}
                                                        className="p-2 text-red-500 rounded-lg hover:bg-red-55"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>

                                {supervisor.canEditPhotos && (requireFacade || requireClientPhoto) && (
                                    <div className="space-y-4">
                                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-l-4 border-indigo-500 pl-3">Fotografías del Cliente</h4>
                                        <div className="grid grid-cols-2 gap-3">
                                            {/* FACHADA CLIENTE */}
                                            {requireFacade && (
                                                <div className="space-y-2">
                                                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-1">Fachada</p>
                                                    <div className="aspect-square border-4 border-dashed border-slate-100 rounded-3xl flex items-center justify-center bg-white overflow-hidden cursor-pointer relative group" onClick={() => {
                                                        const el = document.getElementById('edit-facade-input');
                                                        if (el) (el as HTMLInputElement).click();
                                                    }}>
                                                        {facadePreview ? <img src={facadePreview} className="w-full h-full object-cover" /> : <div className="text-center p-4"><Home className="w-8 h-8 text-indigo-400 mx-auto mb-1" /><p className="text-[8px] font-black text-slate-400 uppercase">Tocar</p></div>}
                                                        <input id="edit-facade-input" type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => {
                                                            const file = e.target.files?.[0];
                                                            if (file) {
                                                                setFacadeFile(file);
                                                                setFacadePreview(URL.createObjectURL(file));
                                                            }
                                                        }} />
                                                    </div>
                                                </div>
                                            )}

                                            {/* FOTO CLIENTE */}
                                            {requireClientPhoto && (
                                                <div className="space-y-2">
                                                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-1">Foto Personal</p>
                                                    <div className="aspect-square border-4 border-dashed border-slate-100 rounded-3xl flex items-center justify-center bg-white overflow-hidden cursor-pointer relative group" onClick={() => {
                                                        const el = document.getElementById('edit-client-input');
                                                        if (el) (el as HTMLInputElement).click();
                                                    }}>
                                                        {clientPhotoPreview ? <img src={clientPhotoPreview} className="w-full h-full object-cover" /> : <div className="text-center p-4"><User className="w-8 h-8 text-indigo-400 mx-auto mb-1" /><p className="text-[8px] font-black text-slate-400 uppercase">Tocar</p></div>}
                                                        <input id="edit-client-input" type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => {
                                                            const file = e.target.files?.[0];
                                                            if (file) {
                                                                setClientPhotoFile(file);
                                                                setClientPhotoPreview(URL.createObjectURL(file));
                                                            }
                                                        }} />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-3">
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-l-4 border-amber-500 pl-3 flex items-center gap-2">
                                        <MessageSquare className="w-4 h-4 text-amber-500" /> Comentarios Extras (Opcional)
                                    </h4>
                                    <textarea
                                        value={clientComments}
                                        onChange={e => setClientComments(e.target.value.toUpperCase())}
                                        className="w-full p-4 border border-slate-200 rounded-2xl font-bold text-slate-900 bg-white placeholder-slate-400 focus:ring-2 focus:ring-amber-500 outline-none transition-shadow uppercase text-sm min-h-[80px]"
                                        placeholder="Ej: Trabaja en la zapatería del centro, portón café..."
                                    />
                                </div>
                            </div>

                            {/* SECCIÓN AVAL */}
                            <div className="space-y-6 bg-gradient-to-br from-blue-50/70 via-sky-50/40 to-indigo-50/30 p-6 rounded-[2rem] border border-blue-200/80 shadow-sm animate-in zoom-in-95">
                                <h3 className="text-sm font-black text-blue-900 uppercase tracking-wider flex items-center justify-between w-full">
                                    <span className="flex items-center gap-2">
                                        <User className="w-4 h-4 text-blue-600" /> DATOS DEL AVAL
                                    </span>
                                    {(() => {
                                        const pct = getAvalFormProgress();
                                        const styles = getProgressStyles(pct);
                                        return (
                                            <span className={`flex items-center gap-2 border px-2 py-0.5 rounded-full text-[8.5px] font-black transition-colors ${styles.pill}`}>
                                                <span className={`w-20 h-1 rounded-full overflow-hidden block ${styles.barBg}`}>
                                                    <span className={`h-full block transition-all duration-300 ${styles.barFill}`} style={{ width: `${pct}%` }}></span>
                                                </span>
                                                {pct}%
                                            </span>
                                        );
                                    })()}
                                </h3>

                                <div className="space-y-4">
                                    {/* AVAL 1 */}
                                    <div className="space-y-3 bg-white p-5 rounded-3xl border border-blue-100">
                                        <div className="flex items-center justify-between px-1">
                                            <p className="text-[9px] font-black text-blue-600 uppercase tracking-widest">Aval Principal</p>
                                            <label className="flex items-center gap-2 cursor-pointer group">
                                                <input
                                                    type="checkbox"
                                                    checked={aval1IsClient}
                                                    onChange={e => {
                                                        setAval1IsClient(e.target.checked);
                                                        if (!e.target.checked) setAval1SelectedClient(null);
                                                    }}
                                                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                                                />
                                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest group-hover:text-blue-600 transition-colors">¿Es cliente?</span>
                                            </label>
                                        </div>

                                        {aval1IsClient && (
                                            <div className="space-y-2 animate-in fade-in zoom-in-95 duration-200">
                                                <div className="relative">
                                                    <input
                                                        type="text"
                                                        value={aval1Search}
                                                        onChange={e => setAval1Search(e.target.value)}
                                                        className="w-full p-4 pl-10 border border-blue-200 rounded-2xl font-bold text-slate-900 bg-slate-50 placeholder-slate-400 focus:ring-2 focus:ring-blue-500 outline-none"
                                                        placeholder="Buscar cliente o aval..."
                                                    />
                                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                                </div>
                                                {aval1Search.length > 0 && (
                                                    <div className="max-h-[150px] overflow-y-auto border border-slate-100 rounded-2xl bg-white shadow-xl divide-y divide-slate-50 scrollbar-hide z-[10]">
                                                        {financieraGuarantorCandidates
                                                            .filter(c => c.name.toUpperCase().includes(aval1Search.toUpperCase()))
                                                            .map((c, idx) => (
                                                                <button
                                                                    key={idx}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setAval1SelectedClient({ id: 'AUTO', name: c.name, address: c.address, cellphone: c.cellphone, facadeUrl: c.facadeUrl, clientPhotoUrl: c.photoUrl } as any);
                                                                        setAvalName(c.name);
                                                                        setAvalAddress(c.address || '');
                                                                        setAvalCellphone(c.cellphone || '');
                                                                        if (c.facadeUrl) setAvalFacadePreview(c.facadeUrl);
                                                                        if (c.photoUrl) setAvalPhotoPreview(c.photoUrl);
                                                                        setAval1Search('');
                                                                    }}
                                                                    className="w-full p-3 text-left hover:bg-blue-50 transition-colors flex items-center justify-between group"
                                                                >
                                                                    <div className="flex flex-col">
                                                                        <span className="font-black text-slate-800 text-[10px] uppercase">{c.name}</span>
                                                                        <span className="text-[8px] text-slate-400 font-mono">{c.cellphone}</span>
                                                                    </div>
                                                                    <UserCheck className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition-colors" />
                                                                </button>
                                                            ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        <input type="text" value={avalName} onChange={e => setAvalName(e.target.value.toUpperCase())} className="w-full p-4 border border-slate-200 rounded-2xl font-bold text-slate-900 bg-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 outline-none uppercase" placeholder="Nombre completo" />
                                        <input type="text" value={avalAddress} onChange={e => setAvalAddress(e.target.value.toUpperCase())} className="w-full p-4 border border-slate-200 rounded-2xl font-bold text-slate-900 bg-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 outline-none uppercase" placeholder="Domicilio completo" />
                                        <input type="tel" inputMode="numeric" pattern="[0-9]*" maxLength={10} value={avalCellphone} onChange={e => setAvalCellphone(e.target.value.replace(/\D/g, ''))} className="w-full p-4 border border-slate-200 rounded-2xl font-bold text-slate-900 bg-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Celular" />

                                        {/* Garantías del Aval 1 */}
                                        <div className="space-y-3 pt-2 border-t border-slate-100">
                                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Garantías del Aval</p>
                                            <div className="flex flex-col gap-3">
                                                <input
                                                    type="text"
                                                    value={newAval1Guarantee}
                                                    onChange={e => setNewAval1Guarantee(e.target.value.toUpperCase())}
                                                    onKeyDown={(e) => e.key === 'Enter' && handleAddAval1Guarantee()}
                                                    className="w-full p-4 border border-slate-200 rounded-2xl font-bold text-slate-900 bg-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 outline-none transition-shadow uppercase text-sm"
                                                    placeholder="Ej: Moto Italika 125cc"
                                                />
                                                <button
                                                    onClick={handleAddAval1Guarantee}
                                                    className="w-full py-3 bg-blue-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest shadow-md flex items-center justify-center gap-2 hover:bg-blue-700 active:scale-95 transition-all"
                                                >
                                                    <Plus className="w-4 h-4" /> Agregar Artículo
                                                </button>
                                            </div>
                                            <div className="space-y-2 mt-2">
                                                {aval1Guarantees.length === 0 ? (
                                                    <p className="text-center text-[10px] text-slate-400 font-bold uppercase py-2 opacity-50 border-2 border-dashed border-slate-200 rounded-xl">Sin garantías registradas</p>
                                                ) : (
                                                    aval1Guarantees.map((g, i) => (
                                                        <div key={i} className="bg-white p-2 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center">
                                                            <span className="text-xs font-black text-slate-700 uppercase truncate">{g}</span>
                                                            <button onClick={() => setAval1Guarantees(aval1Guarantees.filter((_, idx) => idx !== i))} className="p-2 text-red-500 rounded-lg hover:bg-red-55"><Trash2 className="w-4 h-4" /></button>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* AVAL 2 */}
                                    {requiredAvales >= 2 && (
                                        <div className="space-y-3 bg-white p-5 rounded-3xl border border-blue-100 animate-in slide-in-from-top-2">
                                            <div className="flex items-center justify-between px-1">
                                                <p className="text-[9px] font-black text-blue-600 uppercase tracking-widest">Segundo Aval (Requerido)</p>
                                                <label className="flex items-center gap-2 cursor-pointer group">
                                                    <input
                                                        type="checkbox"
                                                        checked={aval2IsClient}
                                                        onChange={e => {
                                                            setAval2IsClient(e.target.checked);
                                                            if (!e.target.checked) setAval2SelectedClient(null);
                                                        }}
                                                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-blue-200"
                                                    />
                                                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest group-hover:text-blue-600 transition-colors">¿Es cliente?</span>
                                                </label>
                                            </div>

                                            {aval2IsClient && (
                                                <div className="space-y-2 animate-in fade-in zoom-in-95 duration-200">
                                                    <div className="relative">
                                                        <input
                                                            type="text"
                                                            value={aval2Search}
                                                            onChange={e => setAval2Search(e.target.value)}
                                                            className="w-full p-4 pl-10 border border-blue-200 rounded-2xl font-bold text-slate-900 bg-slate-50 placeholder-slate-400 focus:ring-2 focus:ring-blue-500 outline-none"
                                                            placeholder="Buscar cliente o aval..."
                                                        />
                                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                                    </div>
                                                    {aval2Search.length > 0 && (
                                                        <div className="max-h-[150px] overflow-y-auto border border-slate-100 rounded-2xl bg-white shadow-xl divide-y divide-slate-50 scrollbar-hide z-[10]">
                                                            {financieraGuarantorCandidates
                                                                .filter(c => c.name.toUpperCase().includes(aval2Search.toUpperCase()))
                                                                .map((c, idx) => (
                                                                    <button
                                                                        key={idx}
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setAval2SelectedClient({ id: 'AUTO', name: c.name, address: c.address, cellphone: c.cellphone, facadeUrl: c.facadeUrl, clientPhotoUrl: c.photoUrl } as any);
                                                                            setAval2Name(c.name);
                                                                            setAval2Address(c.address || '');
                                                                            setAval2Cellphone(c.cellphone || '');
                                                                            setAval2Search('');
                                                                        }}
                                                                        className="w-full p-3 text-left hover:bg-blue-50 transition-colors flex items-center justify-between group"
                                                                    >
                                                                        <div className="flex flex-col">
                                                                            <span className="font-black text-slate-800 text-[10px] uppercase">{c.name}</span>
                                                                            <span className="text-[8px] text-slate-400 font-mono">{c.cellphone}</span>
                                                                        </div>
                                                                        <UserCheck className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition-colors" />
                                                                    </button>
                                                                ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            <input type="text" value={aval2Name} onChange={e => { setAval2Name(e.target.value.toUpperCase()); if (aval2IsClient) setAval2IsClient(false); }} className="w-full p-4 border border-blue-200 rounded-2xl font-bold text-slate-900 bg-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 outline-none uppercase" placeholder="Nombre completo" />
                                            <input type="text" value={aval2Address} onChange={e => { setAval2Address(e.target.value.toUpperCase()); if (aval2IsClient) setAval2IsClient(false); }} className="w-full p-4 border border-blue-200 rounded-2xl font-bold text-slate-900 bg-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 outline-none uppercase" placeholder="Domicilio completo" />
                                            <input type="tel" inputMode="numeric" pattern="[0-9]*" maxLength={10} value={aval2Cellphone} onChange={e => { setAval2Cellphone(e.target.value.replace(/\D/g, '')); if (aval2IsClient) setAval2IsClient(false); }} className="w-full p-4 border border-blue-200 rounded-2xl font-bold text-slate-900 bg-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Celular" />

                                            {/* Garantías del Aval 2 */}
                                            <div className="space-y-3 pt-2 border-t border-slate-100">
                                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Garantías del Aval 2</p>
                                                <div className="flex flex-col gap-3">
                                                    <input
                                                        type="text"
                                                        value={newAval2Guarantee}
                                                        onChange={e => setNewAval2Guarantee(e.target.value.toUpperCase())}
                                                        onKeyDown={(e) => e.key === 'Enter' && handleAddAval2Guarantee()}
                                                        className="w-full p-4 border border-slate-200 rounded-2xl font-bold text-slate-900 bg-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 outline-none transition-shadow uppercase text-sm"
                                                        placeholder="Garantía de Aval 2"
                                                    />
                                                    <button onClick={handleAddAval2Guarantee} className="w-full py-3 bg-blue-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest shadow-md flex items-center justify-center gap-2 hover:bg-blue-700 active:scale-95 transition-all">
                                                        <Plus className="w-4 h-4" /> Agregar Artículo
                                                    </button>
                                                </div>
                                                <div className="space-y-2 mt-2">
                                                    {aval2Guarantees.length === 0 ? (
                                                        <p className="text-center text-[10px] text-slate-400 font-bold uppercase py-2 opacity-50 border-2 border-dashed border-slate-200 rounded-xl">Sin garantías registradas</p>
                                                    ) : (
                                                        aval2Guarantees.map((g, i) => (
                                                            <div key={i} className="bg-white p-2 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center">
                                                                <span className="text-xs font-black text-slate-700 uppercase truncate">{g}</span>
                                                                <button onClick={() => setAval2Guarantees(aval2Guarantees.filter((_, idx) => idx !== i))} className="p-2 text-red-500 rounded-lg hover:bg-red-55"><Trash2 className="w-4 h-4" /></button>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* AVAL 3 */}
                                    {requiredAvales >= 3 && (
                                        <div className="space-y-3 bg-white p-5 rounded-3xl border border-blue-100 animate-in slide-in-from-top-2">
                                            <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Tercer Aval (Requerido)</p>
                                            <input type="text" value={aval3Name} onChange={e => setAval3Name(e.target.value.toUpperCase())} className="w-full p-4 border border-slate-200 rounded-2xl font-bold text-slate-900 bg-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 outline-none uppercase" placeholder="Nombre completo" />
                                            <input type="text" value={aval3Address} onChange={e => setAval3Address(e.target.value.toUpperCase())} className="w-full p-4 border border-slate-200 rounded-2xl font-bold text-slate-900 bg-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 outline-none uppercase" placeholder="Domicilio completo" />
                                            <input type="tel" inputMode="numeric" pattern="[0-9]*" maxLength={10} value={aval3Cellphone} onChange={e => setAval3Cellphone(e.target.value.replace(/\D/g, ''))} className="w-full p-4 border border-slate-200 rounded-2xl font-bold text-slate-900 bg-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Celular" />

                                            {/* Garantías del Aval 3 */}
                                            <div className="space-y-3 pt-2 border-t border-slate-100">
                                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Garantías del Aval 3</p>
                                                <div className="flex flex-col gap-3">
                                                    <input
                                                        type="text"
                                                        value={newAval3Guarantee}
                                                        onChange={e => setNewAval3Guarantee(e.target.value.toUpperCase())}
                                                        onKeyDown={(e) => e.key === 'Enter' && handleAddAval3Guarantee()}
                                                        className="w-full p-4 border border-slate-200 rounded-2xl font-bold text-slate-900 bg-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 outline-none transition-shadow uppercase text-sm"
                                                        placeholder="Garantía de Aval 3"
                                                    />
                                                    <button onClick={handleAddAval3Guarantee} className="w-full py-3 bg-blue-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest shadow-md flex items-center justify-center gap-2 hover:bg-blue-700 active:scale-95 transition-all">
                                                        <Plus className="w-4 h-4" /> Agregar Artículo
                                                    </button>
                                                </div>
                                                <div className="space-y-2 mt-2">
                                                    {aval3Guarantees.length === 0 ? (
                                                        <p className="text-center text-[10px] text-slate-400 font-bold uppercase py-2 opacity-50 border-2 border-dashed border-slate-200 rounded-xl">Sin garantías registradas</p>
                                                    ) : (
                                                        aval3Guarantees.map((g, i) => (
                                                            <div key={i} className="bg-white p-2 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center">
                                                                <span className="text-xs font-black text-slate-700 uppercase truncate">{g}</span>
                                                                <button onClick={() => setAval3Guarantees(aval3Guarantees.filter((_, idx) => idx !== i))} className="p-2 text-red-500 rounded-lg hover:bg-red-55"><Trash2 className="w-4 h-4" /></button>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {supervisor.canEditPhotos && (requireGuarantorFacade || requireGuarantorPhoto) && (
                                    <div className="space-y-4 bg-white p-5 rounded-3xl border border-blue-100">
                                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-l-4 border-emerald-500 pl-3">Fotografías del Aval</h4>
                                        <div className="grid grid-cols-2 gap-3">
                                            {/* FACHADA AVAL */}
                                            {requireGuarantorFacade && (
                                                <div className="space-y-2">
                                                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-1">Fachada</p>
                                                    <div className="aspect-square border-4 border-dashed border-slate-100 rounded-3xl flex items-center justify-center bg-white overflow-hidden cursor-pointer relative group" onClick={() => {
                                                        const el = document.getElementById('edit-aval-facade-input');
                                                        if (el) (el as HTMLInputElement).click();
                                                    }}>
                                                        {avalFacadePreview ? <img src={avalFacadePreview} className="w-full h-full object-cover" /> : <div className="text-center p-4"><Home className="w-8 h-8 text-blue-400 mx-auto mb-1" /><p className="text-[8px] font-black text-slate-400 uppercase">Tocar</p></div>}
                                                        <input id="edit-aval-facade-input" type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => {
                                                            const file = e.target.files?.[0];
                                                            if (file) {
                                                                setAvalFacadeFile(file);
                                                                setAvalFacadePreview(URL.createObjectURL(file));
                                                            }
                                                        }} />
                                                    </div>
                                                </div>
                                            )}

                                            {/* FOTO AVAL */}
                                            {requireGuarantorPhoto && (
                                                <div className="space-y-2">
                                                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-1">Foto Personal</p>
                                                    <div className="aspect-square border-4 border-dashed border-slate-100 rounded-3xl flex items-center justify-center bg-white overflow-hidden cursor-pointer relative group" onClick={() => {
                                                        const el = document.getElementById('edit-aval-person-input');
                                                        if (el) (el as HTMLInputElement).click();
                                                    }}>
                                                        {avalPhotoPreview ? <img src={avalPhotoPreview} className="w-full h-full object-cover" /> : <div className="text-center p-4"><User className="w-8 h-8 text-blue-400 mx-auto mb-1" /><p className="text-[8px] font-black text-slate-400 uppercase">Tocar</p></div>}
                                                        <input id="edit-aval-person-input" type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => {
                                                            const file = e.target.files?.[0];
                                                            if (file) {
                                                                setAvalPhotoFile(file);
                                                                setAvalPhotoPreview(URL.createObjectURL(file));
                                                            }
                                                        }} />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <button
                                disabled={isUploading}
                                onClick={handleUpdateClientData}
                                className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-2xl shadow-indigo-100 flex items-center justify-center gap-3 transition-all active:scale-95 disabled:opacity-50"
                            >
                                {isUploading ? <Loader2 className="animate-spin w-5 h-5" /> : <Check className="w-5 h-5" />}
                                Guardar Cambios
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL HISTORIAL Y DETALLES DEL CLIENTE (SUPERVISOR) - COMPACTO */}
            <AnimatePresence>
                {selectedClientHistory && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 backdrop-blur-sm"
                    >
                        <motion.div
                            initial={{ y: "100%" }}
                            animate={{ y: 0 }}
                            exit={{ y: "100%" }}
                            transition={{ type: "spring", damping: 25, stiffness: 200 }}
                            className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
                        >
                            {/* Header Compacto */}
                            <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-md">
                                        <User className="w-5 h-5" />
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight truncate max-w-[200px]">
                                            {selectedClientHistory.name}
                                        </h3>
                                        <p className="text-[9px] font-bold text-slate-400 font-mono tracking-tighter uppercase flex items-center gap-1">
                                            <Hash className="w-2.5 h-2.5" /> {selectedClientHistory.id.slice(-8)}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    {supervisor.canEditClients && (
                                        <button
                                            onClick={() => openEditModal(selectedClientHistory)}
                                            className="p-2 text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
                                        >
                                            <Pencil className="w-4 h-4" />
                                        </button>
                                    )}
                                    <button onClick={() => setSelectedClientHistory(null)} className="p-2 text-slate-400 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            <div className="overflow-y-auto flex-1 p-4 space-y-4">
                                {/* SECCIÓN CLIENTE */}
                                <div className="space-y-4 bg-gradient-to-br from-indigo-50/70 via-purple-50/40 to-pink-50/30 p-5 rounded-[2rem] border border-indigo-200/80 shadow-sm">
                                    <h3 className="text-xs font-black text-indigo-900 uppercase tracking-wider flex items-center justify-between w-full border-b border-indigo-100 pb-2">
                                        <span className="flex items-center gap-1.5">
                                            <User className="w-4 h-4 text-indigo-600" /> DATOS DEL CLIENTE
                                        </span>
                                        {(() => {
                                            const pct = getClientDetailProgress(selectedClientHistory);
                                            const styles = getProgressStyles(pct);
                                            return (
                                                <span className={`flex items-center gap-2 border px-2 py-0.5 rounded-full text-[8px] font-black transition-colors ${styles.pill}`}>
                                                    <span className={`w-20 h-1 rounded-full overflow-hidden block ${styles.barBg}`}>
                                                        <span className={`h-full block transition-all duration-300 ${styles.barFill}`} style={{ width: `${pct}%` }}></span>
                                                    </span>
                                                    {pct}%
                                                </span>
                                            );
                                        })()}
                                    </h3>

                                    {/* Quick Data Grid */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="p-3 bg-white/80 backdrop-blur-sm rounded-xl border border-indigo-100 flex flex-col">
                                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1"><DollarSign className="w-2.5 h-2.5 text-indigo-500" /> Crédito</span>
                                            <span className="text-sm font-black text-slate-900">${selectedClientHistory.creditAmount}</span>
                                        </div>
                                        <div className="p-3 bg-white/80 backdrop-blur-sm rounded-xl border border-indigo-100 flex flex-col">
                                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1"><Smartphone className="w-2.5 h-2.5 text-indigo-500" /> Celular</span>
                                            {selectedClientHistory.cellphone ? (
                                                <a href={`tel:${selectedClientHistory.cellphone}`} className="text-sm font-black text-indigo-600 hover:underline truncate">
                                                    {selectedClientHistory.cellphone}
                                                </a>
                                            ) : (
                                                <span className="text-sm font-black text-slate-900 truncate">N/A</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Domicilio Section */}
                                    <div className="space-y-1">
                                        <div className="flex items-center justify-between px-1">
                                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><MapPin className="w-2.5 h-2.5 text-indigo-500" /> Domicilio</p>
                                            {selectedClientHistory.latitude && (
                                                <a
                                                    href={`https://www.google.com/maps/search/?api=1&query=${selectedClientHistory.latitude},${selectedClientHistory.longitude}`}
                                                    target="_blank"
                                                    className="text-[8px] font-black text-indigo-600 uppercase hover:underline"
                                                >
                                                    Ver en GPS
                                                </a>
                                            )}
                                        </div>
                                        <div className="p-3 bg-white/80 backdrop-blur-sm border border-indigo-100 rounded-xl">
                                            <p className="text-[11px] font-bold text-slate-700 uppercase leading-relaxed">
                                                {selectedClientHistory.address || 'SIN REGISTRO'}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Inventory Section */}
                                    <div className="space-y-1">
                                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 px-1"><Package className="w-2.5 h-2.5 text-green-500" /> Garantías ({selectedClientHistory.guarantees?.length || 0})</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {selectedClientHistory.guarantees?.length === 0 ? (
                                                <span className="text-[9px] text-slate-400 italic px-1">Sin garantías</span>
                                            ) : (
                                                selectedClientHistory.guarantees?.map((g, gi) => (
                                                    <span key={gi} className="px-2 py-0.5 bg-emerald-50 border border-emerald-100 text-[9px] font-bold text-emerald-700 rounded-md uppercase tracking-tight">
                                                        {g.description}
                                                    </span>
                                                ))
                                            )}
                                        </div>
                                    </div>

                                    {/* Media Section: Photos in 2 columns */}
                                    {(requireFacade || requireClientPhoto) && (
                                        <div className="grid grid-cols-2 gap-3">
                                            {requireFacade && (
                                                <div className="space-y-1.5">
                                                    <div className="flex justify-between items-center px-1">
                                                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Fachada</p>
                                                        {supervisor.canEditPhotos && (
                                                            <label className="cursor-pointer text-[8px] font-black text-indigo-600 uppercase">
                                                                Editar
                                                                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && handleUpdatePhoto(selectedClientHistory.id, 'facadeUrl', e.target.files[0])} />
                                                            </label>
                                                        )}
                                                    </div>
                                                    <div
                                                        className="aspect-video rounded-xl overflow-hidden border border-indigo-100 bg-white/80 backdrop-blur-sm cursor-pointer relative"
                                                        onClick={() => setFullPhotoUrl(selectedClientHistory.facadeUrl || null)}
                                                    >
                                                        {isUploading && <div className="absolute inset-0 bg-white/60 z-10 flex items-center justify-center"><Loader2 className="w-4 h-4 animate-spin text-indigo-600" /></div>}
                                                        {selectedClientHistory.facadeUrl ? (
                                                            <CachedImage src={selectedClientHistory.facadeUrl} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-slate-300"><Home className="w-6 h-6" /></div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                            {requireClientPhoto && (
                                                <div className="space-y-1.5">
                                                    <div className="flex justify-between items-center px-1">
                                                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Cliente</p>
                                                        {supervisor.canEditPhotos && (
                                                            <label className="cursor-pointer text-[8px] font-black text-indigo-600 uppercase">
                                                                Editar
                                                                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && handleUpdatePhoto(selectedClientHistory.id, 'clientPhotoUrl', e.target.files[0])} />
                                                            </label>
                                                        )}
                                                    </div>
                                                    <div
                                                        className="aspect-video rounded-xl overflow-hidden border border-indigo-100 bg-white/80 backdrop-blur-sm cursor-pointer relative"
                                                        onClick={() => setFullPhotoUrl(selectedClientHistory.clientPhotoUrl || null)}
                                                    >
                                                        {isUploading && <div className="absolute inset-0 bg-white/60 z-10 flex items-center justify-center"><Loader2 className="w-4 h-4 animate-spin text-indigo-600" /></div>}
                                                        {selectedClientHistory.clientPhotoUrl ? (
                                                            <CachedImage src={selectedClientHistory.clientPhotoUrl} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-slate-300"><User className="w-6 h-6" /></div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Comments Display & Action */}
                                    <div className="space-y-2 pt-2 border-t border-indigo-100/40">
                                        <div className="flex justify-between items-center px-1">
                                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><MessageSquare className="w-2.5 h-2.5 text-amber-500" /> Comentarios Extras</p>
                                            <button
                                                onClick={() => { setClientComments(selectedClientHistory.comments || ''); setShowCommentsModal(selectedClientHistory); }}
                                                className="text-[8px] font-black text-indigo-600 uppercase hover:underline"
                                            >
                                                Editar
                                            </button>
                                        </div>
                                        {selectedClientHistory.comments ? (
                                            <div className="p-3 bg-amber-50/50 rounded-xl border border-dashed border-amber-200">
                                                <p className="text-[10px] font-bold text-amber-900 uppercase leading-relaxed">
                                                    "{selectedClientHistory.comments}"
                                                </p>
                                            </div>
                                        ) : (
                                            <p className="text-[9px] text-slate-400 italic px-1">Sin comentarios</p>
                                        )}
                                    </div>
                                </div>

                                {/* SECCIÓN AVAL */}
                                <div className="space-y-4 bg-gradient-to-br from-blue-50/70 via-sky-50/40 to-indigo-50/30 p-5 rounded-[2rem] border border-blue-200/80 shadow-sm">
                                    <h3 className="text-xs font-black text-blue-900 uppercase tracking-wider flex items-center justify-between w-full border-b border-blue-100 pb-2">
                                        <span className="flex items-center gap-1.5">
                                            <Users className="w-4 h-4 text-blue-600" /> DATOS DEL AVAL
                                        </span>
                                        {(() => {
                                            const pct = getAvalDetailProgress(selectedClientHistory);
                                            const styles = getProgressStyles(pct);
                                            return (
                                                <span className={`flex items-center gap-2 border px-2 py-0.5 rounded-full text-[8px] font-black transition-colors ${styles.pill}`}>
                                                    <span className={`w-20 h-1 rounded-full overflow-hidden block ${styles.barBg}`}>
                                                        <span className={`h-full block transition-all duration-300 ${styles.barFill}`} style={{ width: `${pct}%` }}></span>
                                                    </span>
                                                    {pct}%
                                                </span>
                                            );
                                        })()}
                                    </h3>

                                    <div className="space-y-3">
                                        {(selectedClientHistory.avales && selectedClientHistory.avales.length > 0
                                            ? selectedClientHistory.avales
                                            : [{
                                                name: selectedClientHistory.avalName,
                                                address: selectedClientHistory.avalAddress,
                                                cellphone: selectedClientHistory.avalCellphone,
                                                facadeUrl: selectedClientHistory.avalFacadeUrl,
                                                photoUrl: selectedClientHistory.avalPhotoUrl,
                                                latitude: selectedClientHistory.avalLatitude,
                                                longitude: selectedClientHistory.avalLongitude,
                                                visitTimestamp: selectedClientHistory.avalVisitTimestamp,
                                                guarantees: []
                                            }]
                                        ).map((aval, idx) => (
                                            <div key={idx} className="p-4 bg-white/85 backdrop-blur-sm border border-blue-100 rounded-xl space-y-4 shadow-sm">
                                                <div className="flex justify-between items-start border-b border-blue-100 pb-2">
                                                    <div className="min-w-0 pr-2">
                                                        <p className="text-[11px] font-black text-slate-900 uppercase truncate mb-0.5">{aval.name || 'NO REGISTRADO'}</p>
                                                        <div className="flex items-center gap-2">
                                                            {aval.cellphone ? (
                                                                <a href={`tel:${aval.cellphone}`} className="text-[9px] font-black text-blue-600 bg-blue-50 hover:bg-blue-100 px-1.5 py-0.5 rounded uppercase transition-colors">
                                                                    {aval.cellphone}
                                                                </a>
                                                            ) : (
                                                                <span className="text-[9px] font-bold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded uppercase">S/N</span>
                                                            )}
                                                            {aval.visitTimestamp && <span className="text-[8px] font-black text-emerald-600 flex items-center gap-0.5"><CheckCircle className="w-2.5 h-2.5" /> VERIFICADO</span>}
                                                        </div>
                                                    </div>
                                                    {aval.latitude && (
                                                        <a
                                                            href={`https://www.google.com/maps/search/?api=1&query=${aval.latitude},${aval.longitude}`}
                                                            target="_blank"
                                                            className="p-2 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors border border-blue-100"
                                                        >
                                                            <Navigation className="w-3.5 h-3.5" />
                                                        </a>
                                                    )}
                                                </div>

                                                {/* Aval Address */}
                                                <div className="space-y-1">
                                                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 px-1"><MapPin className="w-2.5 h-2.5 text-blue-500" /> Domicilio</p>
                                                    <div className="p-3 bg-white/80 backdrop-blur-sm border border-blue-100 rounded-xl">
                                                        <p className="text-[10px] font-bold text-slate-700 uppercase leading-relaxed">
                                                            {aval.address || 'SIN REGISTRO'}
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Aval Guarantees */}
                                                <div className="space-y-1">
                                                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 px-1"><Package className="w-2.5 h-2.5 text-green-500" /> Garantías ({aval.guarantees?.length || 0})</p>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {!aval.guarantees || aval.guarantees.length === 0 ? (
                                                            <span className="text-[9px] text-slate-400 italic px-1">Sin garantías</span>
                                                        ) : (
                                                            aval.guarantees.map((g, gi) => (
                                                                <span key={gi} className="px-2 py-0.5 bg-emerald-50 border border-emerald-100 text-[9px] font-bold text-emerald-700 rounded-md uppercase tracking-tight">
                                                                    {typeof g === 'string' ? g : (g?.description || '')}
                                                                </span>
                                                            ))
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Photos in 2 columns for Aval */}
                                                {(aval.facadeUrl || aval.photoUrl) && (
                                                    <div className="grid grid-cols-2 gap-3 pt-2">
                                                        {aval.facadeUrl && (
                                                            <div className="space-y-1.5">
                                                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest px-1">Fachada</p>
                                                                <div
                                                                    className="aspect-video rounded-xl overflow-hidden border border-blue-100 bg-white/80 backdrop-blur-sm cursor-pointer"
                                                                    onClick={() => setFullPhotoUrl(aval.facadeUrl || null)}
                                                                >
                                                                    <CachedImage src={aval.facadeUrl} className="w-full h-full object-cover" />
                                                                </div>
                                                            </div>
                                                        )}
                                                        {aval.photoUrl && (
                                                            <div className="space-y-1.5">
                                                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest px-1">Persona</p>
                                                                <div
                                                                    className="aspect-video rounded-xl overflow-hidden border border-blue-100 bg-white/80 backdrop-blur-sm cursor-pointer"
                                                                    onClick={() => setFullPhotoUrl(aval.photoUrl || null)}
                                                                >
                                                                    <CachedImage src={aval.photoUrl} className="w-full h-full object-cover" />
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Historial Section */}
                                <div className="space-y-3 pt-2 border-t border-slate-100">
                                    <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 px-1"><History className="w-3 h-3 text-indigo-500" /> Historial de Visitas</h4>
                                    <div className="space-y-2">
                                        {visits
                                            .filter(v => v.clientId === selectedClientHistory.id)
                                            .sort((a, b) => b.timestamp - a.timestamp)
                                            .slice(0, 5)
                                            .map((v) => (
                                                <div key={v.id} className="p-2.5 bg-slate-50 border border-slate-100 rounded-lg flex items-center justify-between">
                                                    <div className="min-w-0 pr-3">
                                                        <p className="text-[9px] font-black text-slate-900 uppercase truncate">{getWeekName(v.weekId)}</p>
                                                        <p className="text-[8px] font-bold text-slate-400 uppercase">{new Date(v.timestamp).toLocaleDateString()} {new Date(v.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {v.isRenewal && <span className="text-[7px] font-black px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded border border-amber-200">RENOVACIÓN</span>}
                                                        <a
                                                            href={`https://www.google.com/maps/search/?api=1&query=${v.latitude},${v.longitude}`}
                                                            target="_blank"
                                                            className="p-1.5 bg-white border border-slate-100 rounded-md text-slate-400 hover:text-indigo-600"
                                                        >
                                                            <Navigation className="w-3 h-3" />
                                                        </a>
                                                    </div>
                                                </div>
                                            ))}
                                        {visits.filter(v => v.clientId === selectedClientHistory.id).length === 0 && (
                                            <p className="text-[9px] font-bold text-slate-300 italic py-2 pr-4">Sin visitas registradas aún.</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* MODAL FOTO COMPLETA */}
            {fullPhotoUrl && (
                <div
                    className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 p-4 backdrop-blur-md animate-in fade-in duration-200"
                    onClick={() => setFullPhotoUrl(null)}
                >
                    <button
                        className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
                        onClick={() => setFullPhotoUrl(null)}
                    >
                        <X className="w-6 h-6" />
                    </button>
                    <CachedImage
                        src={fullPhotoUrl}
                        className="max-w-full max-h-full object-contain rounded-lg shadow-2xl animate-in zoom-in-95 duration-300"
                    />
                </div>
            )}

            {/* MODAL BIENVENIDA NUEVO CICLO */}
            <AnimatePresence>
                {showCycleModal && currentWeek && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 10 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.95, y: 10 }}
                            className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-100 p-6 space-y-6"
                        >
                            <div className="text-center space-y-2">
                                <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto text-indigo-600 mb-2">
                                    <Calendar className="w-6 h-6" />
                                </div>

                                <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest block">
                                    Ciclo Activo
                                </span>
                                <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">
                                    {currentWeek.name}
                                </h3>

                                <span className="text-[11px] font-bold text-slate-400 block pt-1">
                                    {getFormattedTodayDate()}
                                </span>
                            </div>

                            <button
                                onClick={() => setShowCycleModal(false)}
                                className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg shadow-indigo-100 transition-all active:scale-95 flex items-center justify-center gap-2"
                            >
                                Entendido
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};