export const ADMIN_PIN = '0120'; 
export const SUPER_ADMIN_NAME = 'Cristobal';
export const STORAGE_KEY = 'prestacheck_db_v1';

export const PLACEHOLDER_QR = "https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=";

export const removeAccents = (str: string): string => {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};

export interface ClientLoanCycle {
  elapsedWeeks: number;
  isActive: boolean;
  totalWeeks: number;
  cycleLabel: string;
  regWeekName?: string;
  currentWeekName?: string;
}

export const getClientLoanCycle = (
  client: { weekId?: string; registeredAt?: number; financieraId?: string; isArchived?: boolean },
  weeks: Array<{ id: string; name: string; startDate: number; endDate?: number; isActive?: boolean; financieraId?: string }> = []
): ClientLoanCycle => {
  const TOTAL_CYCLE_WEEKS = 13;

  // Filter weeks by this client's financiera
  const finWeeks = weeks
    .filter(w => !client.financieraId || !w.financieraId || w.financieraId === client.financieraId)
    .sort((a, b) => a.startDate - b.startDate); // Oldest to newest

  const currentActiveWeek = finWeeks.find(w => w.isActive) || finWeeks[finWeeks.length - 1];

  let elapsedWeeks = 1;

  if (finWeeks.length > 0 && currentActiveWeek) {
    const currentIndex = finWeeks.findIndex(w => w.id === currentActiveWeek.id);

    let regIndex = -1;
    if (client.weekId) {
      regIndex = finWeeks.findIndex(w => w.id === client.weekId);
    }
    if (regIndex === -1 && client.registeredAt) {
      // Find week containing registeredAt
      regIndex = finWeeks.findIndex(w => {
        const end = w.endDate || (w.startDate + 7 * 24 * 60 * 60 * 1000 - 1);
        return client.registeredAt! >= w.startDate && client.registeredAt! <= end;
      });
      // Fallback: closest prior week
      if (regIndex === -1) {
        for (let i = finWeeks.length - 1; i >= 0; i--) {
          if (finWeeks[i].startDate <= client.registeredAt!) {
            regIndex = i;
            break;
          }
        }
      }
    }

    if (regIndex !== -1 && currentIndex >= regIndex) {
      elapsedWeeks = (currentIndex - regIndex) + 1;
    } else {
      // Fallback to calendar weeks calculation based on registeredAt
      const diffMs = Math.max(0, Date.now() - (client.registeredAt || Date.now()));
      elapsedWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;
    }
  } else if (client.registeredAt) {
    const diffMs = Math.max(0, Date.now() - client.registeredAt);
    elapsedWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;
  }

  const isActive = elapsedWeeks <= TOTAL_CYCLE_WEEKS;
  const cycleLabel = isActive ? `Semana ${elapsedWeeks} de ${TOTAL_CYCLE_WEEKS}` : `Inactivo (+${TOTAL_CYCLE_WEEKS} sem)`;

  return {
    elapsedWeeks,
    isActive,
    totalWeeks: TOTAL_CYCLE_WEEKS,
    cycleLabel,
    regWeekName: client.weekId ? finWeeks.find(w => w.id === client.weekId)?.name : undefined,
    currentWeekName: currentActiveWeek?.name
  };
};