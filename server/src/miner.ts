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

function sanitizeHypotheses(items: any[], clauses: Clause[]): Hypothesis[] {
  const byId = new Map(clauses.map(c => [c.id, c]));
  const out: Hypothesis[] = [];

  for (const h of items || []) {
    // Normalize evidence array
    const rawEvi: any[] = Array.isArray(h.evidence) ? h.evidence : [];
    const evi: EvidenceSpan[] = [];

    for (const e of rawEvi) {
      const c = byId.get(String(e.clauseId));
      if (!c) continue;

      const quote = String(e.quote ?? '').trim();
      let startAbs = Number.isFinite(e.start) ? Number(e.start) : NaN;
      let endAbs = Number.isFinite(e.end) ? Number(e.end) : NaN;

      // If offsets are missing or wrong, try to derive them from the quote text
      if (!quote) continue;

      const hay = c.text;
      let relIdx = hay.indexOf(quote);
      if (relIdx < 0) {
        // try a looser search (compress whitespace)
        const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
        const hayN = norm(hay);
        const qN = norm(quote);
        const relIdxN = hayN.indexOf(qN);
        if (relIdxN >= 0) {
          // rebuild absolute index by mapping normalized positions back (best-effort)
          // fallback: accept without precise offsets
          relIdx = relIdxN; // best effort
        }
      }

      if (Number.isNaN(startAbs) || Number.isNaN(endAbs) || endAbs <= startAbs) {
        if (relIdx >= 0) {
          startAbs = c.start + relIdx;
          endAbs = startAbs + quote.length;
        } else {
          // As a last resort, accept evidence without offsets but with the quote
          startAbs = c.start;
          endAbs = c.end;
        }
      }

      // Final guard: ensure the quoted span is indeed inside the clause text (best-effort)
      if (startAbs < c.start) startAbs = c.start;
      if (endAbs > c.end) endAbs = c.end;

      evi.push({
        clauseId: c.id,
        start: startAbs,
        end: endAbs,
        quote
      });
    }

    if (!evi.length) continue;

    out.push({
      id: id(),
      label: String(h.label || h.claim || 'Claim'),
      claim: String(h.claim || h.label || ''),
      evidence: evi,
      variables: Array.isArray(h.variables) ? h.variables.map(String) : [],
      canonicalVars: [],
      formal: h.formal ?? null,
      ambiguous: Boolean(h.ambiguous) || !h.formal,
      confidence: Math.max(0, Math.min(1, Number(h.confidence ?? 0.5)))
    });
  }
  return out;
}
