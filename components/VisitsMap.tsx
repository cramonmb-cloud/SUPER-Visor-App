import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Client, Visit, Supervisor, Financiera } from '../types';

interface VisitsMapProps {
  clients: Client[];
  visits: Visit[];
  supervisors: Supervisor[];
  financieras: Financiera[];
  onClientClick: (client: Client) => void;
}

// Map of supervisor ID to specific color
const SUPERVISOR_COLORS = [
  '#4f46e5', // Indigo
  '#ef4444', // Red
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#111827', // Black/Slate
];

const getSupervisorColor = (supId: string, supervisors: Supervisor[]) => {
  const index = supervisors.findIndex(s => s.id === supId);
  if (index === -1) return '#64748b'; // Default gray
  return SUPERVISOR_COLORS[index % SUPERVISOR_COLORS.length];
};

const createColoredMarker = (color: string) => {
    // SVG de un Pin de Mapa Clásico (Teardrop) con el color del supervisor
    const svgIcon = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="40" height="40" fill="${color}" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 3px 3px rgba(0,0,0,0.3));">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
        <circle cx="12" cy="10" r="3" fill="white"></circle>
      </svg>
    `;

    return L.divIcon({
        className: 'custom-pin-icon', // Clase vacía para evitar estilos default de Leaflet cuadrados
        html: svgIcon,
        iconSize: [40, 40], // Tamaño del contenedor
        iconAnchor: [20, 40], // El punto de anclaje es la punta inferior (Centro X, Fondo Y)
        popupAnchor: [0, -40] // El popup sale arriba del pin
    });
};

export const VisitsMap: React.FC<VisitsMapProps> = ({ clients, visits, supervisors, financieras, onClientClick }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      mapInstanceRef.current = L.map(mapContainerRef.current).setView([23.6345, -102.5528], 5);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(mapInstanceRef.current);
    }

    // Force map resize calculation to prevent grey areas
    const timer = setTimeout(() => {
        mapInstanceRef.current?.invalidateSize();
    }, 250);

    return () => clearTimeout(timer);
  }, []);

  // Update Markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Force resize again when data changes (e.g. tab switch might have happened)
    map.invalidateSize();

    // Clear existing markers
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker) {
        map.removeLayer(layer);
      }
    });

    const markers: L.Marker[] = [];
    const bounds = L.latLngBounds([]);

    // Prioritize showing points where VISITS happened in the filtered dataset
    // then show clients who might not have visits yet in this filter but belong to the supervisor
    clients.forEach(client => {
      const clientVisits = visits
        .filter(v => v.clientId === client.id)
        .sort((a, b) => b.timestamp - a.timestamp);
      
      const lastVisit = clientVisits[0];
      // Ensure lat/lng are valid numbers
      const lat = (lastVisit && typeof lastVisit.latitude === 'number') ? lastVisit.latitude : client.latitude;
      const lng = (lastVisit && typeof lastVisit.longitude === 'number') ? lastVisit.longitude : client.longitude;

      if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
        const supervisor = supervisors.find(s => s.id === client.supervisorId);
        const color = getSupervisorColor(client.supervisorId, supervisors);
        
        // Create custom icon
        const icon = L.divIcon({
            className: '', // Empty class to avoid default styles
            html: `
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="40" height="40" fill="${color}" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 3px 3px rgba(0,0,0,0.3));">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                <circle cx="12" cy="10" r="3" fill="white"></circle>
              </svg>
            `,
            iconSize: [40, 40],
            iconAnchor: [20, 40],
            popupAnchor: [0, -40]
        });

        const marker = L.marker([lat, lng], { icon });
        
        const financierName = financieras.find(f => f.id === client.financieraId)?.name || 'SIN FINANCIERA';
        const photoHtml = `
            <div style="display: flex; gap: 4px; margin-bottom: 8px;">
                ${client.clientPhotoUrl ? `
                    <div style="flex: 1; height: 80px; border-radius: 8px; overflow: hidden; background: #f8fafc; border: 1px solid #e2e8f0;">
                        <img src="${client.clientPhotoUrl}" style="width: 100%; height: 100%; object-fit: cover;" referrerpolicy="no-referrer" />
                        <div style="position: absolute; bottom: 0; left: 0; right: 0; background: rgba(0,0,0,0.5); color: white; font-size: 7px; padding: 2px; text-align: center;">CLIENTE</div>
                    </div>
                ` : ''}
                ${client.facadeUrl ? `
                    <div style="flex: 1; height: 80px; border-radius: 8px; overflow: hidden; background: #f8fafc; border: 1px solid #e2e8f0;">
                        <img src="${client.facadeUrl}" style="width: 100%; height: 100%; object-fit: cover;" referrerpolicy="no-referrer" />
                        <div style="position: absolute; bottom: 0; left: 0; right: 0; background: rgba(0,0,0,0.5); color: white; font-size: 7px; padding: 2px; text-align: center;">FACHADA</div>
                    </div>
                ` : ''}
                ${(!client.clientPhotoUrl && !client.facadeUrl) ? `
                    <div style="width: 100%; height: 60px; border-radius: 8px; background: #f1f5f9; display: flex; align-items: center; justify-content: center; color: #94a3b8; font-size: 9px; font-weight: bold;">SIN FOTOS</div>
                ` : ''}
            </div>
        `;

        marker.bindTooltip(`
          <div style="font-family: sans-serif; text-align: center; min-width: 160px; padding: 4px;">
            ${photoHtml}
            <strong style="text-transform: uppercase; color: ${color}; font-size: 11px; display: block; margin-bottom: 2px;">${client.name}</strong>
            <span style="font-size: 10px; color: #64748b; font-weight: 800; text-transform: uppercase; margin-bottom: 4px; display: block;">${financierName}</span>
            <div style="height: 1px; background: #f1f5f9; margin: 6px 0;"></div>
            <div style="text-align: left; background: #f8fafc; padding: 6px; rounded: 6px; border: 1px solid #f1f5f9;">
                <p style="font-size: 9px; color: #64748b; margin: 0; font-weight: bold; text-transform: uppercase;">Supervisor</p>
                <p style="font-size: 10px; color: #1e293b; margin: 0; font-weight: 800; text-transform: uppercase;">${supervisor?.name || 'Desconocido'}</p>
            </div>
            <div style="margin-top: 6px; display: flex; align-items: center; justify-content: center; gap: 4px;">
                <span style="font-size: 9px; font-weight: 800; text-transform: uppercase; color: ${lastVisit ? '#4f46e5' : '#94a3b8'}">
                    ${lastVisit ? 'Última visita: ' + new Date(lastVisit.timestamp).toLocaleDateString() : 'Solo Registro'}
                </span>
            </div>
          </div>
        `, { direction: 'top', offset: [0, -35], opacity: 1 });

        marker.on('click', () => onClientClick(client));
        marker.addTo(map);
        markers.push(marker);
        bounds.extend([lat, lng]);
      }
    });

    if (markers.length > 0) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    }
  }, [clients, visits, supervisors, onClientClick]);

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden border border-slate-200 shadow-sm z-0">
      <div ref={mapContainerRef} className="w-full h-full" />
      <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-sm p-3 rounded-lg shadow-lg z-[1000] text-sm pointer-events-none border border-slate-100">
        <p className="font-bold text-slate-800 mb-2">Leyenda de Supervisores</p>
        <div className="space-y-1">
            {supervisors.map(s => (
                <div key={s.id} className="flex items-center gap-2">
                    {/* Usamos el mismo icono SVG pequeño para la leyenda */}
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill={getSupervisorColor(s.id, supervisors)} stroke="none">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                        <circle cx="12" cy="10" r="3" fill="white"></circle>
                    </svg>
                    <span className="text-[10px] font-bold uppercase text-slate-600">{s.name}</span>
                </div>
            ))}
        </div>
      </div>
    </div>
  );
};