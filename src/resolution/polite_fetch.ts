export type FetchResult = { url: string; ok: boolean; status: number; text?: string; error?: string };

function sleep(ms: number){ return new Promise(r => setTimeout(r, ms)); }

export async function fetchText(url: string, opts?: { timeoutMs?: number; minDelayMs?: number }): Promise<FetchResult> {
  const timeoutMs = opts?.timeoutMs ?? 12000;
  const minDelayMs = opts?.minDelayMs ?? 750;

  await sleep(minDelayMs);

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "user-agent": "IMG-Lead-Intelligence/1.0 (contact-mapper; +https://impulsemediagroup.com)",
        "accept": "text/html,application/xhtml+xml"
      }
    });
    const status = res.status;
    if (!res.ok) return { url, ok: false, status, error: "HTTP_" + status };
    const text = await res.text();
    return { url, ok: true, status, text };
  } catch (e: any) {
    return { url, ok: false, status: 0, error: e?.name === "AbortError" ? "TIMEOUT" : String(e?.message || e) };
  } finally {
    clearTimeout(t);
  }
}
