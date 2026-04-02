const BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";

// ─── Token storage ───────────────────────────────────────────────────────────
interface Tokens {
  memberToken: string;
  memberId: string;
  organiserToken?: string;
}

export function setTokens(joinToken: string, tokens: Tokens) {
  localStorage.setItem(`triphaus:${joinToken}`, JSON.stringify(tokens));
}

export function getTokens(joinToken: string): Tokens | null {
  const raw = localStorage.getItem(`triphaus:${joinToken}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ─── HTTP helpers ────────────────────────────────────────────────────────────
function headers(joinToken?: string): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (!joinToken) return h;

  const tokens = getTokens(joinToken);
  if (tokens?.memberToken) h["x-member-token"] = tokens.memberToken;
  if (tokens?.organiserToken) h["x-organiser-token"] = tokens.organiserToken;
  return h;
}

async function handleRes(res: Response) {
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  get: (path: string, joinToken?: string) =>
    fetch(`${BASE}${path}`, { headers: headers(joinToken) }).then(handleRes),

  post: (path: string, body: unknown, joinToken?: string) =>
    fetch(`${BASE}${path}`, {
      method: "POST",
      headers: headers(joinToken),
      body: JSON.stringify(body),
    }).then(handleRes),
};
