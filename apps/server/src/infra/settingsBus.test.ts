import { describe, expect, it, vi } from 'vitest';
import { subscribeSettings } from './settingsBus';

describe('区服配置变更订阅', () => {
  it('订阅还没建立就关闭，不产生未处理的拒绝', async () => {
    const onUnhandled = vi.fn();
    process.on('unhandledRejection', onUnhandled);
    try {
      subscribeSettings(process.env.REDIS_URL!, () => undefined).close();
      await new Promise((r) => setTimeout(r, 300));
      expect(onUnhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});
