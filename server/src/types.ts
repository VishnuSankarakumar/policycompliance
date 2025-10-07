// server/src/types.ts
export type UUID = string;

export type PolicyProject = {
  id: UUID;
  name: string;
  createdAt: string;
};

export type PolicyDoc = {
  projectId: UUID;
  versionId: UUID;
  rawText: string;
  createdAt: string;
};

// not in use
export type Clause = {
  id: string;
  text: string;
  start: number;
  end: number;
  page?: number;
  tier?: 'main' | 'appendix' | 'footnote';
};
