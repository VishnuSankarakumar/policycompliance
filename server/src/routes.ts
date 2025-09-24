import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import pLimit from 'p-limit';

import { db, id, nowISO } from './store';
import { Clause, Hypothesis, PolicyDoc, PolicyProject, Rule, Scenario, StressJob, Verdict } from './types';
import { segmentPolicy } from './segmenter';
import { mineHypotheses } from './miner';
import { unifyVariables } from './unifier';
import { hypothesesToRules } from './normalizer';
import { buildGraph } from './graph';
import { generateScenarios } from './generator';
import { detectContradictions, judgeScenario } from './judge';
import { coverageStatus, undefinedVariables } from './detectors';

export function createApp(){
  const DEV = process.env.NODE_ENV!=='production';
  const app = express();
  app.use(cors({ origin: DEV ? true : ['https://your-frontend.example.com'] }));
  app.use(bodyParser.json({ limit:'1mb' }));

  app.post('/api/projects',(req,res)=>{
    const project: PolicyProject={ id:id(), name:String(req.body?.name||'Untitled'), createdAt:nowISO() };
    db.projects.set(project.id, project);
    db.policies.set(project.id, []);
    db.clauses.set(project.id, []);
    db.hypotheses.set(project.id, []);
    db.rules.set(project.id, []);
    db.scenarios.set(project.id, []);
    db.verdicts.set(project.id, []);
    db.seenFeatureSigs.set(project.id, new Set());
    res.json(project);
  });

  app.post('/api/policy',(req,res)=>{
    const { projectId, rawText } = req.body as { projectId:string; rawText:string };
    if(!db.projects.has(projectId)) return res.status(404).json({ error:'Project not found' });
    const doc: PolicyDoc = { projectId, versionId:id(), rawText, createdAt: nowISO() };
    db.policies.get(projectId)!.push(doc);
    const clauses: Clause[] = segmentPolicy(rawText);
    db.clauses.set(projectId, clauses);
    res.json({ doc, clausesCount: clauses.length });
  });

  app.post('/api/constraints/auto', async (req,res)=>{
    const { projectId } = req.body as { projectId:string };
    if(!db.projects.has(projectId)) return res.status(404).json({ error:'Project not found' });
    const model = process.env.OPENAI_MODEL || 'gpt-4o-2024-08-06';

    const clauses = db.clauses.get(projectId) || [];
    if(!clauses.length) return res.status(400).json({ error:'No clauses. Upload policy first.' });

    const batchSize=12;
    const chunks = Array.from({length:Math.ceil(clauses.length/batchSize)},(_,i)=>clauses.slice(i*batchSize,(i+1)*batchSize));

    const limit = pLimit(2);
    const minedBatches = await Promise.all(chunks.map(ch => limit(()=>mineHypotheses(ch, model))));
    const hyps: Hypothesis[] = minedBatches.flat();

    const unified = unifyVariables(hyps);
    db.hypotheses.set(projectId, unified);

    const rules: Rule[] = hypothesesToRules(projectId, unified);
    db.rules.set(projectId, rules);

    const graph = buildGraph(rules);
    const cov = coverageStatus(clauses, rules, unified);
    const undef = undefinedVariables(rules);

    res.json({ counts:{ clauses: clauses.length, hypotheses: unified.length, rules: rules.length, edges: graph.edges.length, uncoveredClauses: cov.uncovered.length, undefinedVars: undef.undefinedVars } });
  });

  app.post('/api/stress/start', async (req,res)=>{
    const { projectId, rounds=1, k=4 } = req.body as { projectId:string; rounds?:number; k?:number };
    if(!db.projects.has(projectId)) return res.status(404).json({ error:'Project not found' });
    const model = process.env.OPENAI_MODEL || 'gpt-4o-2024-08-06';

    const job: StressJob = { id:id(), projectId, status:'running', createdAt:nowISO(), params:{ rounds, k, model } };
    db.jobs.set(job.id, job);
    res.json({ jobId: job.id, status: job.status });

    const rules = db.rules.get(projectId) || [];
    const seen = db.seenFeatureSigs.get(projectId)!;
    const scenarios: Scenario[] = db.scenarios.get(projectId) || [];
    const verdicts: Verdict[] = db.verdicts.get(projectId) || [];

    try{
      for(let round=1; round<=rounds; round++){
        const batch = await generateScenarios({ projectId, rules, k, round, excludeSigs:seen, model });
        for(const sc of batch){
          const v = judgeScenario(sc.features, rules);
          v.scenarioId = sc.id;
          scenarios.push(sc);
          verdicts.push(v);
        }
      }
      db.scenarios.set(projectId, scenarios);
      db.verdicts.set(projectId, verdicts);
      db.jobs.set(job.id, { ...job, status:'done' });
    } catch(e:any){
      console.error('[stress] job failed:', e);
      db.jobs.set(job.id, { ...job, status:'error', error:e?.message||'Unknown error' });
    }
  });

  app.get('/api/stress/status/:jobId',(req,res)=>{
    const job = db.jobs.get(req.params.jobId);
    if(!job) return res.status(404).json({ error:'Job not found' });
    res.json({ status: job.status, error: job.error });
  });

  app.get('/api/results',(req,res)=>{
    const { projectId } = req.query as { projectId:string };
    if(!db.projects.has(projectId)) return res.status(404).json({ error:'Project not found' });
    res.json({
      scenarios: db.scenarios.get(projectId) || [],
      verdicts: db.verdicts.get(projectId) || [],
      rules: db.rules.get(projectId) || []
    });
  });

  return app;
}
