import { readFileSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { defaultDataDir, readSourceDir } from '@dt/config';
import { createItemsTool, originalSources, saveBody } from './tool';

/**
 * 道具整理工具（问题记录 367）：pnpm -F @dt/server items [端口]，只在本机监听。
 * 读 packages/config/data，保存时只写 data/game/retired.json；不碰数据库
 */
const dir = defaultDataDir();
const json = <T>(name: string) => JSON.parse(readFileSync(join(dir, name), 'utf8')) as T;
const tool = createItemsTool({
  readSource: () => readSourceDir(dir),
  writeRetired: (text) => writeFileSync(join(dir, 'game', 'retired.json'), text),
  original: originalSources(
    json<{ data: Array<Record<string, number>> }>('dataset/goods_sources.json').data,
    json<Record<string, string>>('dataset/goods_source_legend.json'),
  ),
});
const page = readFileSync(new URL('./page.html', import.meta.url), 'utf8');

function send(res: ServerResponse, status: number, type: string, body: string) {
  res.writeHead(status, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store' });
  res.end(body);
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

const port = Number(process.argv[2] ?? 5199);
createServer((req, res) => {
  void (async () => {
    try {
      if (req.method === 'GET' && req.url === '/') return send(res, 200, 'text/html', page);
      if (req.method === 'GET' && req.url === '/api/report')
        return send(res, 200, 'application/json', JSON.stringify(tool.report()));
      if (req.method === 'POST' && req.url === '/api/retired') {
        const body = saveBody.safeParse(await readBody(req));
        if (!body.success)
          return send(res, 400, 'application/json', JSON.stringify({ errors: ['bad body'] }));
        return send(res, 200, 'application/json', JSON.stringify(tool.save(body.data)));
      }
      send(res, 404, 'text/plain', 'not found');
    } catch (e) {
      send(res, 500, 'text/plain', e instanceof Error ? e.message : String(e));
    }
  })();
}).listen(port, '127.0.0.1', () => {
  console.log(`道具整理工具：http://127.0.0.1:${port}/`);
  console.log('保存后运行 pnpm -F @dt/config build，再重启开发服务器，游戏里才生效');
});
