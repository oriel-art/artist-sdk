import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.md': 'text/plain', '.json': 'application/json' };
export function createDevServer() {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === '/') {
        response.writeHead(302, { Location: '/examples/webgl/' }); response.end(); return;
      }
      let path = resolve(root, `.${pathname}`);
      if (!path.startsWith(root + sep) || pathname.split('/').some(s => s.startsWith('.'))
        || !['examples', 'src'].includes(pathname.split('/')[1])) {
        response.writeHead(403); response.end('Forbidden'); return;
      }
      if ((await stat(path)).isDirectory()) path = resolve(path, 'index.html');
      const body = await readFile(path);
      response.writeHead(200, { 'Content-Type': `${types[extname(path)] ?? 'application/octet-stream'}; charset=utf-8`, 'Cache-Control': 'no-store' });
      response.end(body);
    } catch { response.writeHead(404); response.end('Not found'); }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 4173);
  createDevServer().listen(port, '127.0.0.1', () => console.log(`Artist SDK: http://127.0.0.1:${port}/examples/webgl/`));
}
