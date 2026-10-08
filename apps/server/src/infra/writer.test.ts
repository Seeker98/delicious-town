import { describe, expect, it } from 'vitest';
import { openAiWriter, scriptedWriter } from './writer';

type Call = { url: string; init: RequestInit };

/** 假 fetch：记下请求，按给的状态和内容回复 */
function fakeFetch(status: number, body: unknown) {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { f, calls };
}

const OK = {
  model: 'deepseek-flash',
  choices: [{ message: { content: '{"title":"t","body":"b"}' } }],
  usage: { prompt_tokens: 2100, completion_tokens: 480 },
};

describe('小镇日报写稿器（OpenAI 兼容接口）', () => {
  it('请求体：模型、关掉思考、要 JSON；带密钥；解析内容和用量', async () => {
    const { f, calls } = fakeFetch(200, OK);
    const w = openAiWriter({
      baseUrl: 'https://api.deepseek.com/',
      key: 'sk-x',
      model: 'deepseek-flash',
      fetch: f,
    });
    const r = await w.chat('系统', '素材');
    expect(r).toEqual({
      text: '{"title":"t","body":"b"}',
      tokensIn: 2100,
      tokensOut: 480,
      model: 'deepseek-flash',
    });
    expect(calls[0]!.url).toBe('https://api.deepseek.com/chat/completions');
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe('Bearer sk-x');
    const body = JSON.parse(calls[0]!.init.body as string);
    expect(body).toMatchObject({
      model: 'deepseek-flash',
      messages: [
        { role: 'system', content: '系统' },
        { role: 'user', content: '素材' },
      ],
      response_format: { type: 'json_object' },
      thinking: { type: 'disabled' },
    });
  });

  it('非 2xx 抛错，带状态码；没有内容也抛错；用量缺失按 0', async () => {
    const bad = openAiWriter({
      baseUrl: 'https://x',
      key: 'k',
      model: 'm',
      fetch: fakeFetch(402, 'Insufficient Balance').f,
    });
    await expect(bad.chat('s', 'u')).rejects.toThrow('writer http 402: Insufficient Balance');
    const empty = openAiWriter({
      baseUrl: 'https://x',
      key: 'k',
      model: 'm',
      fetch: fakeFetch(200, { choices: [] }).f,
    });
    await expect(empty.chat('s', 'u')).rejects.toThrow('writer empty reply');
    const noUsage = openAiWriter({
      baseUrl: 'https://x',
      key: 'k',
      model: 'm',
      fetch: fakeFetch(200, { choices: [{ message: { content: 'x' } }] }).f,
    });
    expect(await noUsage.chat('s', 'u')).toMatchObject({ tokensIn: 0, tokensOut: 0, model: 'm' });
  });

  it('外面的中止信号传给 fetch', async () => {
    const { f, calls } = fakeFetch(200, OK);
    const ac = new AbortController();
    await openAiWriter({ baseUrl: 'https://x', key: 'k', model: 'm', fetch: f }).chat('s', 'u', ac.signal);
    const sig = calls[0]!.init.signal!;
    expect(sig.aborted).toBe(false);
    ac.abort();
    expect(sig.aborted).toBe(true);
  });

  it('测试用写稿器：按顺序回复，记下调用；Error 就抛出', async () => {
    const w = scriptedWriter(['a', new Error('boom')]);
    expect((await w.chat('s1', 'u1')).text).toBe('a');
    await expect(w.chat('s2', 'u2')).rejects.toThrow('boom');
    expect(w.calls).toEqual([
      { system: 's1', user: 'u1' },
      { system: 's2', user: 'u2' },
    ]);
  });
});
