const jsonLogic = require('json-logic-js') as {
  apply: (rule: any, data?: any) => any;
  add_operation?: (name: string, fn: (...args: any[]) => any) => void;
  rm_operation?: (name: string) => void;
};
import { Rule, Verdict } from './types';

export function judgeScenario(features: Record<string, any>, rules: Rule[]): Verdict {
  const failing: string[] = [];
  let ambiguous = false;
  const trace: Record<string, any> = {};

  for (const r of rules) {
    if (r.ambiguous || !r.json) {
      ambiguous = true;
      continue;
    }
    try {
      const res = !!jsonLogic.apply(r.json, features);
      trace[r.id] = res ? 'PASS' : 'FAIL';
      if (!res) failing.push(r.id);
    } catch {
      trace[r.id] = 'EVAL_ERROR';
      failing.push(r.id);
    }
  }

  let state: Verdict['state'] = 'PASS';
  if (failing.length) state = 'FAIL';
  else if (ambiguous) state = 'AMBIGUOUS';

  return { scenarioId: '', state, passed: state === 'PASS', failingConstraintIds: failing, trace };
}

export function detectContradictions(rules: Rule[]): { pairs: [Rule, Rule][] } {
  const pairs: [Rule, Rule][] = [];
  for (let i = 0; i < rules.length; i++)
    for (let j = i + 1; j < rules.length; j++) {
      const a = rules[i],
        b = rules[j];
      if (a.ambiguous || b.ambiguous || !a.json || !b.json) continue;
      const overlap = a.canonicalVars.filter((v) => b.canonicalVars.includes(v));
      if (!overlap.length) continue;
      const aTxt = JSON.stringify(a.json),
        bTxt = JSON.stringify(b.json);
      const opp =
        (aTxt.includes('<=') && bTxt.includes('>=')) ||
        (aTxt.includes('>=') && bTxt.includes('<=')) ||
        (aTxt.includes('==') && bTxt.includes('!='));
      if (opp) pairs.push([a, b]);
    }
  return { pairs };
}
