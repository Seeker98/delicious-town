import { test } from './fixtures';
import { registerAndOpen } from './helpers';

// 临时检查（不提交）：iPhone 16 宽度下各页面有没有横向超出
const PAGES = ['/', '/rest/floor', '/rest/income', '/rest/info', '/rest/tasks', '/rest/look', '/rest/equip', '/rest/gem', '/mc', '/temple', '/yard', '/bar', '/tower', '/takeaway', '/town', '/guide', '/redeem', '/invite', '/mail', '/activities', '/classroom', '/cookbooks', '/cupboard', '/market', '/exchange', '/kuji', '/predict', '/shop', '/store', '/society', '/society/star', '/society/oil', '/society/rename', '/society/move', '/weather', '/friends', '/forum', '/forum/new', '/more', '/account'];

test('横向超出检查', async ({ page, request }) => {
  test.setTimeout(600_000);
  await page.setViewportSize({ width: 393, height: 852 });
  await registerAndOpen(page, request);
  const out: string[] = [];
  for (const lang of ['zh-CN', 'en', 'fr', 'es']) {
    await page.request.post('/api/v1/account/lang', { data: { lang } });
    for (const p of PAGES) {
      await page.goto(p);
      await page.waitForTimeout(700);
      const r = await page.evaluate(() => {
        const w = window.innerWidth;
        const sw = document.documentElement.scrollWidth;
        const wide = [...document.querySelectorAll('body *')]
          .filter((el) => el.getBoundingClientRect().right > w + 1 && getComputedStyle(el).position !== 'fixed')
          .slice(0, 3)
          .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}[${(el.textContent ?? '').trim().slice(0, 20)}]`);
        return { sw, w, wide };
      });
      if (r.sw > r.w) out.push(`${lang} ${p} scrollWidth=${r.sw} :: ${r.wide.join(' | ')}`);
    }
  }
  console.log('OVERFLOW\n' + (out.join('\n') || 'none'));
});
