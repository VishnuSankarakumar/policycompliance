import { useEffect, useState } from 'react';
import { post } from './lib/api';
import PolicyEditor from './components/PolicyEditor';
import MiningControls from './components/MiningControls';
import StressTestRunner from './components/StressTestRunner';
import ResultsTable from './components/ResultsTable';

export default function App(){
  const [projectId,setProjectId]=useState('');
  const [refreshKey,setRefreshKey]=useState(0);
  useEffect(()=>{(async()=>{
    const proj=await post<{id:string;name:string}>('/api/projects',{name:'Policy Intel'});
    setProjectId(proj.id);
  })();},[]);
  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-bold">Policy Intel — Clause-Aware Stress Testing</h1>
      {projectId && <PolicyEditor projectId={projectId}/>}
      {projectId && <MiningControls projectId={projectId} onDone={()=>setRefreshKey(k=>k+1)}/>}
      {projectId && <StressTestRunner projectId={projectId} onRefresh={()=>setRefreshKey(k=>k+1)}/>}
      {projectId && <ResultsTable projectId={projectId} refreshKey={refreshKey}/>}
    </div>
  );
}
