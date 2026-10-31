import type { Plugin } from 'vite';

/** 打包结果里用到的部分（rollup 的 OutputBundle 的子集，测试里好造） */
type Bundle = Record<
  string,
  { type: 'chunk'; facadeModuleId: string | null; imports: string[]; isEntry: boolean } | { type: 'asset' }
>;

/** 各语言翻译包的入口文件 src/i18n/locales/<语言>/index.ts */
const LOCALE_ENTRY = /[\\/]src[\\/]i18n[\\/]locales[\\/]([\w-]+)[\\/]index\.ts$/;

/**
 * 语言 → 打开这个语言要下载的 JS（性能 2026-10-31）：语言包自己和它静态引用的分包，
 * 去掉入口和入口已经引用的（页面上已经有 modulepreload）。网址带上 base
 */
export function localeChunks(bundle: Bundle, base = '/'): Record<string, string[]> {
  const chunks = Object.entries(bundle).flatMap(([file, c]) => (c.type === 'chunk' ? [{ file, ...c }] : []));
  const byFile = new Map(chunks.map((c) => [c.file, c]));
  /** 自己和静态引用的（递归） */
  const closure = (file: string, out = new Set<string>()): Set<string> => {
    if (out.has(file)) return out;
    out.add(file);
    for (const f of byFile.get(file)?.imports ?? []) closure(f, out);
    return out;
  };
  const loaded = new Set(chunks.filter((c) => c.isEntry).flatMap((c) => [...closure(c.file)]));
  const out: Record<string, string[]> = {};
  for (const c of chunks) {
    const l = c.facadeModuleId ? LOCALE_ENTRY.exec(c.facadeModuleId)?.[1] : undefined;
    if (!l) continue;
    out[l] = [...closure(c.file)].filter((f) => !loaded.has(f)).map((f) => base + f);
  }
  return out;
}

/** index.html 里留的空位：要排在 charset 后面（charset 得在前 1024 字节里）、theme-init.js 前面（它读这个） */
export const PLACEHOLDER = '<meta name="dt-locale-chunks" content="" />';

/** 把各语言包的文件填进页面头部的空位；没有空位就报错（改了 index.html 时别悄悄失效） */
export function fillLocaleChunks(html: string, map: Record<string, string[]>): string {
  if (!html.includes(PLACEHOLDER)) throw new Error(`index.html 里找不到 ${PLACEHOLDER}`);
  const json = JSON.stringify(map).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return html.replace(PLACEHOLDER, () => `<meta name="dt-locale-chunks" content="${json}" />`);
}

/** 只在打包时加（开发时没有打包结果，语言包照常按需加载） */
export function localePreloadPlugin(): Plugin {
  let base = '/';
  return {
    name: 'dt-locale-preload',
    apply: 'build',
    configResolved(c) {
      base = c.base;
    },
    transformIndexHtml: {
      order: 'post',
      handler: (html, ctx) =>
        ctx.bundle ? fillLocaleChunks(html, localeChunks(ctx.bundle as Bundle, base)) : html,
    },
  };
}
