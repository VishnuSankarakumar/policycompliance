import crypto from 'crypto';
export const hash = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
export const sig = (f: Record<string, any>) => hash(JSON.stringify(f));
export function tryParseJSON<T=any>(s: string): T | null { try { return JSON.parse(s) as T; } catch { return null; } }
