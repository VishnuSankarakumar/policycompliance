import OpenAI from 'openai';
import { Clause } from './types';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type SimpleIssue = {
  id: string;
  type: string;
  title: string;
  explanation: string;
  severity?: 'high' | 'medium' | 'low';
  certainty: 'llm';
  implicatedHypothesisIds: string[];
  citations: { clauseId?: string; quote: string }[];
  meta?: { pass: number };
};


const MAX_PASSES = 8;                  // stop earlier if no progress made
const POLICY_LIMIT = 110_000;          // per-call limit
const MAX_ISSUES_PER_PASS = 250;       
const MAX_CITES_PER_ISSUE = 18;        
const MAX_QUOTES_FOR_REDACT = 120;     
const MAX_QUOTE_LEN = 220;             


const norm  = (s: string) => String(s || '').replace(/\s+/g, ' ').trim();
const kebab = (s: string) => norm(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

//unused at the moment
function mapQuoteToClauseId(quote: string, clauses: Clause[]): string | undefined {
  if (!clauses?.length) return undefined;
  const q = norm(quote);
  for (const c of clauses) if (norm(c.text).includes(q)) return c.id;
  const ql = q.toLowerCase();
  for (const c of clauses) if (norm(c.text).toLowerCase().includes(ql)) return c.id;
  return undefined;
}

// if severity omitted by llm use this - trivial severity assignment
function fallbackSeverity(type: string, title: string, explanation: string): 'high'|'medium'|'low' {
  const txt = `${type} ${title} ${explanation}`.toLowerCase();

  const HIGH = [
    'contradict', 'conflict', 'inconsist', 'violate', 'breach', 'illegal', 'non-compliance',
    'children', 'minor', 'under 13', 'security', 'sell identifiers', 'share identifiers',
    'targeted advertising', 'cross-context', 'data residency', 'transfer', 'indefinite retention',
  ];
  const MED = [
    'vague', 'ambigu', 'undefined', 'lack of detail', 'missing detail',
    'unclear', 'not specify', 'not specified', 'open-ended', 'as long as necessary',
    'scope mismatch', 'definition gap', 'loophole',
  ];

  if (HIGH.some(k => txt.includes(k))) return 'high';
  if (MED.some(k => txt.includes(k)))  return 'medium';
  return 'low';
}

// first analysis pass
async function enumerateOnText({
  policyText,
  model,
  passIndex,
}: {
  policyText: string;
  model: string;
  passIndex: number;
}): Promise<SimpleIssue[]> {
  const system = `You are auditing a policy excerpt (it may be the full text or a subset). Remember that issues may not be as simple as 'vagueness' or 'ambiguous'.
Do NOT raise meta-findings like "incomplete policy" just because you see a subset or just a heading.

Return JSON ONLY:
{"issues":[
  {
    "id":"string",
    "type":"kebab-case label you will REUSE consistently (do NOT invent near-synonyms), append an '-L' (for local) to help identify single-clause/local issues",
    "title":"short human-readable title",
    "explanation":"one or two sentences: what is wrong and why it matters",
    "severity":"high|medium|low",  // REQUIRED
    "citations":[
      {"quote":"exact text copied verbatim from THIS text (<=240 chars)"},
      {"quote":"additional quote if helpful"}
    ]
  }
]}

Your first responsibility is to find issues that require linking TWO OR MORE distinct statements that may be far apart in the text. Return these cross-dependency issues FIRST, before single-clause issues.

Cross-dependency patterns to search for (use these exact kebab-case labels for "type" when they fit):
- contradiction            → A asserts X while another place asserts not-X.
- guarantee-vs-exception   → a promise/requirement that is undercut by an explicit carve-out or exemption.
- retention-vs-deletion    → deletion/purge guarantees that conflict with backups, replicas, archives, snapshots, or restore capabilities.
- channel-bypass           → approved/required channels or processes undermined by an alternative allowed path (e.g., email vs. SFTP).
- trust-bypass             → device/user/trust constraints undermined by an emergency/partner/break-glass path.
- scope-mismatch           → absolute “never/always” statements vs. scoped allowances that overlap in time or scope.

Requirements for cross-dependency issues:
- Include ≥2 citations when both sides are needed to prove the linkage (each citation must be a verbatim quote from the provided text).
- Do not rely on proximity; it is acceptable if the relevant statements are in different sections.
- Do not speculate about missing text or outside facts; analyze ONLY what is present here.
- If only one side of a dependency is present in the excerpt, do NOT infer the missing side; skip raising that issue.

After enumerating cross-dependency issues, you may add single-clause findings (vagueness/ambiguity/etc.) as separate issues, as long as you keep labels stable and do not duplicate the same problem across multiple issues.


Severity rubric (choose the single best fit, do not default to medium):
- "high"   → contradictions, violations, children/teen data risks, security/transfer risks, retention clearly unlawful or conflicting.
- "medium" → vagueness/ambiguity, definition gaps, missing details, open-ended retention (“as long as necessary”), unclear scope/application.
- "low"    → minor clarity/format issues with limited compliance impact.

GENERAL Rules:
- Analyze ONLY the text you receive; do NOT cite outside it.
- List AS MANY distinct issues as you find (one citation is enough, but if two are required to evidence a two channel issue e.g. contradiction, then so be it).
- If multiple snippets demonstrate the same issue, add more citations in that single issue.
- Keep labels stable (kebab-case). Keep titles and explanations concrete.`;

  const user = { policyText: policyText.slice(0, POLICY_LIMIT) };

  try {
    const r = await client.chat.completions.create({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify(user) },
      ],
    });

    const parsed = JSON.parse(r.choices[0]?.message?.content || '{}');
    const arr: any[] = Array.isArray(parsed?.issues) ? parsed.issues : [];

    const out: SimpleIssue[] = [];
    for (const [i, f] of arr.slice(0, MAX_ISSUES_PER_PASS).entries()) {
      const type = kebab(f.type || 'unspecified');
      const title = norm(f.title || '');
      const explanation = norm(f.explanation || '');
      let severity = (['high','medium','low'].includes((f.severity || '').toLowerCase())
        ? (f.severity as 'high'|'medium'|'low')
        : undefined);

      const citationsIn: any[] = Array.isArray(f.citations) ? f.citations : [];
      if (!title || !explanation || citationsIn.length === 0) continue;

      const cites = citationsIn
        .slice(0, MAX_CITES_PER_ISSUE)
        .map(c => ({ quote: String(c.quote || '').slice(0, MAX_QUOTE_LEN) }))
        .filter(c => !!c.quote);

      if (cites.length === 0) continue;

      if (!severity) severity = fallbackSeverity(type, title, explanation);

      out.push({
        id: String(f.id || `PASS${passIndex}-I${i}`),
        type,
        title,
        explanation,
        severity,
        certainty: 'llm',
        implicatedHypothesisIds: [],
        citations: cites,
        meta: { pass: passIndex },
      });
    }
    return out;
  } catch {
    return [];
  }
}

