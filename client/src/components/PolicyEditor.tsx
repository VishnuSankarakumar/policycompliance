import { useEffect, useRef, useState } from "react";
import { getPolicy, savePolicy } from "../lib/api";

type Props = { projectId: string };

export default function PolicyEditor({ projectId }: Props) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const existing = await getPolicy(projectId); // returns {} if route missing
        if (mounted && existing?.rawText) setText(existing.rawText);
      } catch { /* ignore */ }
    })();
    return () => { mounted = false; };
  }, [projectId]);

  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight + 6, 1200) + "px";
  }, [text]);

  async function onSave() {
    setStatus("saving");
    try {
      await savePolicy(projectId, text);
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 1600);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 2200);
    }
  }

  return (
    <div className="stack">
      <textarea
        ref={taRef}
        className="textarea"
        placeholder="Paste the full policy text here…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="spread">
        <div className="muted">
          {text.length.toLocaleString()} chars • {text.split(/\s+/).filter(Boolean).length.toLocaleString()} words
        </div>
        <div className="row">
          {status === "saving" && <span className="badge">Saving…</span>}
          {status === "saved"  && <span className="badge ok">Saved</span>}
          {status === "error"  && <span className="badge danger">Save failed</span>}
          <button className="btn primary" onClick={onSave}>Save policy</button>
        </div>
      </div>
    </div>
  );
}
