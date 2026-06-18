import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import type {Request, Response} from '../shared/types.ts';
import {sendJson, sendNotFound} from './json.ts';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(dirname, '..', '..', 'dist');

const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

export function serveStatic(req: Request, res: Response): void {
  if (req.url === undefined) {
    sendNotFound(res);
    return;
  }
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(requestUrl.pathname);
  const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1);
  const filePath = path.resolve(distDir, relativePath);

  if (!filePath.startsWith(distDir)) {
    sendNotFound(res);
    return;
  }

  const fallbackPath = path.join(distDir, 'index.html');
  const targetPath = fs.existsSync(filePath) && fs.statSync(filePath).isFile() ? filePath : fallbackPath;
  if (!fs.existsSync(targetPath)) {
    sendJson(res, 503, {
      error: 'Frontend build not found',
      hint: 'Run npm run build before npm start.',
    });
    return;
  }

  const ext = path.extname(targetPath);
  res.writeHead(200, {'Content-Type': contentTypes[ext] || 'application/octet-stream'});
  const stream = fs.createReadStream(targetPath);
  stream.on('data', (chunk: unknown) => {
    res.write(chunk);
  });
  stream.on('end', () => {
    res.end();
  });
  stream.on('error', () => {
    sendJson(res, 500, {error: 'Could not read static file'});
  });
}
