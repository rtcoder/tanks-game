import type {Request, Response} from '../shared/types.ts';
import {GAME_CONFIG} from './config.ts';
import {sendJson, sendNotFound} from './json.ts';
import {readJsonBody} from './body.ts';
import {createBattle, getBattle, serializeBattle, upsertPlayer} from './battles.ts';
import {getMap, getMapAsset, listMaps} from './maps.ts';

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

  if (requestUrl.pathname === '/api/maps' && req.method === 'GET') {
    sendJson(res, 200, {maps: await listMaps()});
    return true;
  }

  const mapMatch = requestUrl.pathname.match(/^\/api\/maps\/([^/]+)$/);
  if (mapMatch && req.method === 'GET') {
    const map = await getMap(mapMatch[1]);
    if (!map) {
      sendJson(res, 404, {error: 'Map not found'});
      return true;
    }

    sendJson(res, 200, {map});
    return true;
  }

  const mapAssetMatch = requestUrl.pathname.match(/^\/api\/maps\/([^/]+)\/assets\/([^/]+)$/);
  if (mapAssetMatch && req.method === 'GET') {
    const asset = await getMapAsset(mapAssetMatch[1], mapAssetMatch[2]);
    if (!asset) {
      sendJson(res, 404, {error: 'Map asset not found'});
      return true;
    }

    res.writeHead(200, {'Content-Type': asset.contentType});
    res.write(asset.bytes);
    res.end();
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
