import { useState } from 'react';
import { post } from '../lib/api';

export default function MiningControls({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const [status, setStatus] = useState('');
  const mine = async () => {
    setStatus('Mining…');
    await post('/api/constraints/auto', { projectId });
    setStatus('Done ✅');
    onDone();
  };
  return (
    <section className="space-y-2">
      <h3 className="text-lg font-semibold">Auto-extract Rules (with citations)</h3>
      <button className="px-3 py-2 bg-black text-white rounded" onClick={mine}>Run Miner</button>
      <span className="ml-2 text-sm">{status}</span>
    </section>
  );
}
