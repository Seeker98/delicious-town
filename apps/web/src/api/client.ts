import type { ApiResponse, GameEvent } from '@dt/shared';
import { AB_HEADERS, ErrorCode } from '@dt/shared';
import { CLIENT_BUILD, resetSignKey, signHeaders } from './antibot';
import { markPressBusy } from '../utils/pressBusy';
import { uuid } from '../utils/uuid';
import { deviceId } from './device';

type EventsListener = (events: GameEvent[]) => void;
let eventsListener: EventsListener | null = null;
/** 写操作返回的得失提示统一交给这个回调（App 里接到提示组件上） */
export function setEventsListener(fn: EventsListener | null): void {
  eventsListener = fn;
}

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
  /** anonymous：公开接口不带 Cookie 和自定义头，浏览器不发预检，服务端可以回 *（开放接口，问题记录 142） */
  async function request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    anonymous = false,
    retried = false,
  ): Promise<T> {
    const headers: Record<string, string> = anonymous
      ? {}
      : { 'x-device-id': deviceId(), [AB_HEADERS.build]: CLIENT_BUILD };
    const bodyText = method === 'POST' ? JSON.stringify(body ?? {}) : undefined;
    // 写请求：刚点的按钮标“处理中”（界面第二批）
    const unbusy = method === 'POST' ? markPressBusy() : null;
    try {
      if (bodyText !== undefined) {
        headers['content-type'] = 'application/json';
        const nonce = uuid();
        headers['idempotency-key'] = nonce;
        // 防脚本（2026-10-25）：写请求带签名；取不到密钥（没登录）就不带
        if (!anonymous)
          Object.assign(
            headers,
            await signHeaders(fetchImpl, base, { method: 'POST', path, bodyText, nonce }),
          );
      }
      return await send<T>(method, path, bodyText, anonymous, headers);
    } catch (e) {
      // 签名被拒（重新登录换了密钥、页面放太久时钟漂了）：重取密钥、换新随机数重发一次
      if (
        !retried &&
        bodyText !== undefined &&
        !anonymous &&
        e instanceof ApiError &&
        e.code === ErrorCode.CLIENT_UNVERIFIED &&
        ['bad', 'missing', 'stale'].includes(String(e.params.reason))
      ) {
        resetSignKey();
        return await request<T>(method, path, body, anonymous, true);
      }
      throw e;
    } finally {
      unbusy?.();
    }
  }

  async function send<T>(
    method: 'GET' | 'POST',
    path: string,
    bodyText: string | undefined,
    anonymous: boolean,
    headers: Record<string, string>,
  ): Promise<T> {
    let res: Response;
    try {
      res = await fetchImpl(base + path, {
        method,
        credentials: anonymous ? 'omit' : 'include',
        headers,
        body: bodyText,
      });
    } catch {
      throw new ApiError('NETWORK');
    }
    // 服务器让重新取签名密钥（签名对不上）
    if (res.headers?.get?.(AB_HEADERS.resign)) resetSignKey();
    let payload: ApiResponse<T>;
    try {
      payload = (await res.json()) as ApiResponse<T>;
    } catch {
      throw new ApiError('NETWORK', { status: res.status });
    }
    if (!payload.ok) throw new ApiError(payload.code, payload.params ?? {});
    if (payload.events.length > 0) eventsListener?.(payload.events);
    return payload.data;
  }

  return {
    get: <T>(path: string) => request<T>('GET', path),
    getPublic: <T>(path: string) => request<T>('GET', path, undefined, true),
    post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  };
}

export const api = createApiClient();
