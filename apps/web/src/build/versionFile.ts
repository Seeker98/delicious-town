import type { Plugin } from 'vite';

/** 打包时写进 dist 的版本文件名（旧版本提醒 2026-11-17）；public/_headers 里设成不缓存 */
export const VERSION_FILE = 'version.json';

/**
 * 旧版本提醒（2026-11-17）：打包时多生成一个 version.json，写这次打包的版本号（和请求头里的 __DT_BUILD__ 一样）。
 * 开着的页面定时读它，版本号和自己的不同就说明已经发版，弹框要求刷新（components/VersionGate.vue）
 */
export function versionFilePlugin(build: string): Plugin {
  return {
    name: 'dt-version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: VERSION_FILE, source: JSON.stringify({ build }) });
    },
  };
}
