/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 生产环境接口地址，例如 https://api.example.com；开发环境留空走代理 */
  readonly VITE_API_BASE?: string;
  /** 资源包地址，默认 /pack */
  readonly VITE_ASSET_BASE?: string;
  /** Cloudflare Turnstile site key；留空时跳过人机验证（仅开发环境） */
  readonly VITE_TURNSTILE_SITEKEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  turnstile?: {
    render(el: HTMLElement, opts: { sitekey: string; callback: (token: string) => void }): string;
  };
}
