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
