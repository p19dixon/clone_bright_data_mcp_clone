import { fetch as undiciFetch } from 'undici';

export type FetchParameters = Parameters<typeof undiciFetch>;

export type FetchOptions = FetchParameters[1] & { timeoutMs?: number };

export async function fetchWithTimeout(
  input: FetchParameters[0],
  { timeoutMs = 20000, ...init }: FetchOptions = {}
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await undiciFetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
