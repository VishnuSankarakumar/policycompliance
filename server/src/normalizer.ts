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
