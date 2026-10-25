/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 生产环境接口地址，例如 https://api.example.com；开发环境留空走代理 */
  readonly VITE_API_BASE?: string;
  /** Cloudflare Turnstile site key；留空时跳过人机验证（仅开发环境） */
  readonly VITE_TURNSTILE_SITEKEY?: string;
}

/** 前端版本号（防脚本 2026-10-25）：vite.config.ts 的 define 注入 */
declare const __DT_BUILD__: string;

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  turnstile?: {
    render(
      el: HTMLElement,
      opts: { sitekey: string; callback: (token: string) => void; 'error-callback'?: () => void },
    ): string;
    reset(widgetId: string): void;
    remove?(widgetId: string): void;
  };
}
