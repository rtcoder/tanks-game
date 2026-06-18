import type {Request, Response} from '../shared/types.ts';
import {GAME_CONFIG} from './config.ts';
import {sendJson, sendNotFound} from './json.ts';
import {readJsonBody} from './body.ts';
import {createBattle, getBattle, serializeBattle, upsertPlayer} from './battles.ts';

export async function handleApiRequest(req: Request, res: Response): Promise<boolean> {
  if (req.url === undefined) {
    sendNotFound(res);
    return true;
  }
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (requestUrl.pathname === '/api/game-config') {
    sendJson(res, 200, GAME_CONFIG);
    return true;
  }

  if (requestUrl.pathname === '/api/health') {
    sendJson(res, 200, {ok: true});
    return true;
  }

  if (requestUrl.pathname === '/api/battles' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const {battle, player} = createBattle(body);
    sendJson(res, 201, {battle: serializeBattle(battle), playerId: player.id});
    return true;
  }

  const joinMatch = requestUrl.pathname.match(/^\/api\/battles\/([^/]+)\/join$/);
  if (joinMatch && req.method === 'POST') {
    const battle = getBattle(joinMatch[1]);
    if (!battle) {
      sendJson(res, 404, {error: 'Battle not found'});
      return true;
    }
    const body = await readJsonBody(req);
    const player = upsertPlayer(battle, body);
    sendJson(res, 200, {battle: serializeBattle(battle), playerId: player.id});
    return true;
  }

  const battleMatch = requestUrl.pathname.match(/^\/api\/battles\/([^/]+)$/);
  if (battleMatch && req.method === 'GET') {
    const battle = getBattle(battleMatch[1]);
    if (!battle) {
      sendJson(res, 404, {error: 'Battle not found'});
      return true;
    }
    sendJson(res, 200, {battle: serializeBattle(battle)});
    return true;
  }

  return false;
}
