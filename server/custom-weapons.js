'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

function numeric(value, fallback, min, max, integer = false) {
  const result = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(result) || result < min || result > max || (integer && !Number.isInteger(result)))
    throw new RangeError('Nilai senjata di luar batas yang diperbolehkan.');
  return result;
}
function metadata(input, id) {
  if (!input || typeof input !== 'object') throw new Error('Data senjata tidak valid.');
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  if (!name || name.length > 80 || description.length > 500) throw new Error('Isi nama (1–80 karakter) dan deskripsi maksimal 500 karakter.');
  const animation = input.animation || 'attack_1';
  if (!/^attack_([1-9]|10)$/.test(animation)) throw new Error('Animasi serangan tidak valid.');
  return { id: 'wpn' + id, name, description, swfName: 'wpn_' + id,
    level: numeric(input.level, 1, 1, 99, true), damage: numeric(input.damage, 100, 0, 32767, true),
    gold: 0, crystal: 0, prestige: 0, pvp_point: 0, merit: 0, sellable: false, rarity: 5,
    premium: false, agility: 0, dodge: 0, critical: 0, vendor: false, animation,
    expiry_hour: 0, expiry_group_id: 0, effect: [], extra_effect: null,
    forge_material: { material: '' }, forge_base: 0, forge_group_id: 0, development: 0, relate_set: '', hash: '',
    displayHeight: numeric(input.displayHeight, 120, 20, 350),
    pivotX: numeric(input.pivotX, 0.5, 0, 1), pivotY: numeric(input.pivotY, 0.85, 0, 1),
    rotation: numeric(input.rotation, 0, -180, 180),
    offsetX: numeric(input.offsetX, 0, -200, 200), offsetY: numeric(input.offsetY, 0, -200, 200),
    flipX: input.flipX === true, flipY: input.flipY === true,
  };
}
function decodeImage(value) {
  if (typeof value !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(value)) throw new Error('Pilih gambar PNG.');
  const image = Buffer.from(value.slice(value.indexOf(',') + 1), 'base64');
  if (image.length > 5 * 1024 * 1024 || image.length < 33 || !image.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')))
    throw new Error('PNG tidak valid atau lebih besar dari 5 MB.');
  const width = image.readUInt32BE(16), height = image.readUInt32BE(20);
  if (!width || !height || width > 4096 || height > 4096 || image[24] !== 8 || image[25] !== 6)
    throw new Error('PNG harus RGBA 8-bit dan maksimal 4096 × 4096 piksel. Pilih ulang gambar melalui alat impor.');
  return image;
}
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function atomicWrite(file, data) {
  const temp = file + '.import-' + crypto.randomUUID();
  try { fs.writeFileSync(temp, data); fs.renameSync(temp, file); }
  finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}

function createWeaponImporter(repo, characters) {
  const registry = path.join(repo, 'server/custom-weapons.json');
  const catalog = path.join(repo, 'web/cdn/swf/latest/swf/language/data_library_en.swf');
  const items = path.join(repo, 'web/cdn/swf/latest/swf/items');
  const imports = path.join(repo, 'tools/custom-weapons/imports');
  let busy = false;
  const jobs = new Map();

  function list() {
    const result = fs.existsSync(registry) ? JSON.parse(fs.readFileSync(registry, 'utf8')) : [];
    if (!Array.isArray(result)) throw new Error('Daftar senjata kustom tidak valid.');
    const legacy = path.join(repo, 'tools/custom-weapons/obsidian-twin-claws/weapon-data.json');
    if (fs.existsSync(legacy)) {
      const weapon = JSON.parse(fs.readFileSync(legacy, 'utf8'));
      if (fs.existsSync(path.join(items, weapon.swfName + '.swf')) && !result.some(x => x.id === weapon.id)) result.unshift(weapon);
    }
    return result;
  }
  function nextId() {
    const numbers = fs.readdirSync(items).map(x => /^wpn_(\d+)\.swf$/.exec(x)).filter(Boolean).map(x => Number(x[1]));
    return Math.max(8999, ...numbers, ...list().map(x => Number(x.id.replace(/^wpn/, '')))) + 1;
  }
  function status(id) { return jobs.get(id) || null; }

  function start(input) {
    if (busy) throw new Error('Impor lain sedang berjalan. Tunggu sampai selesai.');
    const editing = Boolean(input && input.editWeaponId);
    let image, weapon;
    if (editing) {
      const existing = list().find(x => x.id === input.editWeaponId);
      const sourceImage = existing && path.join(imports, existing.id, 'weapon.png');
      if (!existing || existing.id === 'wpn9000' || !fs.existsSync(sourceImage)) throw new Error('Senjata ini tidak mendukung editor posisi.');
      const changes = Object.fromEntries(['displayHeight','rotation','pivotX','pivotY','offsetX','offsetY','flipX','flipY'].map(key => [key, input[key] === undefined ? existing[key] : input[key]]));
      const validated = metadata({ ...existing, ...changes }, Number(existing.id.slice(3)));
      weapon = { ...existing, ...Object.fromEntries(Object.keys(changes).map(key => [key, validated[key]])) };
      image = fs.readFileSync(sourceImage);
    } else {
      image = decodeImage(input && input.image);
      weapon = metadata(input, nextId());
    }
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ninja-weapon-import-'));
    const before = hash(catalog);
    const priorAsset = editing ? hash(path.join(items, weapon.swfName + '.swf')) : null;
    const spec = path.join(folder, 'weapon-data.json');
    fs.writeFileSync(spec, JSON.stringify(weapon));
    fs.writeFileSync(path.join(folder, 'image.png'), image);
    const job = { id: crypto.randomUUID(), state: 'building', message: editing ? 'Memperbarui posisi senjata…' : 'Membuat aset dan memeriksa katalog…', weapon, operation: editing ? 'position' : 'import' };
    while (jobs.size >= 10) jobs.delete(jobs.keys().next().value);
    jobs.set(job.id, job); busy = true;
    const child = spawn(process.env.NINJA_PYTHON || 'python3', [
      path.join(repo, 'tools/custom-weapons/import-weapon.py'), repo,
      path.join(folder, 'image.png'), spec, path.join(folder, 'build'), ...(editing ? ['--asset-only'] : []),
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', settled = false;
    const capture = data => { output = (output + data.toString()).slice(-16000); };
    child.stdout.on('data', capture); child.stderr.on('data', capture);
    const timeout = setTimeout(() => { child.kill('SIGTERM'); }, 180000);
    function end(error) {
      if (settled) return;
      settled = true; clearTimeout(timeout); busy = false;
      if (error) { job.state = 'error'; job.message = error.message; }
      fs.rmSync(folder, { recursive: true, force: true });
    }
    child.once('error', () => end(new Error('Python tidak dapat dijalankan. Pastikan Python 3 dan Java tersedia.')));
    child.once('close', code => {
      if (settled) return;
      if (code !== 0) return end(new Error('Impor gagal; katalog lama tetap dipakai. ' + output.split('\n').filter(Boolean).slice(-2).join(' ').slice(0, 600)));
      let backup, oldRegistry, asset, destination, writeStarted = false;
      try {
        if (hash(catalog) !== before) throw new Error('Katalog berubah saat proses impor. Coba impor kembali.');
        asset = path.join(items, weapon.swfName + '.swf');
        destination = path.join(imports, weapon.id);
        if (!editing && (fs.existsSync(asset) || fs.existsSync(destination))) throw new Error('ID senjata sudah dipakai.');
        if (editing && hash(asset) !== priorAsset) throw new Error('Aset senjata berubah saat proses edit. Coba lagi.');
        const existing = list();
        backup = path.join(repo, 'backups/custom-weapon-imports', weapon.id + '-' + Date.now());
        fs.mkdirSync(backup, { recursive: true });
        fs.copyFileSync(catalog, path.join(backup, 'data_library_en.swf'));
        if (editing) {
          fs.copyFileSync(asset, path.join(backup, weapon.swfName + '.swf'));
          fs.copyFileSync(path.join(destination, 'weapon-data.json'), path.join(backup, 'weapon-data.json'));
        }
        oldRegistry = fs.existsSync(registry) ? fs.readFileSync(registry) : null;
        if (oldRegistry) fs.writeFileSync(path.join(backup, 'custom-weapons.json'), oldRegistry);
        writeStarted = true;
        fs.mkdirSync(destination, { recursive: true });
        if (!editing) fs.copyFileSync(path.join(folder, 'image.png'), path.join(destination, 'weapon.png'));
        atomicWrite(path.join(destination, 'weapon-data.json'), fs.readFileSync(spec));
        atomicWrite(asset, fs.readFileSync(path.join(folder, 'build', weapon.swfName + '.swf')));
        if (!editing) atomicWrite(catalog, fs.readFileSync(path.join(folder, 'build/data_library_en.swf')));
        atomicWrite(registry, JSON.stringify(editing ? existing.map(x => x.id === weapon.id ? weapon : x) : [...existing, weapon], null, 2) + '\n');
        fs.writeFileSync(path.join(backup, 'manifest.json'), JSON.stringify({ weapon: weapon.id, operation: editing ? 'position' : 'import', previousCatalog: before, catalog: hash(catalog), asset: hash(asset) }, null, 2));
        job.state = 'success'; job.message = editing ? 'Posisi senjata diperbarui. Buka ulang game.' : 'Senjata berhasil diimpor. Berikan ke karakter, lalu muat ulang game.';
        end();
      } catch (error) {
        if (backup && writeStarted) {
          try {
            atomicWrite(catalog, fs.readFileSync(path.join(backup, 'data_library_en.swf')));
            if (oldRegistry) atomicWrite(registry, oldRegistry); else if (fs.existsSync(registry)) fs.unlinkSync(registry);
            if (editing) {
              atomicWrite(asset, fs.readFileSync(path.join(backup, weapon.swfName + '.swf')));
              atomicWrite(path.join(destination, 'weapon-data.json'), fs.readFileSync(path.join(backup, 'weapon-data.json')));
            } else {
              if (asset && fs.existsSync(asset)) fs.unlinkSync(asset);
              if (destination) fs.rmSync(destination, { recursive: true, force: true });
            }
          } catch (rollback) { error.message += ' Pemulihan memerlukan cadangan: ' + backup; }
        }
        end(error);
      }
    });
    return job;
  }

  function grant(characterId, weaponId, equip = false) {
    if (typeof characterId !== 'string' || !/^\d+$/.test(characterId)) throw new Error('Pilih karakter tujuan.');
    const weapon = list().find(x => x.id === weaponId);
    if (!weapon || !fs.existsSync(path.join(items, weapon.swfName + '.swf'))) throw new Error('Senjata kustom tidak ditemukan.');
    const saved = characters.updateCharacter(characterId, c => {
      if (equip && (Number(c.level) || 1) < weapon.level) throw new Error('Level karakter belum memenuhi syarat senjata. Berikan ke tas tanpa langsung memasang.');
      const owned = Array.isArray(c.weapons) ? c.weapons.map(String) : [];
      const id = weapon.id.replace(/^wpn/, '');
      if (!owned.includes(id)) owned.push(id);
      if (equip) {
        c.equip ||= {};
        const previous = String(c.equip.weapon || '').replace(/^wpn_?/, '');
        if (/^\d+$/.test(previous) && !owned.includes(previous)) owned.push(previous);
        c.equip.weapon = weapon.id;
      }
      c.weapons = owned;
    });
    if (!saved) throw new Error('Karakter tidak ditemukan.');
    return { weapon, characterId, equipped: equip, message: weapon.name + (equip ? ' diberikan dan dipasang.' : ' diberikan ke inventaris.') + ' Muat ulang game.' };
  }

  return { list, start, status, grant };
}
module.exports = { createWeaponImporter, metadata, decodeImage };
