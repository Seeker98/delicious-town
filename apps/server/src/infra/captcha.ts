export interface Captcha {
  verify(token: string, ip: string): Promise<boolean>;
}

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** Cloudflare 校验最多等这么久，超时按不通过（防脚本 PR② 审阅：卡住时别让写请求挂好几分钟） */
const VERIFY_TIMEOUT_MS = 5000;

export function turnstileCaptcha(
  secret: string,
  fetchImpl: FetchLike = (url, init) => fetch(url, init),
  timeoutMs = VERIFY_TIMEOUT_MS,
): Captcha {
  return {
    async verify(token, ip) {
      try {
        const body = new URLSearchParams({ secret, response: token, remoteip: ip });
        const res = await fetchImpl(SITEVERIFY, {
          method: 'POST',
          body,
          signal: AbortSignal.timeout(timeoutMs),
        });
        const json = (await res.json()) as { success?: boolean };
        return json.success === true;
      } catch {
        return false;
      }
    },
  };
}

/** 开发环境没配 TURNSTILE_SECRET 时使用：一律通过 */
export function disabledCaptcha(): Captcha {
  return { verify: async () => true };
}

/** 测试用 */
export function fixedCaptcha(result: boolean): Captcha {
  return { verify: async () => result };
}
