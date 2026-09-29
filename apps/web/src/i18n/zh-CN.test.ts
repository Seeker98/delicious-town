import { describe, expect, it } from 'vitest';
import { ErrorCode } from '@dt/shared';
import { errorText } from './zh-CN';

describe('errorText', () => {
  it('每个错误码都有中文文案', () => {
    for (const code of Object.values(ErrorCode)) {
      expect(errorText(code)).not.toContain(code);
    }
    expect(errorText('NETWORK')).toBe('网络连接失败，请稍后再试');
  });

  it('餐厅名错误按原因给出具体提示', () => {
    expect(errorText('RESTAURANT_NAME_INVALID', { reason: 'reserved' })).toContain('官方');
    expect(errorText('RESTAURANT_NAME_INVALID', { reason: 'too_long' })).toContain('8 个汉字');
  });

  it('未知错误码有兜底', () => {
    expect(errorText('SOMETHING_NEW')).toBe('出错了（SOMETHING_NEW）');
  });
});
