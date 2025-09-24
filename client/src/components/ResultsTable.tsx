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
