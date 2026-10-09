import { describe, expect, it } from 'vitest';
import { accountMail } from './accountMail';

/** 法文邮件：; : ! ? 前用窄不换行空格（和网页、配置的标点规则一致；backlog：注册、找回密码邮件漏改） */
describe('账号邮件的法文标点', () => {
  it('验证邮箱、重置密码的标题和正文', () => {
    for (const p of ['verify', 'reset'] as const) {
      const m = accountMail('fr', p, 'https://x');
      for (const s of [m.subject, m.text]) {
        expect(s, s).not.toMatch(/[ \u00a0][;:!?]/);
        expect(s, s).toMatch(/\u202f[:!]/);
      }
    }
  });
});
