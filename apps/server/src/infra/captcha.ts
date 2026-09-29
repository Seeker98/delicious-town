export interface Captcha {
  verify(token: string, ip: string): Promise<boolean>;
}

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export function turnstileCaptcha(
  secret: string,
  fetchImpl: FetchLike = (url, init) => fetch(url, init),
): Captcha {
  return {
    async verify(token, ip) {
      try {
        const body = new URLSearchParams({ secret, response: token, remoteip: ip });
        const res = await fetchImpl(SITEVERIFY, { method: 'POST', body });
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
