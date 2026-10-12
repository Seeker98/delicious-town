/** 搜索框繁简都认：繁中食材名里和简体不同的字 → 简体 */
export function hantPairs(names: string[]): Array<[string, string]>;
export function bundleTwNames(bundle: unknown): string[];
export function renderHantFold(pairs: Array<[string, string]>): string;
