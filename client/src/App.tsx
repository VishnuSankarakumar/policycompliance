import { useEffect, useMemo, useState } from "react";
import PolicyEditor from "./components/PolicyEditor";
import SinglePassIssues from "./components/SinglePassIssues";
import { createProject } from "./lib/api";
import "./styles.css";

export default function App() {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // create fresh project on load so server has state
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { id } = await createProject();
        if (mounted) setProjectId(id);
      } catch (e: any) {
        if (mounted) setError(e?.message || "Failed to create project");
      }
    })();
    return () => { mounted = false; };
  }, []);

  const title = useMemo(() => "Policy-Intel", []);

  async function handleNewProject() {
    try {
      const { id } = await createProject();
      setProjectId(id); // this clears results too
    } catch (e: any) {
      setError(e?.message || "Failed to create project");
    }
  }

  function handleRunClick() {
    if (!projectId) return;
    // run singlepassissues
    window.dispatchEvent(new CustomEvent("policyintel:run-analysis", { detail: { projectId } }));
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner container">
          <div className="brand">
            <span className="dot" />
            {title}
          </div>
          <div className="row">
            <a className="btn ghost" href="#editor">Policy</a>
            <a className="btn ghost" href="#results">Results</a>
            <button className="btn" onClick={handleNewProject}>New project</button>
          </div>
        </div>
      </header>

      <main className="container stack">
        <section id="editor" className="card pad">
          <div className="spread">
            <div className="card-title">Policy</div>
            <div className="row muted">
              <span className="badge">Paste policy → Save → Run</span>
            </div>
          </div>

          {projectId ? (
            <PolicyEditor projectId={projectId} />
          ) : (
            <div className="muted">Preparing project…</div>
          )}
          {error && <div className="badge danger" style={{ marginTop: 12 }}>{error}</div>}
        </section>

        <section id="results" className="card pad">
          <div className="spread">
            <div className="card-title">Results</div>
            <div className="row muted">
              <button className="btn primary" onClick={handleRunClick}>Run</button>
            </div>
          </div>

          {projectId ? (
            <SinglePassIssues key={projectId} projectId={projectId} />
          ) : (
            <div className="muted">Waiting for project…</div>
          )}
        </section>
      </main>
    </>
  );
}
