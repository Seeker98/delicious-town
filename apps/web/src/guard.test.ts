import { describe, expect, it } from 'vitest';
import type { MeDto } from '@dt/shared';
import { resolveGuard } from './guard';

const me = (patch: Partial<MeDto> = {}): MeDto => ({
  accountId: 1,
  username: 'u',
  email: 'u@x',
  emailVerified: true,
  shardId: null,
  restaurantId: null,
  ...patch,
});

describe('resolveGuard', () => {
  it('公开页面：未登录可访问；已登录访问登录/注册页时跳走', () => {
    expect(resolveGuard({ public: true, guestOnly: true }, null, '/login')).toBe(true);
    expect(resolveGuard({ public: true, guestOnly: true }, me(), '/login')).toEqual({ name: 'shards' });
    expect(
      resolveGuard({ public: true, guestOnly: true }, me({ shardId: 1, restaurantId: 2 }), '/login'),
    ).toEqual({
      name: 'home',
    });
    expect(resolveGuard({ public: true }, me(), '/verify-email')).toBe(true);
  });

  it('需要登录的页面：未登录跳登录页并记住来源', () => {
    expect(resolveGuard({}, null, '/shards')).toEqual({ name: 'login', query: { redirect: '/shards' } });
  });

  it('需要餐厅的页面：没选区服去选区服，没开店去开店', () => {
    expect(resolveGuard({ needRestaurant: true }, me(), '/')).toEqual({ name: 'shards' });
    expect(resolveGuard({ needRestaurant: true }, me({ shardId: 1 }), '/')).toEqual({
      name: 'create-restaurant',
    });
    expect(resolveGuard({ needRestaurant: true }, me({ shardId: 1, restaurantId: 3 }), '/')).toBe(true);
  });
});
