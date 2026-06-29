import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const versionFilePath = path.join(__dirname, 'version.ts');
let currentVersion = "3.80";

if (fs.existsSync(versionFilePath)) {
  const content = fs.readFileSync(versionFilePath, 'utf8');
  const match = content.match(/export const VERSION = ["']([^"']+)["']/);
  if (match) {
    currentVersion = match[1];
  }
}

const type = process.argv[2] || 'minor'; // 'minor' or 'major'
let [major, minor] = currentVersion.split('.').map(Number);

if (type === 'major') {
  minor += 10;
} else {
  minor += 2;
}

if (minor >= 80) {
  major += 1;
  minor = 0;
}

const formattedMinor = minor === 0 ? "0" : (minor < 10 ? `0${minor}` : `${minor}`);
const newVersion = `${major}.${formattedMinor}`;

fs.writeFileSync(versionFilePath, `export const VERSION = "${newVersion}";\n`);
console.log(`Version bumped from ${currentVersion} to ${newVersion} (${type})`);
