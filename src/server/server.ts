import http from 'http';
import type {ApiError, Request, Response} from '../shared/types.ts';
import {handleApiRequest} from './api.ts';
import {PORT} from './config.ts';
import {sendJson, sendNotFound} from './json.ts';
import {serveStatic} from './static.ts';
import {createGameWebSocketServer} from './ws.ts';

const httpServer = http.createServer((req: Request, res: Response) => {
  if (req.url === undefined) {
    sendNotFound(res);
    return;
  }

  if (req.url.startsWith('/api/')) {
    handleApiRequest(req, res)
      .then((handled: boolean) => {
        if (!handled) {
          sendNotFound(res);
        }
      })
      .catch((error: ApiError) => {
        sendJson(res, error.statusCode || 400, {error: error.message || 'Bad request'});
      });
    return;
  }

  serveStatic(req, res);
});

createGameWebSocketServer(httpServer);

httpServer.listen(PORT, () => {
  console.info(`Tanks server listening on http://localhost:${PORT}`);
});
