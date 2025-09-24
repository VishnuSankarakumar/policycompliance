#!/usr/bin/env bash
set -euo pipefail

# Creates the Policy Intel monorepo IN THE CURRENT DIRECTORY (no extra folder).
# Requirements: Node 20+, corepack (comes with Node 20), pnpm via corepack, Git Bash/WSL/bash.

# --- sanity checks
if ! command -v corepack >/dev/null 2>&1; then
  echo "❌ corepack not found. Install Node.js 20+ (which includes corepack) and try again." >&2
  exit 1
fi

echo "Preparing pnpm@9.1.0 for immediate activation..."
corepack enable >/dev/null 2>&1 || true
corepack prepare pnpm@9.1.0 --activate

# Warn if non-empty directory with conflicting files
for f in package.json pnpm-workspace.yaml client server; do
  if [ -e "$f" ]; then
    echo "⚠️  Detected existing '$f'. This script will overwrite/append as needed."
  fi
done

# --- root
cat > package.json <<'JSON'
{
  "name": "policy-intel",
  "private": true,
  "packageManager": "pnpm@9.1.0",
  "engines": { "node": ">=20.11.0" },
  "scripts": {
    "dev": "pnpm -r --parallel dev",
    "build": "pnpm -r build",
    "start": "pnpm --filter server start",
    "typecheck": "pnpm -r typecheck",
    "check:env": "node tools/check-env.mjs"
  },
  "devDependencies": {
    "typescript": "5.5.4"
  }
}
JSON

cat > pnpm-workspace.yaml <<'YAML'
packages:
  - 'client'
  - 'server'
YAML

cat > .gitignore <<'GIT'
node_modules
.pnpm-store
.env
.env.local
client/.env.local
server/.env
dist
client/dist
server/dist
*.log
.DS_Store
GIT

cat > .editorconfig <<'EC'
root = true
[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true
EC

echo 20 > .nvmrc
echo "NODE_ENV=development" > .env.example

mkdir -p scripts tools

cat > scripts/dev.sh <<'SH'
#!/usr/bin/env bash
set -euo pipefail
pnpm -r --parallel dev
SH
chmod +x scripts/dev.sh

cat > tools/seed-variables.json <<'JSON'
{
  "canonical": {
    "jurisdiction": ["jurisdiction", "region", "territory", "country"],
    "dsrResponseDays": ["dsrResponseDays", "responsePeriod", "requestResponseTime", "consumerResponseDays", "accessRequestDays"],
    "retentionDays": ["retentionDays", "retentionPeriod", "storageDuration", "dataRetention", "keepForDays"],
    "userAge": ["userAge", "age", "minorAge", "ageOfUser", "childAge"],
    "parentalConsent": ["parentalConsent", "guardianConsent"],
    "transferToUS": ["transferToUS", "xBorderUS", "crossBorderUS", "dataTransferUS"],
    "dataType": ["dataType", "recordType", "category", "datasetType"],
    "purpose": ["purpose", "useCase", "processingPurpose"]
  },
  "units": {
    "days": ["day", "days"],
    "months": ["month", "months"],
    "years": ["year", "years"]
  }
}
JSON

cat > tools/check-env.mjs <<'JS'
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
JS

cat > README.md <<'MD'
# Policy Intel

Paste a policy → auto-mine rules (with citations) → generate scenarios → judge → see contradictions & coverage.

## Quick start
pnpm install
cp client/.env.example client/.env.local
cp server/.env.example server/.env   # add your OpenAI API key
pnpm check:env
pnpm dev

Client: http://localhost:5173
Server: http://localhost:4000
MD

# --- client
mkdir -p client/src/components
mkdir -p client/src/lib

cat > client/package.json <<'JSON'
{
  "name": "client",
  "version": "0.2.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "react": "18.3.1",
    "react-dom": "18.3.1"
  },
  "devDependencies": {
    "@types/react": "18.3.3",
    "@types/react-dom": "18.3.0",
    "@vitejs/plugin-react": "4.3.1",
    "typescript": "5.5.4",
    "vite": "5.4.2"
  }
}
JSON

cat > client/.env.example <<'ENV'
VITE_API_URL=http://localhost:4000
ENV

cat > client/tsconfig.json <<'JSON'
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true
  },
  "include": ["src"]
}
JSON

