import { describe, expect, it } from 'vitest';
import { shortNum } from '../components/admin/chartUtil';
import { ACTION_LABEL, actionTone, banText, sourceLabel } from './adminLabels';

describe('后台的中文名和颜色（界面改版 P12）', () => {
  it('审计动作写中文；改数值红、处理举报琥珀、角色紫、其他灰', () => {
    expect(ACTION_LABEL['code.create']).toBe('新建兑换码');
    expect(ACTION_LABEL['mail.send']).toBe('发邮件');
    expect(actionTone('shard.override')).toBe('d');
    expect(actionTone('report.resolve')).toBe('w');
    expect(actionTone('player.role')).toBe('p');
    expect(actionTone('mail.send')).toBe('m');
  });

  it('封号写到哪天（北京时间），没有到期时间是永久', () => {
    expect(banText('2026-10-14T17:00:00.000Z')).toBe('封号到 10/15');
    expect(banText(null)).toBe('永久封号');
  });

  it('流水来源写中文：先认完整名字，再认前缀，都不认识就原样', () => {
    expect(sourceLabel('settlement')).toBe('结算');
    expect(sourceLabel('shop.buy')).toBe('商店购买');
    expect(sourceLabel('yard.reap')).toBe('菜园');
    expect(sourceLabel('zzz.unknown')).toBe('zzz.unknown');
  });

  it('纵轴刻度按万、亿缩写，负数用减号', () => {
    expect(shortNum(210_000_000)).toBe('2.1 亿');
    expect(shortNum(-170_000_000)).toBe('−1.7 亿');
    expect(shortNum(35_000)).toBe('3.5 万');
    expect(shortNum(0)).toBe('0');
    expect(shortNum(1234)).toBe('1,234');
  });
});
