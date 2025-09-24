import { useState } from 'react';
import { post } from '../lib/api';

export default function PolicyEditor({ projectId }: { projectId: string }) {
  const [text, setText] = useState('Paste policy text here...');
  const save = async () => { await post('/api/policy', { projectId, rawText: text }); alert('Policy saved'); };
  return (
    <section className="space-y-2">
      <h3 className="text-lg font-semibold">Policy</h3>
      <textarea className="w-full h-40 border p-2" value={text} onChange={e=>setText(e.target.value)} />
      <div className="flex gap-2"><button className="px-3 py-2 bg-black text-white rounded" onClick={save}>Save Policy</button></div>
    </section>
  );
}
