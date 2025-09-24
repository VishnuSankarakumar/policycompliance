// server/src/server.ts
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

// Robustly load server/.env regardless of ts-node (src) or built (dist)
const envCandidates = [
  path.resolve(__dirname, '..', '.env'),       // server/src -> ../.env  (ts-node)
  path.resolve(__dirname, '..', '.env'),       // server/dist -> ../.env (built)
];

let envPath = envCandidates.find(p => fs.existsSync(p));
if (!envPath) {
  // last resort: try cwd/server/.env (in case someone starts from repo root strangely)
  const cwdTry = path.resolve(process.cwd(), 'server', '.env');
  if (fs.existsSync(cwdTry)) envPath = cwdTry;
}

dotenv.config(envPath ? { path: envPath } : undefined);

// Helpful boot log (masks key)
const maskedKey = process.env.OPENAI_API_KEY
  ? process.env.OPENAI_API_KEY.slice(0, 6) + '…' + process.env.OPENAI_API_KEY.slice(-4)
  : '(none)';
console.log('[env] .env path:', envPath || '(not found)');
console.log('[env] OPENAI_API_KEY set:', !!process.env.OPENAI_API_KEY, 'value:', maskedKey);
console.log('[env] OPENAI_MODEL:', process.env.OPENAI_MODEL || '(none)');

import { createApp } from './routes';

const PORT = Number(process.env.PORT || 4000);
const app = createApp();
app.listen(PORT, () => console.log(`[server] listening on :${PORT}`));
