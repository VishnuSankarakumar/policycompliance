const BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';
async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${url}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
export const get = <T,>(u: string) => req<T>('GET', u);
export const post = <T,>(u: string, b?: unknown) => req<T>('POST', u, b);
