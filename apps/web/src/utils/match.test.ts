import { describe, expect, it } from 'vitest';
import { matchRange, matchText } from './match';

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

describe('繁简都认（橱柜改版：繁中界面输简体字、简中界面输繁体字都搜得到）', () => {
  it('食材名里的繁体字和简体字互认', () => {
    expect(matchText('豬肉', '猪')).toBe(true);
    expect(matchText('猪肉', '豬')).toBe(true);
    expect(matchText('青蔥', '葱')).toBe(true);
    expect(matchText('豬肉', '牛')).toBe(false);
  });
});

describe('matchRange：匹配到的字在原文里的位置（橱柜搜索高亮）', () => {
  it('返回原文里的起止下标', () => {
    expect(matchRange('苦瓜', '瓜')).toEqual([1, 2]);
    expect(matchRange('Melon amer', 'AMER')).toEqual([6, 10]);
  });
  it('重音、繁简折叠后下标仍对应原文', () => {
    expect(matchRange('Crème brûlée', 'brulee')).toEqual([6, 12]);
    expect(matchRange('豬肉', '猪肉')).toEqual([0, 2]);
  });
  it('原文里带分开写的重音符号（NFD）也对得上', () => {
    const s = 'Cre\u0300me';
    expect(matchRange(s, 'creme')).toEqual([0, 6]);
  });
  it('没匹配或空关键字返回 null', () => {
    expect(matchRange('苦瓜', '松露')).toBeNull();
    expect(matchRange('苦瓜', '')).toBeNull();
  });
});
