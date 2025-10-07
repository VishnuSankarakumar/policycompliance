// server/src/routes.ts
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { db, id, nowISO } from "./store";
import { runGlobalSimple } from "./globalSimple";

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(bodyParser.json({ limit: "1mb" }));

  // --- Projects (minimal bootstrap)
  app.post("/api/projects", (_req, res) => {
    const proj = {
      id: id(),
      name: "Policy Intel",
      createdAt: nowISO(),
    };
    db.projects.set(proj.id, proj);

    // Keep only the maps we actually read elsewhere
    db.policies.set(proj.id, []);
    db.clauses.set(proj.id, []); // optional; kept for compatibility if globalSimple wants it
    res.json({ id: proj.id });
  });

  // --- Policy: save raw text (no segmentation)
  app.post("/api/policy", (req, res) => {
    const { projectId, rawText } = (req.body || {}) as {
      projectId: string;
      rawText: string;
    };
    if (!projectId || !db.projects.has(projectId)) {
      return res.status(404).json({ error: "Project not found" });
    }

    const version = {
      projectId,
      versionId: id(),
      rawText: String(rawText || ""),
      createdAt: nowISO(),
    };

    const history = db.policies.get(projectId) || [];
    db.policies.set(projectId, [...history, version]);

    // We no longer segment; keep clauses empty to avoid legacy paths
    db.clauses.set(projectId, []);
    res.json({ versionId: version.versionId });
  });

  // --- Policy: load latest (used by editor)
  app.get("/api/policy", (req, res) => {
    const projectId = String(req.query.projectId || "");
    if (!projectId || !db.projects.has(projectId)) {
      return res.json({});
    }
    const versions = db.policies.get(projectId) || [];
    const latest = versions[versions.length - 1];
    res.json({ rawText: latest?.rawText || "" });
  });

  // --- Single-pass (recursive) global analysis on raw text
  app.post("/api/issues/global_simple", async (req, res) => {
    const { projectId } = (req.body || {}) as { projectId: string };
    if (!projectId || !db.projects.has(projectId)) {
      return res.status(404).json({ error: "Project not found" });
    }

    const versions = db.policies.get(projectId) || [];
    const latest = versions[versions.length - 1];
    if (!latest?.rawText) {
      return res.status(400).json({ error: "No policy text saved for this project" });
    }

    try {
      const model = process.env.OPENAI_MODEL || "gpt-4o-2024-08-06";
      // Clauses kept empty; globalSimple should operate on raw text
      const clauses = db.clauses.get(projectId) || [];
      const issues = await runGlobalSimple({ rawText: latest.rawText, clauses, model });
      res.json({ total: issues.length, issues });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "analysis failed" });
    }
  });

  return app;
}