cat > client/tsconfig.node.json <<'JSON'
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "types": ["node"]
  },
  "include": ["vite.config.ts"]
}
JSON

cat > client/vite.config.ts <<'TS'
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], server: { port: 5173, host: true } });
TS

cat > client/index.html <<'HTML'
<!doctype html><html lang="en"><head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Policy Intel</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>
HTML

cat > client/src/lib/api.ts <<'TS'
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';
async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${url}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
export const get = <T,>(u: string) => req<T>('GET', u);
export const post = <T,>(u: string, b?: unknown) => req<T>('POST', u, b);
TS

cat > client/src/main.tsx <<'TSX'
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App/></React.StrictMode>
);
TSX

cat > client/src/components/PolicyEditor.tsx <<'TSX'
import { useState } from 'react';
import { post } from '../lib/api';

export default function PolicyEditor({ projectId }: { projectId: string }) {
  const [text, setText] = useState('Paste policy text here...');
  const save = async () => { await post('/api/policy', { projectId, rawText: text }); alert('Policy saved'); };
  return (
    <section className="space-y-2">
      <h3 className="text-lg font-semibold">Policy</h3>
      <textarea className="w-full h-40 border p-2" value={text} onChange={e=>setText(e.target.value)} />
      <div className="flex gap-2"><button className="px-3 py-2 bg-black text-white rounded" onClick={save}>Save Policy</button></div>
    </section>
  );
}
TSX

cat > client/src/components/MiningControls.tsx <<'TSX'
import { useState } from 'react';
import { post } from '../lib/api';