// redact cited sentences
async function redactTextUsingLLM({
  originalText,
  quotes,
  model,
}: {
  originalText: string;
  quotes: string[];
  model: string;
}): Promise<string> {
  // keep a reasonable list size
  const list = quotes.slice(0, MAX_QUOTES_FOR_REDACT).map(q => q.slice(0, MAX_QUOTE_LEN));

  const system = `You are a careful redactor. Remove sentences that contain any of the provided QUOTES (case-insensitive, whitespace-insensitive).
- Treat a "sentence" as a span ending with '.', '!', '?', or a newline break.
- After removing sentences, if a section heading has no remaining content below it, remove that orphan heading too.
- Keep EVERY other character of the original text exactly as-is (do not rewrite or reflow).
- Preserve original order and newlines.
Return JSON ONLY: {"remaining":"<the original text with those sentences (and any now-orphaned headings) removed>"}.
If nothing remains, return an empty string.`;

  const user = {
    original: originalText.slice(0, POLICY_LIMIT),
    quotes: list,
  };

  try {
    const r = await client.chat.completions.create({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify(user) },
      ],
    });
    const parsed = JSON.parse(r.choices[0]?.message?.content || '{}');
    const remaining = typeof parsed?.remaining === 'string' ? parsed.remaining : '';
    return remaining;
  } catch {
    return originalText; // emergency fallback - don't change text if redaction fails
  }
}

// overall main loop
export async function runGlobalSimple({
  rawText,
  clauses,
  model,
}: {
  rawText: string;
  clauses: Clause[];
  model: string;
}): Promise<SimpleIssue[]> {
  let current = rawText.length > POLICY_LIMIT ? rawText.slice(0, POLICY_LIMIT) : rawText;
  const all: SimpleIssue[] = [];
  //will loop until max passes reached OR if no more issues found at any point during loop
  for (let pass = 1; pass <= MAX_PASSES; pass++) {
    const issues = await enumerateOnText({ policyText: current, model, passIndex: pass });
    all.push(...issues);

    // collect all quotes from this pass
    const quotes = issues.flatMap(i => i.citations.map(c => c.quote));
    if (quotes.length === 0) break; // nothing to redact in next pass (no more issues detected), so safe to break loop

    // ask LLM to redact cited sentences
    const remaining = await redactTextUsingLLM({ originalText: current, quotes, model });

    // stop if nothing changed or nothing left, in both cases no more issues can be found
    if (!remaining.trim() || remaining === current) break;
    current = remaining;
  }

  // clause id mapping CURRENTLY UNUSED!!!!!
  const mapped = all.map(i => ({
    ...i,
    citations: i.citations.map(c => {
      const clauseId = mapQuoteToClauseId(c.quote, clauses);
      return clauseId ? { clauseId, quote: c.quote } : { quote: c.quote };
    }),
  }));

  return mapped;
}