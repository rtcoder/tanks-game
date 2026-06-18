import type {Response} from '../shared/types.ts';

export const decodeMessage = <T = unknown>(message: unknown): T => JSON.parse(String(message)) as T;
export const encodeMessage = (message: unknown): string => JSON.stringify(message);

export function sendJson(res: Response, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, {'Content-Type': 'application/json; charset=utf-8'});
  res.end(encodeMessage(data));
}

export function sendNotFound(res: Response): void {
  sendJson(res, 404, {error: 'Not found'});
}
