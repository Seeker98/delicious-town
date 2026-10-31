export interface CssRule {
  media: string | null;
  selectors: string[];
  body: string;
}
export function usedTokens(srcDir: string): Set<string>;
export function parseRules(css: string): CssRule[];
export function classesOf(css: string): Set<string>;
export function subsetUtilities(css: string, used: Set<string>): string;
