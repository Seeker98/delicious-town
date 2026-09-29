import { describe, expect, it } from 'vitest';
import { memoryMailer } from './mailer';

describe('memoryMailer', () => {
  it('记录发出的邮件，lastTo 取最近一封', async () => {
    const m = memoryMailer();
    await m.send({ to: 'a@x', subject: '1', text: 'first' });
    await m.send({ to: 'a@x', subject: '2', text: 'second' });
    expect(m.sent).toHaveLength(2);
    expect(m.lastTo('a@x')!.text).toBe('second');
    expect(m.lastTo('b@x')).toBeUndefined();
  });
});
