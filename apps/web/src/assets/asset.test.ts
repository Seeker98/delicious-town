import { describe, expect, it } from 'vitest';
import { asset } from './asset';

describe('asset', () => {
  it('按路径拼出资源包地址，中文逐段编码', () => {
    expect(asset('goods/开张大吉', '/pack')).toBe('/pack/goods/%E5%BC%80%E5%BC%A0%E5%A4%A7%E5%90%89.png');
    expect(asset('town/bar', 'https://cdn.example.com/pack/')).toBe(
      'https://cdn.example.com/pack/town/bar.png',
    );
  });
});
