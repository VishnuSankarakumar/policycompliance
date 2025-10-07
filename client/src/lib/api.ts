/* check if base URL is custom, otherwise use localhost 4000 */
const BASE =
  (typeof import.meta !== "undefined" && (import.meta as any).env && (import.meta as any).env.VITE_API_URL) ||
  "http://localhost:4000";

async function req<T>(method: string, url: string, body?: unknown): Promise<T> { 
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });

  /* display error if thrown */
  if (!res.ok) {
    const msg = await res.text().catch(() => `${res.status} ${res.statusText}`);
    throw new Error(msg || `${res.status} ${res.statusText}`);
  }

  /* 204/empty/non-JSON response tolerance*/
  const ct = res.headers.get("content-type") || "";
  if (res.status === 204) return undefined as any;
  const text = await res.text().catch(() => "");
  if (!text) return {} as any;
  if (!ct.includes("application/json")) {
    try { return JSON.parse(text) as T; } catch { return {} as any; }
  }
  try { return JSON.parse(text) as T; } catch { return {} as any; }
}

/* convenience */
export const get = <T,>(u: string) => req<T>("GET", u);
export const post = <T,>(u: string, b?: unknown) => req<T>("POST", u, b);

/* try to fetch saved policy text, if doesnt exist return {} */
export async function getPolicy(projectId: string): Promise<{ rawText?: string }> {
  try {
    return await get<{ rawText?: string }>(`/api/policy?projectId=${encodeURIComponent(projectId)}`);
  } catch {
    return {};
  }
}

/* save policy text to project */
export function savePolicy(projectId: string, rawText: string) {
  return post(`/api/policy`, { projectId, rawText });
}

/* create fresh project on server, return { id } */
export function createProject(): Promise<{ id: string }> {
  return post(`/api/projects`);
}

/* run analysis  */
export async function runGlobalAnalysis(projectId: string) {
  // main loop
  try {
    return await post(`/api/issues/global_simple`, { projectId });
  } catch {
    // fallback
    return post(`/api/global/simple`, { projectId });
  }
}

