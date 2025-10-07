// server/src/server.ts
import 'dotenv/config';
import { createApp } from './routes';

const PORT = Number(process.env.PORT || 4000);
const app = createApp();
app.listen(PORT, () => console.log(`[server] listening on :${PORT}`));
