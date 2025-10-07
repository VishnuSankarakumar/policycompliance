import { useEffect, useState } from 'react';
import { post } from '../lib/api';

type Issue = {
  id: string;
  type: string;
  title: string;
  explanation: string;
  severity: 'high'|'medium'|'low';
  certainty: 'llm';
  implicatedHypothesisIds: string[];
  citations: { clauseId?: string; quote: string }[];
};

const pill = (bg:string, color:string) => ({
  display:'inline-block', padding:'2px 8px', borderRadius:999,
  fontSize:12, fontWeight:700, marginRight:6, background:bg, color,
  border: '1px solid var(--stroke)'
});
const sev = (s:'high'|'medium'|'low') =>
  s==='high'   ? pill('color-mix(in oklab, var(--danger) 20%, transparent)', 'var(--danger)') :
  s==='medium' ? pill('color-mix(in oklab, var(--warn)   20%, transparent)', 'var(--warn)')   :
                 pill('color-mix(in oklab, var(--ok)     18%, transparent)', 'var(--ok)');

const card = { background:'var(--panel)', border:'1px solid var(--stroke)', borderRadius:12, padding:12, color:'var(--text)' } as const;
const citationCard = { background:'var(--elev)', border:'1px solid var(--stroke)', borderRadius:8, padding:8, fontSize:12, color:'var(--text)' } as const;

export default function SinglePassIssues({ projectId }: { projectId: string }) {
  const [data, setData] = useState<{ total:number; issues: Issue[] }|null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string|null>(null);

  const run = async () => {
    try {
      setLoading(true); setErr(null);
      const r = await post<{ total:number; issues: Issue[] }>('/api/issues/global_simple', { projectId });
      setData(r);
    } catch (e:any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  // Listen for external "Run" requests from the Results header button
  useEffect(() => {
    const handler = (evt: Event) => {
      const anyEvt = evt as any;
      const pid = anyEvt?.detail?.projectId as string | undefined;
      if (pid && pid === projectId) run();
    };
    window.addEventListener('policyintel:run-analysis', handler as EventListener);
    return () => {
      window.removeEventListener('policyintel:run-analysis', handler as EventListener);
    };
  }, [projectId]);

  return (
    <section style={{ display:'grid', gap:12 }}>
      {/* Status row (run button moved to Results header in App.tsx) */}
      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
        {loading && <span className="badge">Analyzing…</span>}
        {err && <span className="badge danger">Error: {err}</span>}
        {data && <span className="badge">{data.total} issues</span>}
      </div>

      {(data?.issues || []).map(i => (
        <div key={i.id} style={card}>
          <div style={{ display:'flex', justifyContent:'space-between' }}>
            <div>
              <span style={sev(i.severity)}>{i.severity}</span>
              <span style={{ ...pill('var(--chip)','var(--muted)'), textTransform:'uppercase' }}>{i.type}</span>
            </div>
          </div>

          <div style={{ marginTop:6, fontSize:16, fontWeight:700 }}>{i.title}</div>
          <div style={{ marginTop:6, fontSize:14, color:'var(--text)' }}>{i.explanation}</div>

          {i.citations && i.citations.length > 0 && (
            <details style={{ marginTop:8 }}>
              <summary className="btn" style={{ background:'transparent' }}>
                citations ({i.citations.length})
              </summary>
              <div style={{ display:'grid', gap:6, marginTop:6 }}>
                {i.citations.slice(0,8).map((c, idx) => (
                  <div key={idx} style={citationCard}>
                    {c.clauseId && (
                      <div style={{ fontFamily:'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace', color:'var(--muted)', marginBottom:6 }}>
                        {c.clauseId}
                      </div>
                    )}
                    <div style={{ whiteSpace:'pre-wrap' }}>“{c.quote}”</div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      ))}
    </section>
  );
}
