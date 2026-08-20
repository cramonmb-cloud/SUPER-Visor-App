import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const versionFilePath = path.join(__dirname, 'version.ts');
let currentVersion = "5.52";

if (fs.existsSync(versionFilePath)) {
  const content = fs.readFileSync(versionFilePath, 'utf8');
  const match = content.match(/export const VERSION = ["']([^"']+)[\"']/);
  if (match) {
    currentVersion = match[1];
  }
}

/**
 * TABULADOR DE COMPILACIÓN:
 * 
 * 1. 'minor' (+0.10):
 *    - Corrección de bugs menores o errores visuales
 *    - Ajustes de texto, labels, modales o mensajes
 *    - Cambios de CSS, colores, estilos, iconos individuales
 *    - Mejoras en validaciones o retoques de componentes
 * 
 * 2. 'major' (+1.00):
 *    - Nuevos módulos completos o nuevas vistas
 *    - Nuevos flujos de negocio / lógica avanzada
 *    - Cambios de estructura en Firebase / backend
 *    - Rediseños integrales o refactorizaciones profundas
 */
const type = process.argv[2] || 'minor';

const currentNum = parseFloat(currentVersion);
let nextNum;

if (type === 'major') {
  nextNum = currentNum + 1.00;
} else {
  // Minor / Ajuste pequeño
  nextNum = currentNum + 0.10;
}

// Redondear a 2 decimales para evitar problemas de precisión de coma flotante
const newVersion = (Math.round(nextNum * 100) / 100).toFixed(2);

fs.writeFileSync(versionFilePath, `export const VERSION = "${newVersion}";\n`);
console.log(`[BUMP VERSION] Compilación actualizada: v${currentVersion} -> v${newVersion} (${type.toUpperCase()})`);

// Sincronizar el nombre del caché en el Service Worker si existe
const swFilePath = path.join(__dirname, 'public', 'sw.js');
if (fs.existsSync(swFilePath)) {
  let swContent = fs.readFileSync(swFilePath, 'utf8');
  swContent = swContent.replace(/const CACHE_NAME = ["']([^"']+)["'];/, `const CACHE_NAME = 'visor-app-v${newVersion}';`);
  fs.writeFileSync(swFilePath, swContent);
  console.log(`[SERVICE WORKER] CACHE_NAME actualizado a 'visor-app-v${newVersion}'`);
}
