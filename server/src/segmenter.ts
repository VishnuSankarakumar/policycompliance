import { Clause } from './types';
export function segmentPolicy(raw: string): Clause[] {
  const trimmed = raw.replace(/\r/g, '').trim();
  const parts = trimmed.split(/\n{2,}/g).flatMap(p=>p.split(/(?<=[.?!])\s+(?=[A-Z(])/g)).map(s=>s.trim()).filter(Boolean);
  let offset=0, idx=1; const clauses: Clause[]=[];
  for (const text of parts) { const start=offset, end=offset+text.length;
    clauses.push({ id:`C-${String(idx).padStart(4,'0')}`, text, start, end, tier:'main' }); offset=end+2; idx++; }
  return clauses;
}
