import { describe, expect, it } from 'vitest';
import { isInGame } from './inGame';

describe('游戏内外框（终审 I2）', () => {
  it('needRestaurant 的页面总是游戏内', () => {
    expect(isInGame({ needRestaurant: true }, null)).toBe(true);
  });
  it('指引页、账号页：已开店时带底部导航和返回，没开店时不带', () => {
    expect(isInGame({ gameChrome: true }, 5)).toBe(true);
    expect(isInGame({ gameChrome: true }, null)).toBe(false);
  });
  it('其他页面不算游戏内', () => {
    expect(isInGame({}, 5)).toBe(false);
  });
});
