import fs from 'node:fs';
import path from 'node:path';
const serverEnv = path.join('server', '.env');
if (!fs.existsSync(serverEnv)) {
  console.log('ℹ️  server/.env not found. Copy server/.env.example and set OPENAI_API_KEY.');
  process.exit(0);
}
const text = fs.readFileSync(serverEnv, 'utf8');
if (!/OPENAI_API_KEY\s*=/.test(text)) {
  console.error('❌ OPENAI_API_KEY missing in server/.env');
  process.exit(1);
}
console.log('✅ Environment looks good.');
