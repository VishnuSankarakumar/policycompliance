import { z } from 'zod';
export type UUID = string;
export type PolicyProject = { id: UUID; name: string; createdAt: string; };
export type PolicyDoc = { projectId: UUID; versionId: UUID; rawText: string; createdAt: string; };
export type Clause = { id: string; text: string; page?: number; start: number; end: number; tier: 'main'|'appendix'|'footnote'; };
export const FeatureSchema = z.object({
  jurisdiction: z.string().optional(),
  dsrResponseDays: z.number().int().min(0).optional(),
  retentionDays: z.number().int().min(0).optional(),
  userAge: z.number().int().min(0).nullable().optional(),
  parentalConsent: z.boolean().optional(),
  transferToUS: z.boolean().optional(),
  dataType: z.string().optional(),
  purpose: z.string().optional()
});
export type Features = z.infer<typeof FeatureSchema>;
export type EvidenceSpan = { clauseId: string; start: number; end: number; quote: string };
export type Hypothesis = { id: UUID; label: string; claim: string; evidence: EvidenceSpan[]; variables: string[]; canonicalVars: string[]; formal?: any|null; ambiguous: boolean; confidence: number; };
export type Rule = { id: UUID; projectId: UUID; label: string; evidence: EvidenceSpan[]; canonicalVars: string[]; json?: any; ambiguous: boolean; confidence: number; tier: 'main'|'appendix'|'footnote'; };
export type Scenario = { id: UUID; projectId: UUID; description: string; features: Record<string, any>; round: number; };
export type Verdict = { scenarioId: UUID; state: 'PASS'|'FAIL'|'AMBIGUOUS'; passed: boolean; failingConstraintIds: UUID[]; trace?: any; };
export type StressJob = { id: UUID; projectId: UUID; status: 'queued'|'running'|'done'|'error'; createdAt: string; error?: string; params: { rounds: number; k: number; model?: string } };
