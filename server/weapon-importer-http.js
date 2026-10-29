'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createWeaponImporter } = require('./custom-weapons');

function createWeaponImporterRoutes(repo, characters) {
  const importer = createWeaponImporter(repo, characters);
  const json = (res, code, data) => {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(data));
  };
  function body(req, res, callback) {
    const chunks = []; let size = 0, tooLarge = false;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > 8 * 1024 * 1024) { tooLarge = true; chunks.length = 0; }
      else if (!tooLarge) chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooLarge) return json(res, 413, { success: false, message: 'Ukuran unggahan terlalu besar (maksimal PNG 5 MB).' });
      let data;
      try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { return json(res, 400, { success: false, message: 'JSON tidak valid.' }); }
      try { callback(data); }
      catch (error) { json(res, 400, { success: false, message: error.message }); }
    });
  }
  return function handleRequest(req, res) {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/trainer/weapons' && req.method === 'GET') {
      const html = fs.readFileSync(path.join(__dirname, 'weapon-importer.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(html); return true;
    }
    if (url.pathname === '/trainer/weapons/editor/weapon-position.js' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(fs.readFileSync(path.join(__dirname, 'weapon-position.js'))); return true;
    }
    const editor = /^\/trainer\/weapons\/editor\/(rig\.json|(?:profile|battle)-(?:weapon|handweapon)-(?:back|front)\.png)$/.exec(url.pathname);
    if (editor && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': editor[1].endsWith('.json') ? 'application/json' : 'image/png', 'Cache-Control': 'no-store' });
      res.end(fs.readFileSync(path.join(__dirname, 'weapon-preview', editor[1]))); return true;
    }
    if (url.pathname === '/api/trainer/weapons' && req.method === 'GET') {
      try { json(res, 200, { success: true, weapons: importer.list(),
        characters: characters.listCharacters().map(c => ({ id: String(c.character_id), name: c.name, level: c.level })), activeId: characters.getActiveId() }); }
      catch (error) { json(res, 500, { success: false, message: error.message }); }
      return true;
    }
    const preview = /^\/trainer\/weapons\/preview\/(wpn\d+)\.png$/.exec(url.pathname);
    if (preview && req.method === 'GET') {
      const id = preview[1];
      const image = id === 'wpn9000' ? path.join(repo, 'tools/custom-weapons/obsidian-twin-claws/weapon.png') : path.join(repo, 'tools/custom-weapons/imports', id, 'weapon.png');
      if (!importer.list().some(x => x.id === id) || !fs.existsSync(image)) { res.writeHead(404); res.end(); }
      else { res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' }); res.end(fs.readFileSync(image)); }
      return true;
    }
    if (url.pathname === '/api/trainer/weapons/import' && req.method === 'POST') {
      body(req, res, data => json(res, 202, { success: true, job: importer.start(data) })); return true;
    }
    const job = /^\/api\/trainer\/weapons\/jobs\/([a-f0-9-]+)$/.exec(url.pathname);
    if (job && req.method === 'GET') {
      const result = importer.status(job[1]);
      json(res, result ? 200 : 404, result ? { success: true, job: result } : { success: false, message: 'Proses impor tidak ditemukan.' }); return true;
    }
    if (url.pathname === '/api/trainer/weapons/grant' && req.method === 'POST') {
      body(req, res, data => json(res, 200, { success: true, ...importer.grant(String(data.characterId || ''), data.weaponId, data.equip === true) })); return true;
    }
    return false;
  };
}
module.exports = { createWeaponImporterRoutes };
