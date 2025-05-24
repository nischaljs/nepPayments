import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const filePath = resolve(__dirname, 'dist/setup-nep-payments.js');
let content = fs.readFileSync(filePath, 'utf8');
content = `#!/usr/bin/env node\n${content}`;
fs.writeFileSync(filePath, content);
fs.chmodSync(filePath, 0o755); // Make it executable

console.log('✅ Shebang added and file made executable');
