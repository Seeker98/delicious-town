import { describe, expect, it } from 'vitest';
import es from './locales/es';
import fr from './locales/fr';

const text = (m: Record<string, unknown>) =>
  JSON.stringify(Object.values(m).map((v) => (typeof v === 'function' ? String(v) : v)));

describe('秘制调料的文案（#191 审查）', () => {
  it('西语和酒吧其他文案同一套叫法：声望 renombre、调酒师 barman', () => {
    const all = text(es.bar.spice) + es.site.changelog.spice1007;
    expect(all).not.toMatch(/reputación|camarero/);
    expect(all).toMatch(/renombre/);
    expect(all).toMatch(/barman/);
  });

  it('法语同一套叫法：声望 renommée、调酒师 barman', () => {
    const all = text(fr.bar.spice) + fr.site.changelog.spice1007;
    expect(all).not.toMatch(/réputation|serveur/);
    expect(all).toMatch(/renommée/);
    expect(all).toMatch(/barman/);
  });
});
