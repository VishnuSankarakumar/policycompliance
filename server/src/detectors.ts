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
