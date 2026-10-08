import { describe, expect, it } from 'vitest';
import { matchText } from './match';

describe('matchText（问题记录 316）', () => {
  it('不区分大小写', () => {
    expect(matchText('Cheese', 'cheese')).toBe(true);
    expect(matchText('cheese', 'CHE')).toBe(true);
  });
  it('忽略重音符号（法、西、越南文菜名、食材名）', () => {
    expect(matchText('Crème', 'creme')).toBe(true);
    expect(matchText('Phở bò', 'pho')).toBe(true);
    expect(matchText('Limón siciliano', 'limon')).toBe(true);
    expect(matchText('Creme', 'crème')).toBe(true);
  });
  it('中文照常按包含匹配；空关键字算匹配', () => {
    expect(matchText('番茄炒鸡蛋', '鸡蛋')).toBe(true);
    expect(matchText('番茄', '土豆')).toBe(false);
    expect(matchText('anything', '')).toBe(true);
  });
});

describe('不换行空格当普通空格（法西标点批终审：名字里改成窄空格、不换行空格后，输入普通空格搜不到）', () => {
  it('“100 %”“« litchi”照样搜得到', () => {
    expect(matchText('Ratonera 100\u00a0%', '100 %')).toBe(true);
    expect(matchText('Ormeau «\u202flitchi rouge\u202f»', '« litchi')).toBe(true);
    expect(matchText('Ratonera 100 %', '100\u00a0%')).toBe(true);
  });
});
