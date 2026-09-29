const DEFAULT_BASE = import.meta.env.VITE_ASSET_BASE ?? '/pack';

/**
 * 资源包里的图片地址，例如 asset('goods/开张大吉')。
 * 所有图片都走这里，换一套美术只需要替换资源包目录或修改 VITE_ASSET_BASE。
 */
export function asset(path: string, base: string = DEFAULT_BASE): string {
  const root = base.replace(/\/+$/, '');
  return `${root}/${path.split('/').map(encodeURIComponent).join('/')}.png`;
}
