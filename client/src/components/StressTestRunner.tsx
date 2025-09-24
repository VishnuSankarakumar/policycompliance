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
