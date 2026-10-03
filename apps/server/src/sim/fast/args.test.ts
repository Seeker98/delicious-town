import { describe, expect, it } from 'vitest';
import { parseFastArgs } from './args';

describe('backlog 快速模拟：sim fast 的命令行参数', () => {
  it('默认 30 天、每种画像 20 个；--calibrate 不写时是 5 天、5 个', () => {
    expect(parseFastArgs([])).toMatchObject({ calibrate: false, days: 30, bots: 20 });
    expect(parseFastArgs(['--calibrate'])).toMatchObject({ calibrate: true, days: 5, bots: 5 });
  });

  it('--calibrate 时显式写的 --days 30、--bots 20 照用，不被换成 5', () => {
    expect(parseFastArgs(['--calibrate', '--days', '30', '--bots', '20'])).toMatchObject({
      days: 30,
      bots: 20,
    });
  });

  it('数字要是正整数，画像名要认识，开始时间要能解析', () => {
    expect(() => parseFastArgs(['--days', 'abc'])).toThrow('--days');
    expect(() => parseFastArgs(['--bots', '0'])).toThrow('--bots');
    expect(() => parseFastArgs(['--stuck-days', '1.5'])).toThrow('--stuck-days');
    expect(() => parseFastArgs(['--personas', 'diligent,lazy'])).toThrow('lazy');
    expect(() => parseFastArgs(['--start', 'tomorrow'])).toThrow('--start');
  });

  it('--set 可以写多次', () => {
    expect(parseFastArgs(['--set', 'a=1', '--set', 'b=2']).sets).toEqual(['a=1', 'b=2']);
  });
});
