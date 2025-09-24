// server/src/generator.ts
import OpenAI from 'openai';
import { Features, FeatureSchema, Rule, Scenario } from './types';
import { id } from './store';
import { sig } from './util';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Keep only allowed keys and coerce common type issues (e.g., "30" -> 30)
function sanitizeFeatures(input: any, allowKeys: string[]): Features | null {
  if (!input || typeof input !== 'object') return {};
  const out: Record<string, any> = {};
  for (const k of allowKeys) {
    const v = (input as any)[k];
    if (v === undefined) continue;
    if (k.endsWith('Days') || k === 'userAge') {
      // numbers: accept number-like strings
      if (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v)) out[k] = Math.floor(Number(v));
      else if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.floor(v);
      else continue; // drop invalid numeric fields
    } else if (k.startsWith('is') || k === 'transferToUS' || k === 'parentalConsent') {
      // booleans: accept true/"true"/1
      if (typeof v === 'boolean') out[k] = v;
      else if (typeof v === 'string' && /^(true|false)$/i.test(v)) out[k] = v.toLowerCase() === 'true';
      else if (v === 1 || v === 0) out[k] = v === 1;
      else continue;
    } else {
      // strings
      if (typeof v === 'string') out[k] = v.trim();
      else continue;
    }
  }
  // Validate against Zod schema (all fields optional)
  const parsed = FeatureSchema.safeParse(out);
  return parsed.success ? parsed.data : null;
}

export async function generateScenarios(opts: {
  projectId: string;
  rules: Rule[];
  k: number;
  round: number;
  excludeSigs: Set<string>;
  model: string;
}): Promise<Scenario[]> {
  const vars = Array.from(new Set(opts.rules.flatMap((r) => r.canonicalVars)));
  const allowedKeys = vars.length ? vars : [
    // sensible defaults if miner hasn’t produced vars
    'jurisdiction','dsrResponseDays','retentionDays','userAge','parentalConsent','transferToUS','dataType','purpose'
  ];

  // Helper to push unique & valid scenarios
  const pushUnique = (out: Scenario[], desc: string, rawFeatures: any) => {
    const features = sanitizeFeatures(rawFeatures || {}, allowedKeys);
    if (features === null) return false;
    const signature = sig(features as Features);
    if (opts.excludeSigs.has(signature)) return false;
    out.push({ id: id(), projectId: opts.projectId, description: String(desc || 'Scenario'), features, round: opts.round });
    opts.excludeSigs.add(signature);
    return true;
  };

  // Local deterministic fallback (no LLM)
  const localFallback = (): Scenario[] => {
    const out: Scenario[] = [];
    const has = (v: string) => allowedKeys.includes(v);
    const candidates: Array<{ description: string; features: any }> = [];

    if (has('jurisdiction') && has('dsrResponseDays')) {
      candidates.push({ description: 'EU subject access request slightly beyond EU limit.', features: { jurisdiction: 'EU', dsrResponseDays: 31 } });
      candidates.push({ description: 'CA resident access request near lower CA bound.', features: { jurisdiction: 'CA', dsrResponseDays: 45 } });
    }
    if (has('retentionDays') && has('dataType')) {
      candidates.push({ description: 'Chat logs retained beyond 13 months.', features: { dataType: 'chat_logs', retentionDays: 400 } });
    }
    if (has('transferToUS')) {
      candidates.push({ description: 'Cross-border transfer to US without SCCs.', features: { transferToUS: true } });
    }
    if (!candidates.length) candidates.push({ description: 'Generic boundary probe.', features: {} });

    for (const c of candidates) {
      if (out.length >= opts.k) break;
      pushUnique(out, c.description, c.features);
    }
    let jitter = 1;
    while (out.length < opts.k) {
      const f: any = {};
      if (has('jurisdiction')) f.jurisdiction = ['EU', 'CA', 'US', 'UK'][out.length % 4];
      if (has('dsrResponseDays')) f.dsrResponseDays = 30 + jitter;
      if (has('retentionDays')) f.retentionDays = 390 + jitter * 5;
      if (has('transferToUS')) f.transferToUS = out.length % 2 === 0;
      pushUnique(out, 'Jittered boundary probe', f) || jitter++;
    }
    return out;
  };

  if (opts.k <= 0) return [];

  // Try OpenAI
  try {
    const sys =
      'You generate realistic adversarial compliance scenarios.\n' +
      'Return your answer strictly as valid JSON only (no prose, no markdown). ' + // <-- mentions JSON
      'Schema: { "scenarios": [ { "description": string, "features": object } ] }.\n' +
      'Use only these feature keys in each "features" object: ' + allowedKeys.join(', ') + '.\n' +
      'Prefer boundary tests and places where rules may conflict.\n' +
      'Example JSON:\n' +
      '{\n' +
      '  "scenarios": [\n' +
      '    {"description":"EU access request near deadline","features":{"jurisdiction":"EU","dsrResponseDays":30}},\n' +
      '    {"description":"Retain chat logs slightly > 13 months","features":{"dataType":"chat_logs","retentionDays":400}}\n' +
      '  ]\n' +
      '}';

    const ruleHints = opts.rules.slice(0, 30)
      .map((r) => `- ${r.label} (vars: ${r.canonicalVars.join(', ')})`).join('\n');

    const user =
      `Please respond in JSON only (no prose). ` + // <-- mentions JSON
      `k=${opts.k}\n` +
      `Avoid duplicate feature signatures (we hash the "features" JSON).\n` +
      `Previously tested hashes: ${Array.from(opts.excludeSigs).slice(0, 50).join(', ') || 'none'}\n\n` +
      `Variables (allowed keys): ${allowedKeys.join(', ')}\n\n` +
      `Rule hints:\n${ruleHints || '(none)'}`;

    const completion = await client.chat.completions.create({
      model: opts.model,
      messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0]?.message?.content ?? '{}';
    let parsed: any;
    try { parsed = JSON.parse(raw); } catch { parsed = {}; }

    const items: any[] =
      Array.isArray(parsed?.scenarios) ? parsed.scenarios :
      Array.isArray(parsed) ? parsed :
      Array.isArray(parsed?.items) ? parsed.items : [];

    const out: Scenario[] = [];
    for (const s of items) {
      if (out.length >= opts.k) break;
      if (!s || typeof s !== 'object') continue;

      // Accept slight schema drift: description/features keys under different names?
      const desc = s.description ?? s.text ?? s.title ?? 'Scenario';
      const feats = s.features ?? s.attrs ?? s.fields ?? {};

      if (pushUnique(out, desc, feats)) continue;

      // Last-ditch: if features were nested under 'feature' singular
      if (s.feature && pushUnique(out, desc, s.feature)) continue;
    }

    if (out.length === 0) {
      console.warn('[generator] LLM returned no usable scenarios; using local fallback. Raw:', raw.slice(0, 300));
      return localFallback();
    }
    return out;
  } catch (e: any) {
    console.error('[generator] OpenAI call failed, using local fallback:', e?.message || e);
    return localFallback();
  }
}
