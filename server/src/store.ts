import { randomUUID } from 'node:crypto';
import { Clause, Hypothesis, PolicyDoc, PolicyProject, Rule, Scenario, StressJob, UUID, Verdict } from './types';

export const db = {
  projects: new Map<UUID, PolicyProject>(),
  policies: new Map<UUID, PolicyDoc[]>(),
  clauses: new Map<UUID, Clause[]>(),
  hypotheses: new Map<UUID, Hypothesis[]>(),
  rules: new Map<UUID, Rule[]>(),
  scenarios: new Map<UUID, Scenario[]>(),
  verdicts: new Map<UUID, Verdict[]>(),
  jobs: new Map<UUID, StressJob>(),
  seenFeatureSigs: new Map<UUID, Set<string>>()
};

export const id = () => randomUUID();
export const nowISO = () => new Date().toISOString();
