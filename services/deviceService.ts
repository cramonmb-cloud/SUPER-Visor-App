import { DeviceMetadata } from '../types';

export const getDeviceMetadata = async (): Promise<DeviceMetadata> => {
  let ip = 'Unknown';
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    ip = data.ip;
  } catch (e) {
    console.error('Could not fetch IP:', e);
  }

  const ua = navigator.userAgent;
  let os = 'Unknown OS';
  if (ua.indexOf('Win') !== -1) os = 'Windows';
  if (ua.indexOf('Mac') !== -1) os = 'MacOS';
  if (ua.indexOf('X11') !== -1) os = 'UNIX';
  if (ua.indexOf('Linux') !== -1) os = 'Linux';
  if (ua.indexOf('Android') !== -1) os = 'Android';
  if (ua.indexOf('like Mac') !== -1) os = 'iOS';

  // Browser Detection
  let browser = "Otro";
  if (ua.indexOf("Firefox") > -1) browser = "Firefox";
  else if (ua.indexOf("SamsungBrowser") > -1) browser = "Samsung Browser";
  else if (ua.indexOf("Opera") > -1 || ua.indexOf("OPR") > -1) browser = "Opera";
  else if (ua.indexOf("Trident") > -1) browser = "Internet Explorer";
  else if (ua.indexOf("Edge") > -1 || ua.indexOf("Edg") > -1) browser = "Edge";
  else if (ua.indexOf("Chrome") > -1) browser = "Chrome";
  else if (ua.indexOf("Safari") > -1) browser = "Safari";

  const deviceType = /Mobile|Android|iPhone|iPad/i.test(ua) ? 'Móvil / Tablet' : 'Escritorio';

  return {
    timestamp: Date.now(),
    ip,
    userAgent: ua,
    browser,
    os,
    deviceType,
    screenResolution: `${window.screen.width}x${window.screen.height}`,
    windowSize: `${window.innerWidth}x${window.innerHeight}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: navigator.language,
    cpuCores: (navigator as any).hardwareConcurrency || 'N/A',
    memory: (navigator as any).deviceMemory ? `${(navigator as any).deviceMemory} GB` : 'N/A',
    isTouch: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
    localTime: new Date().toLocaleString()
  };
};