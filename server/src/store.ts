// server/src/store.ts
import { randomUUID } from 'node:crypto';
import { Clause, PolicyDoc, PolicyProject, UUID } from './types';

export const db = {
  projects: new Map<UUID, PolicyProject>(),
  policies: new Map<UUID, PolicyDoc[]>(),
  clauses: new Map<UUID, Clause[]>(), // kept so citations can map to clause ids if you add segmentation later
};

export const id = () => randomUUID();
export const nowISO = () => new Date().toISOString();
