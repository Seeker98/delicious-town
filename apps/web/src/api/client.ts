import type { ApiResponse } from '@dt/shared';
import { deviceId } from './device';

export class ApiError extends Error {
  readonly code: string;
  readonly params: Record<string, unknown>;

  constructor(code: string, params: Record<string, unknown> = {}) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
    this.params = params;
  }
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export function createApiClient(
  fetchImpl: FetchLike = (url, init) => fetch(url, init),
  base: string = import.meta.env.VITE_API_BASE ?? '',
) {
  async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { 'x-device-id': deviceId() };
    if (method === 'POST') {
      headers['content-type'] = 'application/json';
      headers['idempotency-key'] = crypto.randomUUID();
    }
    let res: Response;
    try {
      res = await fetchImpl(base + path, {
        method,
        credentials: 'include',
        headers,
        body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
      });
    } catch {
      throw new ApiError('NETWORK');
    }
    let payload: ApiResponse<T>;
    try {
      payload = (await res.json()) as ApiResponse<T>;
    } catch {
      throw new ApiError('NETWORK', { status: res.status });
    }
    if (!payload.ok) throw new ApiError(payload.code, payload.params ?? {});
    return payload.data;
  }

  return {
    get: <T>(path: string) => request<T>('GET', path),
    post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  };
}

export const api = createApiClient();
