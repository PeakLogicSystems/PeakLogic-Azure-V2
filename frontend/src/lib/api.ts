import { fetchAuthSession } from 'aws-amplify/auth';

const BASE = import.meta.env.VITE_API_URL as string;

async function token(): Promise<string> {
  const session = await fetchAuthSession();
  return session.tokens?.idToken?.toString() ?? '';
}

export async function apiFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const jwt = await token();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: jwt,
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export const api = {
  get:    <T>(path: string)                    => apiFetch<T>(path),
  post:   <T>(path: string, body: unknown)     => apiFetch<T>(path, { method: 'POST',   body: JSON.stringify(body) }),
  put:    <T>(path: string, body: unknown)     => apiFetch<T>(path, { method: 'PUT',    body: JSON.stringify(body) }),
  delete: <T>(path: string)                    => apiFetch<T>(path, { method: 'DELETE' }),
};
