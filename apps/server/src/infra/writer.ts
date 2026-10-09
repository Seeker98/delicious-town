/** 小镇日报的写稿器：调 OpenAI 兼容的对话接口（DeepSeek）。作为依赖传进去，测试用 scriptedWriter */
export interface WriterReply {
  text: string;
  tokensIn: number;
  tokensOut: number;
  model: string;
}

export interface Writer {
  chat(system: string, user: string, signal?: AbortSignal): Promise<WriterReply>;
}

export interface OpenAiWriterOptions {
  baseUrl: string;
  key: string;
  model: string;
  fetch?: typeof fetch;
  /** 单次调用超时，默认 60 秒 */
  timeoutMs?: number;
}

interface ChatResponse {
  model?: string;
  choices?: { message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export function openAiWriter(o: OpenAiWriterOptions): Writer {
  const doFetch = o.fetch ?? fetch;
  const url = `${o.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  return {
    async chat(system, user, signal) {
      const timeout = AbortSignal.timeout(o.timeoutMs ?? 60_000);
      const res = await doFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${o.key}` },
        body: JSON.stringify({
          model: o.model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          response_format: { type: 'json_object' },
          // DeepSeek V4 默认开思考模式，思考的内容按输出计费；日报用不着
          thinking: { type: 'disabled' },
          temperature: 1.0,
          max_tokens: 1500,
        }),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
      const raw = await res.text();
      if (!res.ok) throw new Error(`writer http ${res.status}: ${raw.slice(0, 200)}`);
      const data = JSON.parse(raw) as ChatResponse;
      const text = data.choices?.[0]?.message?.content;
      if (!text) throw new Error('writer empty reply');
      return {
        text,
        tokensIn: data.usage?.prompt_tokens ?? 0,
        tokensOut: data.usage?.completion_tokens ?? 0,
        model: data.model ?? o.model,
      };
    },
  };
}

export interface ScriptedWriter extends Writer {
  readonly calls: { system: string; user: string }[];
}

/** 测试用：按顺序给出回复（Error 就抛出），每次算 100 个输入、50 个输出 token */
export function scriptedWriter(replies: Array<string | Error>): ScriptedWriter {
  const calls: { system: string; user: string }[] = [];
  let i = 0;
  return {
    calls,
    async chat(system, user) {
      calls.push({ system, user });
      const r = replies[i++];
      if (r === undefined) throw new Error('scriptedWriter: no more replies');
      if (r instanceof Error) throw r;
      return { text: r, tokensIn: 100, tokensOut: 50, model: 'scripted' };
    },
  };
}