export default function MiningControls({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const [status, setStatus] = useState('');
  const mine = async () => {
    setStatus('Mining…');
    await post('/api/constraints/auto', { projectId });
    setStatus('Done ✅');
    onDone();
  };
  return (
    <section className="space-y-2">
      <h3 className="text-lg font-semibold">Auto-extract Rules (with citations)</h3>
      <button className="px-3 py-2 bg-black text-white rounded" onClick={mine}>Run Miner</button>
      <span className="ml-2 text-sm">{status}</span>
    </section>
  );
}
TSX

cat > client/src/components/StressTestRunner.tsx <<'TSX'
import { useState } from 'react';
import { get, post } from '../lib/api';

export default function StressTestRunner({ projectId, onRefresh }: { projectId: string; onRefresh: () => void }) {
  const [rounds, setRounds] = useState(1);
  const [k, setK] = useState(4);
  const [job, setJob] = useState<{ jobId: string; status: string } | null>(null);

  const start = async () => {
    const j = await post<{ jobId: string; status: string }>('/api/stress/start', { projectId, rounds, k });
    setJob(j);
    let tries = 0;
    const poll = async () => {
      tries++;
      const st = await get<{ status: string }>(`/api/stress/status/${j.jobId}`);
      setJob({ jobId: j.jobId, status: st.status });
      if (st.status === 'done' || st.status === 'error' || tries >= 120) { onRefresh(); return; }
      setTimeout(poll, 1200);
    };
    setTimeout(poll, 800);
  };

  return (
    <section className="space-y-2">
      <h3 className="text-lg font-semibold">Stress Test</h3>
      <div className="flex gap-2 items-center">
        <label>Rounds <input type="number" className="border px-2 py-1 w-16" value={rounds} onChange={e=>setRounds(parseInt(e.target.value||'1'))}/></label>
        <label>K <input type="number" className="border px-2 py-1 w-16" value={k} onChange={e=>setK(parseInt(e.target.value||'4'))}/></label>
        <button className="px-3 py-2 bg-black text-white rounded" onClick={start}>Run</button>
        {job && <span className="text-sm">Job {job.jobId.slice(0,8)} — {job.status}</span>}
      </div>
    </section>
  );
}
TSX

cat > client/src/components/ResultsTable.tsx <<'TSX'
import { useEffect, useState } from 'react';
import { get } from '../lib/api';

type Scenario = { id: string; description: string; round: number; features: Record<string, any> };
type Verdict = { scenarioId: string; state: 'PASS'|'FAIL'|'AMBIGUOUS'; failingConstraintIds: string[] };
type Rule = { id: string; label: string; ambiguous: boolean; evidence: { clauseId: string; quote: string }[] };

export default function ResultsTable({ projectId, refreshKey }: { projectId: string; refreshKey: number }) {
  const [rows, setRows] = useState<any[]>([]);
  const [rules, setRules] = useState<Map<string, Rule>>(new Map());

  useEffect(()=>{(async()=>{
    const data = await get<{ scenarios: Scenario[]; verdicts: Verdict[]; rules: Rule[] }>(`/api/results?projectId=${projectId}`);
    const rMap = new Map(data.rules.map(r=>[r.id,r])); setRules(rMap);
    const vMap = new Map(data.verdicts.map(v=>[v.scenarioId,v]));
    const merged = data.scenarios.map(s=>({s,v:vMap.get(s.id)})).sort((a,b)=>a.s.round-b.s.round);
    setRows(merged.map(({s,v}) => ({
      id: s.id, round: s.round, desc: s.description, state: v?.state || 'AMBIGUOUS',
      failing: (v?.failingConstraintIds||[]).map(id => rMap.get(id)?.label || id)
    })));
  })()},[projectId,refreshKey]);

  return (
    <section className="space-y-2">
      <h3 className="text-lg font-semibold">Results</h3>
      <table className="w-full text-sm border">
        <thead className="bg-gray-50">
          <tr><th className="p-2 text-left">Round</th><th className="p-2 text-left">Scenario</th><th className="p-2 text-left">State</th><th className="p-2 text-left">Failing / Implicated Rules</th></tr>
        </thead>
        <tbody>
          {rows.map(r=>(
            <tr key={r.id} className="border-t">
              <td className="p-2 align-top">{r.round}</td>
              <td className="p-2 align-top">{r.desc}</td>
              <td className="p-2 align-top">
                {r.state==='PASS'&&<span className="px-2 py-1 rounded bg-green-100">PASS</span>}
                {r.state==='FAIL'&&<span className="px-2 py-1 rounded bg-red-100">FAIL</span>}
                {r.state==='AMBIGUOUS'&&<span className="px-2 py-1 rounded bg-yellow-100">AMBIGUOUS</span>}
              </td>
              <td className="p-2 align-top">
                {r.failing.length ? <ul className="list-disc ml-4">{r.failing.map((f:string,i:number)=><li key={i}>{f}</li>)}</ul> : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
TSX

cat > client/src/App.tsx <<'TSX'
import { useEffect, useState } from 'react';
import { post } from './lib/api';
import PolicyEditor from './components/PolicyEditor';
import MiningControls from './components/MiningControls';
import StressTestRunner from './components/StressTestRunner';
import ResultsTable from './components/ResultsTable';

export default function App(){
  const [projectId,setProjectId]=useState('');
  const [refreshKey,setRefreshKey]=useState(0);
  useEffect(()=>{(async()=>{
    const proj=await post<{id:string;name:string}>('/api/projects',{name:'Policy Intel'});
    setProjectId(proj.id);
  })();},[]);
  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-bold">Policy Intel — Clause-Aware Stress Testing</h1>
      {projectId && <PolicyEditor projectId={projectId}/>}
      {projectId && <MiningControls projectId={projectId} onDone={()=>setRefreshKey(k=>k+1)}/>}
      {projectId && <StressTestRunner projectId={projectId} onRefresh={()=>setRefreshKey(k=>k+1)}/>}
      {projectId && <ResultsTable projectId={projectId} refreshKey={refreshKey}/>}
    </div>
  );
}
TSX

# --- server
mkdir -p server/src

cat > server/package.json <<'JSON'
{
  "name": "server",
  "version": "0.3.0",
  "private": true,
  "scripts": {
    "dev": "ts-node src/server.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server.js",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "body-parser": "1.20.2",
    "cors": "2.8.5",
    "dotenv": "16.4.5",
    "express": "4.19.2",
    "json-logic-js": "2.0.2",
    "openai": "4.58.1",
    "p-limit": "5.0.0",
    "string-similarity": "4.0.4",
    "zod": "3.23.8"
  },
  "devDependencies": {
    "@types/body-parser": "1.19.5",
    "@types/cors": "2.8.17",
    "@types/express": "4.17.21",
    "@types/node": "20.14.10",
    "ts-node": "10.9.2",
    "typescript": "5.5.4"
  }
}
JSON

cat > server/.env.example <<'ENV'
PORT=4000
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL=gpt-4o-2024-08-06
ENV

cat > server/tsconfig.json <<'JSON'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "outDir": "dist",
    "rootDir": "src",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true
  }
}
JSON

# FIXED: use node:crypto randomUUID to avoid TS error
cat > server/src/store.ts <<'TS'
import { randomUUID } from 'node:crypto';
import { Clause, Hypothesis, PolicyDoc, PolicyProject, Rule, Scenario, StressJob, UUID, Verdict } from './types';

export const db = {
  projects: new Map<UUID, PolicyProject>(),
  policies: new Map<UUID, PolicyDoc[]>(),
  clauses: new Map<UUID, Clause[]>(),
  hypotheses: new Map<UUID, Hypothesis[]>(),
  rules: new Map<UUID, Rule[]>(),
  scenarios: new Map<UUID, Scenario[]>(),
  verdicts: new Map<UUID, Verdict[]>(),
  jobs: new Map<UUID, StressJob>(),
  seenFeatureSigs: new Map<UUID, Set<string>>()
};

export const id = () => randomUUID();
export const nowISO = () => new Date().toISOString();
TS

cat > server/src/types.ts <<'TS'
import { z } from 'zod';
export type UUID = string;
export type PolicyProject = { id: UUID; name: string; createdAt: string; };
export type PolicyDoc = { projectId: UUID; versionId: UUID; rawText: string; createdAt: string; };
export type Clause = { id: string; text: string; page?: number; start: number; end: number; tier: 'main'|'appendix'|'footnote'; };
export const FeatureSchema = z.object({
  jurisdiction: z.string().optional(),
  dsrResponseDays: z.number().int().min(0).optional(),
  retentionDays: z.number().int().min(0).optional(),
  userAge: z.number().int().min(0).nullable().optional(),
  parentalConsent: z.boolean().optional(),
  transferToUS: z.boolean().optional(),
  dataType: z.string().optional(),
  purpose: z.string().optional()
});
export type Features = z.infer<typeof FeatureSchema>;
export type EvidenceSpan = { clauseId: string; start: number; end: number; quote: string };
export type Hypothesis = { id: UUID; label: string; claim: string; evidence: EvidenceSpan[]; variables: string[]; canonicalVars: string[]; formal?: any|null; ambiguous: boolean; confidence: number; };
export type Rule = { id: UUID; projectId: UUID; label: string; evidence: EvidenceSpan[]; canonicalVars: string[]; json?: any; ambiguous: boolean; confidence: number; tier: 'main'|'appendix'|'footnote'; };
export type Scenario = { id: UUID; projectId: UUID; description: string; features: Record<string, any>; round: number; };
export type Verdict = { scenarioId: UUID; state: 'PASS'|'FAIL'|'AMBIGUOUS'; passed: boolean; failingConstraintIds: UUID[]; trace?: any; };
export type StressJob = { id: UUID; projectId: UUID; status: 'queued'|'running'|'done'|'error'; createdAt: string; error?: string; params: { rounds: number; k: number; model?: string } };
TS

cat > server/src/util.ts <<'TS'
import crypto from 'crypto';
export const hash = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
export const sig = (f: Record<string, any>) => hash(JSON.stringify(f));
export function tryParseJSON<T=any>(s: string): T | null { try { return JSON.parse(s) as T; } catch { return null; } }
TS

cat > server/src/segmenter.ts <<'TS'
import { Clause } from './types';
export function segmentPolicy(raw: string): Clause[] {
  const trimmed = raw.replace(/\r/g, '').trim();
  const parts = trimmed.split(/\n{2,}/g).flatMap(p=>p.split(/(?<=[.?!])\s+(?=[A-Z(])/g)).map(s=>s.trim()).filter(Boolean);
  let offset=0, idx=1; const clauses: Clause[]=[];
  for (const text of parts) { const start=offset, end=offset+text.length;
    clauses.push({ id:`C-${String(idx).padStart(4,'0')}`, text, start, end, tier:'main' }); offset=end+2; idx++; }
  return clauses;
}
TS

cat > server/src/miner.ts <<'TS'
import OpenAI from 'openai';
import { tryParseJSON } from './util';
import { Clause, EvidenceSpan, Hypothesis } from './types';
import { id } from './store';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function mineHypotheses(clauses: Clause[], model: string): Promise<Hypothesis[]> {
  const sys = "You extract normative claims (obligations, prohibitions, conditions, exceptions) from policy clauses. Return only claims supported by verbatim spans with exact char offsets. If a claim cannot be expressed with measurable logic, set formal=null and ambiguous=true.";
  const inputPayload = { clauses: clauses.map(c=>({id:c.id,text:c.text,start:c.start,end:c.end,tier:c.tier})) };
  const user = "Extract hypotheses from the following clauses. Output JSON: { hypotheses: [{ label, claim, evidence:[{clauseId,start,end,quote}], variables: string[], formal?: object|null, ambiguous: boolean, confidence: number }] }\n\n"+JSON.stringify(inputPayload);

  try {
    const resp = await client.chat.completions.create({
      model,
      messages:[{role:'system',content:sys},{role:'user',content:user}],
      response_format:{type:'json_object'}
    });
    const raw = resp.choices[0]?.message?.content ?? '{}';
    const parsed = tryParseJSON<{hypotheses:any[]}>(raw) || {hypotheses:[]};
    return sanitizeHypotheses(parsed.hypotheses, clauses);
  } catch {
    const resp = await client.chat.completions.create({
      model,
      tools:[{type:'function',function:{name:'return_hypotheses',description:'Return hypotheses',parameters:{
        type:'object',properties:{hypotheses:{type:'array',items:{type:'object',required:['label','claim','evidence','variables','ambiguous','confidence'],
        properties:{label:{type:'string'},claim:{type:'string'},evidence:{type:'array',items:{type:'object',required:['clauseId','start','end','quote'],
        properties:{clauseId:{type:'string'},start:{type:'integer'},end:{type:'integer'},quote:{type:'string'}}}},variables:{type:'array',items:{type:'string'}},
        formal:{type:['object','null']},ambiguous:{type:'boolean'},confidence:{type:'number'}}}}},required:['hypotheses']}}}],
      tool_choice:{type:'function',function:{name:'return_hypotheses'}},
      messages:[{role:'system',content:sys},{role:'user',content:user}]
    });
    const tc = resp.choices[0]?.message?.tool_calls?.[0];
    const args = tryParseJSON<{hypotheses:any[]}>(tc?.function?.arguments || '{}') || {hypotheses:[]};
    return sanitizeHypotheses(args.hypotheses, clauses);
  }
}

function sanitizeHypotheses(items:any[], clauses:Clause[]): Hypothesis[] {
  const byId = new Map(clauses.map(c=>[c.id,c]));
  const out:Hypothesis[]=[];
  for (const h of items||[]) {
    const evi: EvidenceSpan[] = Array.isArray(h.evidence)
      ? h.evidence.flatMap((e:any)=>{
          const c=byId.get(e.clauseId); if(!c) return [];
          const s=Number(e.start)|0, d=Number(e.end)|0;
          const slice=c.text.slice(s-c.start,d-c.start);
          if(!slice||(e.quote&&e.quote.trim()!==slice.trim())) return [];
          return [{clauseId:c.id,start:s,end:d,quote:slice}];
        })
      : [];
    if(!evi.length) continue;
    out.push({
      id:id(),
      label:String(h.label||h.claim||'Claim'),
      claim:String(h.claim||h.label||''),
      evidence:evi,
      variables:Array.isArray(h.variables)?h.variables.map(String):[],
      canonicalVars:[],
      formal:h.formal??null,
      ambiguous:Boolean(h.ambiguous)||!h.formal,
      confidence:Math.max(0,Math.min(1,Number(h.confidence??0.5)))
    });
  }
  return out;
}
TS

cat > server/src/unifier.ts <<'TS'
import { Hypothesis } from './types';
import path from 'node:path';
import fs from 'node:fs';
import stringSimilarity from 'string-similarity';

type Seed = { canonical: Record<string,string[]>, units: Record<string,string[]> };

const seedPath = path.join(process.cwd(),'tools','seed-variables.json');
const seed: Seed = JSON.parse(fs.readFileSync(seedPath,'utf8'));
const canonicalList = Object.keys(seed.canonical);

function canonicalizeVarName(name:string):string{
  for(const [canon,alts] of Object.entries(seed.canonical)){ if(alts.includes(name)) return canon; }
  const { bestMatch } = stringSimilarity.findBestMatch(name, canonicalList);
  if (bestMatch.rating >= 0.6) return bestMatch.target;
  return name;
}

export function unifyVariables(hyps: Hypothesis[]): Hypothesis[] {
  return hyps.map(h=>({ ...h, canonicalVars: Array.from(new Set(h.variables.map(v=>canonicalizeVarName(v)))) }));
}
TS

cat > server/src/normalizer.ts <<'TS'
import { Hypothesis, Rule } from './types';
import { id } from './store';

export function hypothesesToRules(projectId: string, hyps: Hypothesis[]): Rule[] {
  const rules: Rule[] = [];
  for(const h of hyps){
    const determinable = !!h.formal && typeof h.formal === 'object';
    rules.push({
      id:id(),
      projectId,
      label:h.label,
      evidence:h.evidence,
      canonicalVars:h.canonicalVars,
      json: determinable ? h.formal : undefined,
      ambiguous: !determinable,
      confidence: h.confidence,
      tier:'main'
    });
  }
  return rules;
}
TS

cat > server/src/graph.ts <<'TS'
import { Rule } from './types';

export type Graph = { nodes: Rule[]; edges: { a: string; b: string; weight: number; type: 'varOverlap'|'opposition' }[] };

export function buildGraph(rules: Rule[]): Graph {
  const edges: Graph['edges'] = [];
  for(let i=0;i<rules.length;i++) for(let j=i+1;j<rules.length;j++){
    const a=rules[i], b=rules[j];
    const overlap=a.canonicalVars.filter(v=>b.canonicalVars.includes(v));
    if(!overlap.length) continue;
    let weight = overlap.length;
    const aTxt=JSON.stringify(a.json||{}), bTxt=JSON.stringify(b.json||{});
    const opp = (aTxt.includes('<=')&&bTxt.includes('>='))||(aTxt.includes('>=')&&bTxt.includes('<='))||(aTxt.includes('==')&&bTxt.includes('!='));
    edges.push({ a:a.id, b:b.id, weight: weight + (opp?1:0), type: opp?'opposition':'varOverlap' });
  }
  return { nodes: rules, edges };
}
TS

cat > server/src/generator.ts <<'TS'
import OpenAI from 'openai';
import { Features, FeatureSchema, Rule, Scenario } from './types';
import { id } from './store';
import { sig } from './util';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function generateScenarios(opts:{ projectId:string; rules:Rule[]; k:number; round:number; excludeSigs:Set<string>; model:string }): Promise<Scenario[]> {
  const vars = Array.from(new Set(opts.rules.flatMap(r=>r.canonicalVars)));
  const sys = "You generate realistic adversarial compliance scenarios. Return exactly k scenarios with {description, features}. Use only the provided variable keys. Prefer boundary tests and tension between potentially opposing rules.";
  const ruleHints = opts.rules.slice(0,30).map(r=>`- ${r.label} (vars: ${r.canonicalVars.join(', ')})`).join('\\n');
  const user = `Variables: ${vars.join(', ')||'(none)'}\\n\\nAvoid duplicate feature signatures. Previously tested (sha256): ${Array.from(opts.excludeSigs).slice(0,50).join(', ')||'none'}\\n\\nk=${opts.k}\\n\\nRule hints:\\n${ruleHints}`;

  const completion = await client.chat.completions.create({
    model: opts.model,
    messages:[{role:'system',content:sys},{role:'user',content:user}],
    response_format:{type:'json_object'}
  });

  const raw = completion.choices[0]?.message?.content ?? '{}';
  let parsed:any; try{ parsed=JSON.parse(raw);}catch{parsed={};}
  const arr:any[] = Array.isArray(parsed?.scenarios)?parsed.scenarios:(Array.isArray(parsed)?parsed:parsed?.items||[]);
  const out:Scenario[]=[];

  for(const s of arr){
    const features = FeatureSchema.safeParse(s.features||{});
    if(!features.success) continue;
    const signature = sig(features.data as Features);
    if(opts.excludeSigs.has(signature)) continue;
    out.push({ id:id(), projectId:opts.projectId, description:String(s.description||'Scenario'), features:features.data, round:opts.round });
    opts.excludeSigs.add(signature);
    if(out.length>=opts.k) break;
  }

  if(out.length===0){
    const f: any = {};
    if(vars.includes('jurisdiction')) f.jurisdiction='EU';
    if(vars.includes('dsrResponseDays')) f.dsrResponseDays=31;
    out.push({ id:id(), projectId:opts.projectId, description:'Fallback boundary probe', features:f, round:opts.round });
  }
  return out;
}
TS

cat > server/src/judge.ts <<'TS'
import jsonLogic from 'json-logic-js';
import { Rule, Verdict } from './types';

export function judgeScenario(features: Record<string, any>, rules: Rule[]): Verdict {
  const failing: string[]=[];
  let ambiguous=false;
  const trace:Record<string,any>={};

  for(const r of rules){
    if(r.ambiguous || !r.json){ ambiguous=true; continue; }
    try{
      const res=!!jsonLogic.apply(r.json, features);
      trace[r.id]=res?'PASS':'FAIL';
      if(!res) failing.push(r.id);
    } catch {
      trace[r.id]='EVAL_ERROR';
      failing.push(r.id);
    }
  }

  let state: Verdict['state']='PASS';
  if(failing.length) state='FAIL';
  else if(ambiguous) state='AMBIGUOUS';

  return { scenarioId:'', state, passed: state==='PASS', failingConstraintIds:failing, trace };
}

export function detectContradictions(rules: Rule[]): { pairs:[Rule,Rule][] }{
  const pairs:[Rule,Rule][]=[];
  for(let i=0;i<rules.length;i++) for(let j=i+1;j<rules.length;j++){
    const a=rules[i], b=rules[j];
    if(a.ambiguous||b.ambiguous||!a.json||!b.json) continue;
    const overlap=a.canonicalVars.filter(v=>b.canonicalVars.includes(v));
    if(!overlap.length) continue;
    const aTxt=JSON.stringify(a.json), bTxt=JSON.stringify(b.json);
    const opp=(aTxt.includes('<=')&&bTxt.includes('>='))||(aTxt.includes('>=')&&bTxt.includes('<='))||(aTxt.includes('==')&&bTxt.includes('!='));
    if(opp) pairs.push([a,b]);
  }
  return { pairs };
}
TS

cat > server/src/detectors.ts <<'TS'
import { Clause, Hypothesis, Rule } from './types';

export function coverageStatus(clauses: Clause[], rules: Rule[], hyps: Hypothesis[]){
  const covered = new Set<string>();
  for(const r of rules) for(const e of r.evidence) covered.add(e.clauseId);
  for(const h of hyps) for(const e of h.evidence) covered.add(e.clauseId);
  const uncovered = clauses.filter(c=>!covered.has(c.id));
  return { uncovered };
}

export function undefinedVariables(rules: Rule[], definitions: string[] = []) {
  const vars = new Set(rules.flatMap(r=>r.canonicalVars));
  const undef = Array.from(vars).filter(v=>!definitions.includes(v));
  return { undefinedVars: undef };
}
TS

cat > server/src/routes.ts <<'TS'
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import pLimit from 'p-limit';

import { db, id, nowISO } from './store';
import { Clause, Hypothesis, PolicyDoc, PolicyProject, Rule, Scenario, StressJob, Verdict } from './types';
import { segmentPolicy } from './segmenter';
import { mineHypotheses } from './miner';
import { unifyVariables } from './unifier';
import { hypothesesToRules } from './normalizer';
import { buildGraph } from './graph';
import { generateScenarios } from './generator';
import { detectContradictions, judgeScenario } from './judge';
import { coverageStatus, undefinedVariables } from './detectors';

export function createApp(){
  const DEV = process.env.NODE_ENV!=='production';
  const app = express();
  app.use(cors({ origin: DEV ? true : ['https://your-frontend.example.com'] }));
  app.use(bodyParser.json({ limit:'1mb' }));

  app.post('/api/projects',(req,res)=>{
    const project: PolicyProject={ id:id(), name:String(req.body?.name||'Untitled'), createdAt:nowISO() };
    db.projects.set(project.id, project);
    db.policies.set(project.id, []);
    db.clauses.set(project.id, []);
    db.hypotheses.set(project.id, []);
    db.rules.set(project.id, []);
    db.scenarios.set(project.id, []);
    db.verdicts.set(project.id, []);
    db.seenFeatureSigs.set(project.id, new Set());
    res.json(project);
  });

  app.post('/api/policy',(req,res)=>{
    const { projectId, rawText } = req.body as { projectId:string; rawText:string };
    if(!db.projects.has(projectId)) return res.status(404).json({ error:'Project not found' });
    const doc: PolicyDoc = { projectId, versionId:id(), rawText, createdAt: nowISO() };
    db.policies.get(projectId)!.push(doc);
    const clauses: Clause[] = segmentPolicy(rawText);
    db.clauses.set(projectId, clauses);
    res.json({ doc, clausesCount: clauses.length });
  });

  app.post('/api/constraints/auto', async (req,res)=>{
    const { projectId } = req.body as { projectId:string };
    if(!db.projects.has(projectId)) return res.status(404).json({ error:'Project not found' });
    const model = process.env.OPENAI_MODEL || 'gpt-4o-2024-08-06';

    const clauses = db.clauses.get(projectId) || [];
    if(!clauses.length) return res.status(400).json({ error:'No clauses. Upload policy first.' });

    const batchSize=12;
    const chunks = Array.from({length:Math.ceil(clauses.length/batchSize)},(_,i)=>clauses.slice(i*batchSize,(i+1)*batchSize));

    const limit = pLimit(2);
    const minedBatches = await Promise.all(chunks.map(ch => limit(()=>mineHypotheses(ch, model))));
    const hyps: Hypothesis[] = minedBatches.flat();

    const unified = unifyVariables(hyps);
    db.hypotheses.set(projectId, unified);

    const rules: Rule[] = hypothesesToRules(projectId, unified);
    db.rules.set(projectId, rules);

    const graph = buildGraph(rules);
    const cov = coverageStatus(clauses, rules, unified);
    const undef = undefinedVariables(rules);

    res.json({ counts:{ clauses: clauses.length, hypotheses: unified.length, rules: rules.length, edges: graph.edges.length, uncoveredClauses: cov.uncovered.length, undefinedVars: undef.undefinedVars } });
  });

  app.post('/api/stress/start', async (req,res)=>{
    const { projectId, rounds=1, k=4 } = req.body as { projectId:string; rounds?:number; k?:number };
    if(!db.projects.has(projectId)) return res.status(404).json({ error:'Project not found' });
    const model = process.env.OPENAI_MODEL || 'gpt-4o-2024-08-06';

    const job: StressJob = { id:id(), projectId, status:'running', createdAt:nowISO(), params:{ rounds, k, model } };
    db.jobs.set(job.id, job);
    res.json({ jobId: job.id, status: job.status });

    const rules = db.rules.get(projectId) || [];
    const seen = db.seenFeatureSigs.get(projectId)!;
    const scenarios: Scenario[] = db.scenarios.get(projectId) || [];
    const verdicts: Verdict[] = db.verdicts.get(projectId) || [];

    try{
      for(let round=1; round<=rounds; round++){
        const batch = await generateScenarios({ projectId, rules, k, round, excludeSigs:seen, model });
        for(const sc of batch){
          const v = judgeScenario(sc.features, rules);
          v.scenarioId = sc.id;
          scenarios.push(sc);
          verdicts.push(v);
        }
      }
      db.scenarios.set(projectId, scenarios);
      db.verdicts.set(projectId, verdicts);
      db.jobs.set(job.id, { ...job, status:'done' });
    } catch(e:any){
      db.jobs.set(job.id, { ...job, status:'error', error:e?.message||'Unknown error' });
    }
  });

  app.get('/api/stress/status/:jobId',(req,res)=>{
    const job = db.jobs.get(req.params.jobId);
    if(!job) return res.status(404).json({ error:'Job not found' });
    res.json({ status: job.status, error: job.error });
  });

  app.get('/api/results',(req,res)=>{
    const { projectId } = req.query as { projectId:string };
    if(!db.projects.has(projectId)) return res.status(404).json({ error:'Project not found' });
    res.json({
      scenarios: db.scenarios.get(projectId) || [],
      verdicts: db.verdicts.get(projectId) || [],
      rules: db.rules.get(projectId) || []
    });
  });

  return app;
}
TS

cat > server/src/server.ts <<'TS'
import 'dotenv/config';
import { createApp } from './routes';

const PORT = Number(process.env.PORT || 4000);
const app = createApp();
app.listen(PORT, ()=>console.log(`[server] listening on :${PORT}`));
TS

echo "Installing deps..."
pnpm install

echo
echo "✅ Repo ready at $(pwd)"
echo "Next:"
echo "  cp client/.env.example client/.env.local"
echo "  cp server/.env.example server/.env   # add your OpenAI API key"
echo "  pnpm check:env"
echo "  pnpm dev"
