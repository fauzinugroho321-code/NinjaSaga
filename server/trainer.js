'use strict';
/* Ninja Saga Trainer & Control Panel
 * Mengelola level karakter, mata uang, unlock perk, dan toggle God Mode / One Hit Kill.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const chars = require('./chardata');
const weaponImporterRoutes = require('./weapon-importer-http').createWeaponImporterRoutes(path.resolve(__dirname, '..'), chars);

const SWF_PATH = path.join(__dirname, '..', 'web', 'cdn', 'swf', 'latest', 'swf', 'library', 'code_library.swf');
const SWF_BAK = SWF_PATH + '.backup-original';

// Bytecode signatures untuk God Mode & One Hit Kill di CharacterBase.updateHP
const GM_ON  = Buffer.from('d066b23fd066f44a14090000d124000c020000d248', 'hex');
const GM_OFF = Buffer.concat([Buffer.from('10110000', 'hex'), Buffer.alloc(17, 0x02)]); // jump +17, 17 nops

const OH_ON  = Buffer.from('d066b23fd066fe4a14170000d124000c100000d060c90766972024004ff80602240048', 'hex');
const OH_OFF = Buffer.concat([Buffer.from('101f0000', 'hex'), Buffer.alloc(31, 0x02)]); // jump +31, 31 nops

function bacaSwf() {
  if (!fs.existsSync(SWF_PATH)) return null;
  const buf = fs.readFileSync(SWF_PATH);
  const sig = buf.toString('latin1', 0, 3);
  let raw;
  if (sig === 'CWS') {
    raw = Buffer.concat([buf.subarray(0, 8), zlib.inflateSync(buf.subarray(8))]);
  } else if (sig === 'FWS') {
    raw = buf;
  } else {
    return null;
  }
  return { buf, raw, sig };
}

function simpanSwf(raw) {
  if (!fs.existsSync(SWF_BAK)) {
    try { fs.copyFileSync(SWF_PATH, SWF_BAK); } catch { /* abaikan */ }
  }
  const head = raw.subarray(0, 8);
  const body = raw.subarray(8);
  const compressed = zlib.deflateSync(body);
  const out = Buffer.concat([Buffer.from('CWS'), head.subarray(3, 8), compressed]);
  const tmp = SWF_PATH + '.tmp';
  fs.writeFileSync(tmp, out);
  fs.renameSync(tmp, SWF_PATH);
}

function getCheatsStatus() {
  try {
    const swf = bacaSwf();
    if (!swf) return { godMode: false, oneHit: false, swfFound: false };
    const raw = swf.raw;
    const hasGmOn = raw.indexOf(GM_ON) !== -1;
    const hasOhOn = raw.indexOf(OH_ON) !== -1;
    return {
      godMode: hasGmOn,
      oneHit: hasOhOn,
      swfFound: true,
    };
  } catch (e) {
    return { godMode: false, oneHit: false, error: e.message, swfFound: false };
  }
}

function setCheatsStatus(options) {
  const swf = bacaSwf();
  if (!swf) throw new Error('code_library.swf tidak ditemukan.');
  let raw = swf.raw;
  let changed = false;

  if (options.godMode === true) {
    const offIdx = raw.indexOf(GM_OFF);
    if (offIdx !== -1) {
      raw = Buffer.concat([raw.subarray(0, offIdx), GM_ON, raw.subarray(offIdx + GM_ON.length)]);
      changed = true;
    }
  } else if (options.godMode === false) {
    const onIdx = raw.indexOf(GM_ON);
    if (onIdx !== -1) {
      raw = Buffer.concat([raw.subarray(0, onIdx), GM_OFF, raw.subarray(onIdx + GM_OFF.length)]);
      changed = true;
    }
  }

  if (options.oneHit === true) {
    const offIdx = raw.indexOf(OH_OFF);
    if (offIdx !== -1) {
      raw = Buffer.concat([raw.subarray(0, offIdx), OH_ON, raw.subarray(offIdx + OH_ON.length)]);
      changed = true;
    }
  } else if (options.oneHit === false) {
    const onIdx = raw.indexOf(OH_ON);
    if (onIdx !== -1) {
      raw = Buffer.concat([raw.subarray(0, onIdx), OH_OFF, raw.subarray(onIdx + OH_OFF.length)]);
      changed = true;
    }
  }

  if (changed) {
    simpanSwf(raw);
  }
  return getCheatsStatus();
}

let trainerSelectedId = null;

function getTrainerData() {
  const allList = chars.listCharacters();
  const ids = allList.map(c => String(c.character_id));
  const activeId = ids.includes(trainerSelectedId) ? trainerSelectedId
    : (ids.includes(String(chars.getActiveId())) ? String(chars.getActiveId()) : (ids[0] || null));
  const cheats = getCheatsStatus();

  return {
    activeId: String(activeId),
    characters: allList.map(c => {
      const full = chars.characterById(c.character_id) || c;
      const gSlots = (full.gauntlet && Array.isArray(full.gauntlet.slot))
        ? full.gauntlet.slot.filter(x => Number(x) > 0).length
        : 0;
      return {
        id: String(c.character_id),
        name: c.name || 'Ninja',
        level: Number(full.level) || 1,
        xp: Number(full.xp) || 0,
        rank: Number(full.rank) || 1,
        gold: Number(full.gold) || 0,
        token: Number(full.token) || 0,
        mcoin: Number(full.mcoin) || 0,
        crystal: Number(full.crystal) || 0,
        prestige: Number(full.prestige) || 0,
        pvpCurrency: Number(full.pvp_currency) || 0,
        bloodlinePoint: Number(full.bloodlinePoint) || 0,
        allTalentsMode: full.allTalentsMode === true,
        allSageMode: full.allSageMode === true,
        allElementsMode: full.allElementsMode === true,
        spMode: chars.SP_MODES.includes(full.spMode) ? full.spMode : 'normal',
        senjutsuSS: Number(full.senjutsuSS) || 0,
        heartOfKari: Number((full.materials && full.materials['634']) || 0),
        crystalOfKari: Number((full.materials && full.materials['635']) || 0),
        gauntletStones: Object.fromEntries(chars.GAUNTLET_STONE_IDS.map(stoneId =>
          [stoneId, Number((full.materials && full.materials[stoneId]) || 0)])),
        gender: Number(full.gender) || 0,
        hp: Number(full.hp) || 100,
        cp: Number(full.cp) || 100,
        agi: Number(full.agi) || 1,
        skillsCount: (full.skills || []).length,
        petsCount: (full.pets || []).length,
        elements: Array.isArray(full.elements) ? full.elements : [0, 0, 0, 0, 0],
        attributePointBonus: Math.max(0, Number(full.attributePointBonus) || 0),
        pointLeft: (Number(full.level) || 1) + (Number(full.attributePointBonus) || 0) - (Array.isArray(full.elements) ? full.elements : [0, 0, 0, 0, 0]).reduce((a, b) => a + (Number(b) || 0), 0),
        hasGauntlet: Array.isArray(full.weapons) && full.weapons.map(String).includes('1596'),
        gauntletSlots: gSlots,
        scrollOfWisdom: chars.getSecretScrollCount(full),
        pets: (full.pets || []).map(p => ({ id: p.id, name: p.name, level: p.level, equipped: p.equipped })),
        clan: full.clan ? {
          name: full.clan.name,
          gold: Number(full.clan.gold) || 0,
          token: Number(full.clan.token) || 0,
          stamina: full.clan.character_stamina,
          maxStamina: full.clan.character_max_stamina,
        } : null,
      };
    }),
    cheats,
  };
}

// ---------------------------------------------------------------
// HTML Web Trainer UI (Self-contained, Offline, Dark-Mode Ninja)
// ---------------------------------------------------------------
function renderTrainerHtml() {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ninja Saga — Trainer & Control Panel</title>
  <style>
    :root {
      --bg: #0b0d13;
      --card-bg: #141722;
      --card-border: #222738;
      --card-hover: #1b2030;
      --accent: #dc2626;
      --accent-hover: #b91c1c;
      --accent-glow: rgba(220, 38, 38, 0.35);
      --gold: #f59e0b;
      --gold-glow: rgba(245, 158, 11, 0.3);
      --text: #f3f4f6;
      --text-muted: #94a3b8;
      --success: #10b981;
      --radius: 12px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    body { background-color: var(--bg); color: var(--text); padding: 24px; min-height: 100vh; display: flex; flex-direction: column; align-items: center; }
    .container { width: 100%; max-width: 900px; display: flex; flex-direction: column; gap: 20px; }
    
    /* Header */
    header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 16px; border-bottom: 1px solid var(--card-border); }
    .title-group { display: flex; align-items: center; gap: 12px; }
    .title-badge { background: linear-gradient(135deg, #dc2626, #991b1b); color: #fff; font-weight: 800; font-size: 11px; padding: 4px 8px; border-radius: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
    h1 { font-size: 24px; font-weight: 700; color: #fff; }
    .server-status { font-size: 13px; color: var(--success); display: flex; align-items: center; gap: 6px; background: rgba(16, 185, 129, 0.1); padding: 6px 12px; border-radius: 20px; border: 1px solid rgba(16, 185, 129, 0.2); }
    .pulse-dot { width: 8px; height: 8px; background: var(--success); border-radius: 50%; box-shadow: 0 0 8px var(--success); }

    /* Cards */
    .card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: var(--radius); padding: 20px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4); }
    .card-title { font-size: 16px; font-weight: 600; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; color: #fff; }

    /* Character Selection */
    .char-picker { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 6px; }
    .char-tab { flex: 1; min-width: 140px; background: #191e2b; border: 1px solid var(--card-border); padding: 12px 16px; border-radius: 8px; cursor: pointer; transition: all 0.2s; text-align: left; }
    .char-tab:hover { background: var(--card-hover); border-color: #3b4256; }
    .char-tab.active { background: linear-gradient(135deg, #1f2638, #26171d); border-color: var(--accent); box-shadow: 0 0 16px var(--accent-glow); }
    .char-tab .name { font-weight: 600; font-size: 15px; margin-bottom: 4px; color: #fff; }
    .char-tab .sub { font-size: 12px; color: var(--text-muted); }

    /* Profile Stats Grid */
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; margin-top: 14px; }
    .stat-box { background: #0f121b; border: 1px solid #1c2233; padding: 12px; border-radius: 8px; }
    .stat-label { font-size: 11px; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px; font-weight: 600; letter-spacing: 0.5px; }
    .stat-value { font-size: 18px; font-weight: 700; color: #fff; }
    .stat-value.gold { color: var(--gold); }
    .stat-value.token { color: #38bdf8; }
    .stat-value.mcoin { color: #c084fc; }
    .stat-value.crystal { color: #22d3ee; }

    /* Cheats Section (Switches) */
    .cheats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    @media(max-width: 600px) { .cheats-grid { grid-template-columns: 1fr; } }
    .cheat-item { display: flex; justify-content: space-between; align-items: center; background: #0f121b; border: 1px solid #1f2538; padding: 16px; border-radius: 10px; }
    .cheat-info h3 { font-size: 15px; font-weight: 600; margin-bottom: 4px; color: #fff; }
    .cheat-info p { font-size: 12px; color: var(--text-muted); }

    /* Toggle Switch */
    .switch { position: relative; display: inline-block; width: 50px; height: 26px; }
    .switch input { opacity: 0; width: 0; height: 0; }
    .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #272d40; transition: .3s; border-radius: 26px; border: 1px solid #374151; }
    .slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: #cbd5e1; transition: .3s; border-radius: 50%; }
    input:checked + .slider { background-color: var(--accent); border-color: var(--accent); box-shadow: 0 0 10px var(--accent-glow); }
    input:checked + .slider:before { transform: translateX(24px); background-color: #fff; }

    /* Level Slider */
    .level-container { display: flex; flex-direction: column; gap: 14px; }
    .level-display { display: flex; justify-content: space-between; align-items: center; }
    .level-badge { background: linear-gradient(135deg, #dc2626, #b91c1c); color: #fff; font-size: 20px; font-weight: 800; padding: 4px 14px; border-radius: 8px; box-shadow: 0 0 12px var(--accent-glow); }
    input[type=range] { width: 100%; height: 8px; background: #222738; border-radius: 4px; outline: none; -webkit-appearance: none; }
    input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 22px; height: 22px; background: var(--accent); border-radius: 50%; cursor: pointer; box-shadow: 0 0 8px var(--accent-glow); }
    .level-presets { display: flex; gap: 8px; flex-wrap: wrap; }
    .preset-btn { background: #1a2030; border: 1px solid var(--card-border); color: #cbd5e1; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500; transition: 0.15s; }
    .preset-btn:hover { background: #252e46; border-color: #475569; color: #fff; }

    /* Forms & Buttons */
    .form-row { display: flex; gap: 12px; align-items: center; margin-top: 10px; }
    .stone-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
    .stone-field { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 600; }
    .stone-field input { width: 100%; box-sizing: border-box; }
    input[type=number], input[type=text], select { background: #0f121b; border: 1px solid var(--card-border); color: #fff; padding: 10px 14px; border-radius: 8px; font-size: 14px; flex: 1; outline: none; }
    input[type=number]:focus, input[type=text]:focus, select:focus { border-color: var(--accent); }
    .btn { background: var(--accent); color: #fff; border: none; padding: 10px 18px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; transition: 0.2s; display: inline-flex; align-items: center; gap: 6px; }
    .btn:hover { background: var(--accent-hover); box-shadow: 0 0 14px var(--accent-glow); }
    .btn-gold { background: linear-gradient(135deg, #f59e0b, #d97706); }
    .btn-gold:hover { background: #d97706; box-shadow: 0 0 14px var(--gold-glow); }
    .btn-secondary { background: #222738; color: #cbd5e1; border: 1px solid #374151; }
    .btn-secondary:hover { background: #2d344a; color: #fff; }
    .btn-danger { background: #7f1d1d; border: 1px solid #991b1b; }
    .btn-danger:hover { background: #991b1b; box-shadow: 0 0 12px rgba(153, 27, 27, 0.4); }

    /* Action Grid */
    .action-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; }

    /* Notification Toast */
    #toast { position: fixed; bottom: 24px; right: 24px; background: #1e293b; color: #fff; border: 1px solid #334155; padding: 12px 20px; border-radius: 8px; font-size: 14px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); opacity: 0; transform: translateY(10px); transition: all 0.3s; pointer-events: none; z-index: 1000; }
    #toast.show { opacity: 1; transform: translateY(0); }
    #toast.toast-success { border-color: var(--success); background: #064e3b; }
    #toast.toast-error { border-color: var(--accent); background: #7f1d1d; }

    .help-box { background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.2); padding: 14px; border-radius: 8px; font-size: 13px; color: #fbbf24; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="title-group">
        <span class="title-badge">Ninja Saga</span>
        <h1>Trainer Dashboard</h1>
        <a href="/trainer/weapons" style="color: #fca5a5; display: inline-block; margin-top: 8px;">Impor senjata buatan sendiri →</a>
      </div>
      <div class="server-status">
        <span class="pulse-dot"></span>
        <span>Gateway Online (Port 8080)</span>
      </div>
    </header>

    <!-- Character Selector -->
    <div class="card">
      <div class="card-title">Pilih Karakter</div>
      <div id="charList" class="char-picker">
        <div style="color: var(--text-muted); font-size: 14px;">Memuat karakter...</div>
      </div>

      <div class="stats-grid" id="statsGrid">
        <div class="stat-box"><div class="stat-label">Level</div><div class="stat-value" id="sLevel">-</div></div>
        <div class="stat-box"><div class="stat-label">XP Total</div><div class="stat-value" id="sXp">-</div></div>
        <div class="stat-box"><div class="stat-label">Gold</div><div class="stat-value gold" id="sGold">-</div></div>
        <div class="stat-box"><div class="stat-label">Token</div><div class="stat-value token" id="sToken">-</div></div>
        <div class="stat-box"><div class="stat-label">MCoin (M Ungu)</div><div class="stat-value mcoin" id="sMcoin">-</div></div>
        <div class="stat-box"><div class="stat-label">Crystal</div><div class="stat-value crystal" id="sCrystal">-</div></div>
        <div class="stat-box"><div class="stat-label">Prestige (P)</div><div class="stat-value" id="sPrestige">-</div></div>
        <div class="stat-box"><div class="stat-label">PvP Point</div><div class="stat-value" id="sPvpCurrency">-</div></div>
        <div class="stat-box"><div class="stat-label">Bloodline Point</div><div class="stat-value" id="sBloodlinePoint">-</div></div>
        <div class="stat-box"><div class="stat-label">Senjutsu SS</div><div class="stat-value" id="sSenjutsuSS">-</div></div>
        <div class="stat-box"><div class="stat-label">❤️ Heart of Kari</div><div class="stat-value" id="sHeartOfKari" style="color: #f43f5e;">-</div></div>
        <div class="stat-box"><div class="stat-label">💎 Crystal of Kari</div><div class="stat-value" id="sCrystalOfKari" style="color: #3b82f6;">-</div></div>
        <div class="stat-box"><div class="stat-label">Max HP</div><div class="stat-value" id="sHp">-</div></div>
        <div class="stat-box"><div class="stat-label">Max CP</div><div class="stat-value" id="sCp">-</div></div>
        <div class="stat-box"><div class="stat-label">Agility</div><div class="stat-value" id="sAgi">-</div></div>
        <div class="stat-box"><div class="stat-label">Point Left (AP)</div><div class="stat-value" id="sPointLeft" style="color: #eab308;">-</div></div>
        <div class="stat-box"><div class="stat-label">Skills / Pet</div><div class="stat-value" id="sSkills">-</div></div>
        <div class="stat-box"><div class="stat-label">Gauntlet</div><div class="stat-value" id="sGauntlet" style="color: #facc15;">-</div></div>
      </div>
    </div>

    <!-- Battle Cheats -->
    <div class="card">
      <div class="card-title">Battle Cheats (Saklar ON / OFF)</div>
      <div class="cheats-grid">
        <div class="cheat-item">
          <div class="cheat-info">
            <h3>God Mode (Kebal Darah)</h3>
            <p>Pemain tidak menerima damage dari musuh sama sekali.</p>
          </div>
          <label class="switch">
            <input type="checkbox" id="chkGodMode" onchange="toggleCheat('godMode', this.checked)">
            <span class="slider"></span>
          </label>
        </div>

        <div class="cheat-item">
          <div class="cheat-info">
            <h3>One-Hit Kill</h3>
            <p>Musuh langsung mati seketika dalam 1 serangan.</p>
          </div>
          <label class="switch">
            <input type="checkbox" id="chkOneHit" onchange="toggleCheat('oneHit', this.checked)">
            <span class="slider"></span>
          </label>
        </div>
      </div>
      <div style="margin-top: 12px;" class="help-box">
        Tips: Saklar di atas langsung memodifikasi bytecode <code>code_library.swf</code> di tempat. Setelah Anda mengubah saklar, cukup <strong>muat ulang (refresh) game Flash</strong> Anda agar perubahan aktif.
      </div>
    </div>

    <!-- Level Selector -->
    <div class="card">
      <div class="card-title">Atur Level & XP Karakter</div>
      <div class="level-container">
        <div class="level-display">
          <span style="font-size: 14px; color: var(--text-muted);">Pilih level yang diinginkan (1 - 80):</span>
          <span class="level-badge" id="levelBadge">Lv 1</span>
        </div>
        <input type="range" id="levelRange" min="1" max="80" value="1" oninput="onLevelSlider(this.value)">
        <div class="level-presets">
          <button class="preset-btn" onclick="applyPreset(1)">Lv 1 (Genin Fresh)</button>
          <button class="preset-btn" onclick="applyPreset(20)">Lv 20 (Chunin)</button>
          <button class="preset-btn" onclick="applyPreset(40)">Lv 40 (Jounin)</button>
          <button class="preset-btn" onclick="applyPreset(60)">Lv 60 (Special Jounin)</button>
          <button class="preset-btn" onclick="applyPreset(80)">Lv 80 (Sennin Max)</button>
        </div>
        <div class="form-row" style="flex-wrap: wrap; align-items: flex-end;">
          <div style="flex: 1; min-width: 180px;">
            <label style="font-size: 12px; color: var(--text-muted); display: block; margin-bottom: 6px;">XP Karakter:</label>
            <input type="number" id="inputXp" placeholder="Total XP" oninput="onXpInput(this.value)">
          </div>
          <button class="preset-btn" style="height: 38px; display: inline-flex; align-items: center; gap: 4px;" onclick="setXpNearLevelUp()" title="Atur XP tinggal 1 lagi untuk naik level">⚡ Set XP 99% (Mau Naik Lv)</button>
        </div>
        <div id="xpHint" style="font-size: 12px; color: var(--text-muted); margin-top: -4px;"></div>
        <div class="form-row">
          <button class="btn" onclick="simpanLevel()">Terapkan Level & XP</button>
        </div>
      </div>
    </div>

    <!-- Attribute Points & Elements -->
    <div class="card">
      <div class="card-title" style="justify-content: space-between;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span>Poin Atribut & Elemen (Point Left / AP)</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 13px; color: var(--text-muted);">Point Left:</span>
          <span class="level-badge" id="badgePointLeft" style="background: linear-gradient(135deg, #eab308, #ca8a04); font-size: 16px; padding: 2px 10px;">0</span>
        </div>
      </div>
      <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 14px;">
        Setiap level memberikan 1 Attribute Point (AP). Poin dialokasikan ke 5 elemen di bawah untuk menambah stat ninja, atau biarkan di <strong>Point Left</strong> untuk dinaikkan langsung lewat menu profil game.
      </div>
      <div class="form-row" style="flex-wrap: wrap;">
        <div style="flex: 1; min-width: 130px;">
          <label style="font-size: 12px; color: #38bdf8; font-weight: 600; display: block; margin-bottom: 4px;">
            🌪️ Wind (Angin)
          </label>
          <input type="number" id="inputElWind" min="0" placeholder="0" oninput="hitungPointLeftLive()">
          <span style="font-size: 11px; color: var(--text-muted);">+Agi & Dodge</span>
        </div>
        <div style="flex: 1; min-width: 130px;">
          <label style="font-size: 12px; color: #ef4444; font-weight: 600; display: block; margin-bottom: 4px;">
            🔥 Fire (Api)
          </label>
          <input type="number" id="inputElFire" min="0" placeholder="0" oninput="hitungPointLeftLive()">
          <span style="font-size: 11px; color: var(--text-muted);">+Dmg & Crit %</span>
        </div>
        <div style="flex: 1; min-width: 130px;">
          <label style="font-size: 12px; color: #a855f7; font-weight: 600; display: block; margin-bottom: 4px;">
            ⚡ Thunder (Petir)
          </label>
          <input type="number" id="inputElLightning" min="0" placeholder="0" oninput="hitungPointLeftLive()">
          <span style="font-size: 11px; color: var(--text-muted);">+Crit Dmg & Multi</span>
        </div>
        <div style="flex: 1; min-width: 130px;">
          <label style="font-size: 12px; color: #06b6d4; font-weight: 600; display: block; margin-bottom: 4px;">
            💧 Water (Air)
          </label>
          <input type="number" id="inputElWater" min="0" placeholder="0" oninput="hitungPointLeftLive()">
          <span style="font-size: 11px; color: var(--text-muted);">+Max CP & Purify</span>
        </div>
        <div style="flex: 1; min-width: 130px;">
          <label style="font-size: 12px; color: #84cc16; font-weight: 600; display: block; margin-bottom: 4px;">
            ⛰️ Earth (Tanah)
          </label>
          <input type="number" id="inputElEarth" min="0" placeholder="0" oninput="hitungPointLeftLive()">
          <span style="font-size: 11px; color: var(--text-muted);">+Max HP & Def</span>
        </div>
      </div>
      <div id="apSummaryInfo" style="font-size: 12px; color: var(--text-muted); margin-top: 10px;"></div>
      <div class="level-presets" style="margin-top: 12px;">
        <button class="preset-btn" onclick="presetAttributes('wind')">🌪️ Full Wind (Max Dodge)</button>
        <button class="preset-btn" onclick="presetAttributes('fire_thunder')">🔥⚡ Fire & Thunder (Attacker)</button>
        <button class="preset-btn" onclick="presetAttributes('balance')">⚖️ Bagi Rata 5 Elemen</button>
        <button class="preset-btn" onclick="presetAttributes('reset')">🔄 Reset Semua (100% Point Left)</button>
      </div>
      <div class="form-row" style="margin-top: 14px;">
        <button class="btn" onclick="simpanAttributes()">Terapkan Atribut Elemen</button>
        <button class="btn btn-secondary" onclick="resetAttributesToPointLeft()">🔄 Kosongkan ke Point Left</button>
      </div>
      <div class="form-row" style="flex-wrap: wrap; align-items: flex-end; margin-top: 18px;">
        <label style="flex: 1; min-width: 180px; font-size: 12px; color: var(--text-muted);">
          Tambah bonus Point Left (tanpa mengurangi elemen)
          <input type="number" id="inputBonusAP" min="1" max="100000" step="1" value="20" style="display: block; width: 100%; margin-top: 6px;">
        </label>
        <button class="btn" onclick="tambahBonusAP()">Tambah Bonus Point Left</button>
      </div>
      <p style="font-size: 12px; color: var(--text-muted); line-height: 1.5; margin-top: 8px;">
        Bonus tersimpan untuk karakter yang dipilih. Level dan poin elemen tidak berubah. Muat ulang game setelah menambah bonus.
      </p>
      <div class="form-row" style="flex-wrap: wrap; align-items: flex-end; margin-top: 18px;">
        <label style="flex: 1; min-width: 150px; font-size: 12px; color: var(--text-muted);">
          Jumlah poin yang dikembalikan
          <input type="number" id="inputRefundPoints" min="1" step="1" value="1" style="display: block; width: 100%; margin-top: 6px;">
        </label>
        <label style="flex: 1; min-width: 180px; font-size: 12px; color: var(--text-muted);">
          Ambil dari elemen
          <select id="refundElement" style="display: block; width: 100%; margin-top: 6px;">
            <option value="auto">Otomatis (tertinggi dahulu)</option>
            <option value="wind">Wind (Angin)</option>
            <option value="fire">Fire (Api)</option>
            <option value="lightning">Thunder (Petir)</option>
            <option value="water">Water (Air)</option>
            <option value="earth">Earth (Tanah)</option>
          </select>
        </label>
        <button class="btn btn-secondary" onclick="tambahPointLeft()">Kembalikan Poin Elemen</button>
      </div>
      <p style="font-size: 12px; color: var(--text-muted); line-height: 1.5; margin-top: 8px;">
        Jumlah yang ditambahkan akan dikurangi dari poin elemen terpasang. Level tetap sama; jumlah maksimum adalah total poin elemen yang sudah dipakai.
      </p>
    </div>

    <!-- Currency Editor -->
    <div class="card">
      <div class="card-title">Dompet & Mata Uang</div>
      <div class="form-row" style="flex-wrap: wrap;">
        <div style="flex: 1; min-width: 140px;">
          <label style="font-size: 12px; color: var(--text-muted);">Gold</label>
          <input type="number" id="inputGold" placeholder="Jumlah Gold">
        </div>
        <div style="flex: 1; min-width: 140px;">
          <label style="font-size: 12px; color: var(--text-muted);">Token</label>
          <input type="number" id="inputToken" placeholder="Jumlah Token">
        </div>
        <div style="flex: 1; min-width: 140px;">
          <label style="font-size: 12px; color: #c084fc; font-weight: 600;">MCoin (M Ungu)</label>
          <input type="number" id="inputMcoin" placeholder="Jumlah MCoin">
        </div>
        <div style="flex: 1; min-width: 140px;">
          <label style="font-size: 12px; color: #22d3ee; font-weight: 600;">Crystal (data lokal)</label>
          <input type="number" id="inputCrystal" placeholder="Jumlah Crystal">
        </div>
      </div>
      <div class="form-row" style="flex-wrap: wrap; margin-top: 12px;">
        <div style="flex: 1; min-width: 140px;">
          <label style="font-size: 12px; color: #f87171; font-weight: 600;">Prestige (P merah)</label>
          <input type="number" id="inputPrestige" min="0" placeholder="Jumlah Prestige">
        </div>
        <div style="flex: 1; min-width: 140px;">
          <label style="font-size: 12px; color: #a78bfa; font-weight: 600;">PvP Point</label>
          <input type="number" id="inputPvpCurrency" min="0" placeholder="Jumlah PvP Point">
        </div>
        <div style="flex: 1; min-width: 140px;">
          <label style="font-size: 12px; color: var(--text-muted);">Bloodline Point (BP)</label>
          <input type="number" id="inputBloodlinePoint" min="0" placeholder="Jumlah BP">
        </div>
        <div style="flex: 1; min-width: 140px;">
          <label style="font-size: 12px; color: var(--text-muted);">Senjutsu Spirit (SS)</label>
          <input type="number" id="inputSenjutsuSS" min="0" placeholder="Jumlah SS">
        </div>
      </div>
      <div class="form-row" id="clanCurrencyRow" style="flex-wrap: wrap; margin-top: 12px; display: none;">
        <div style="flex: 1; min-width: 140px;">
          <label style="font-size: 12px; color: var(--text-muted);">Kas Klan: Gold</label>
          <input type="number" id="inputClanGold" min="0" placeholder="Gold Klan">
        </div>
        <div style="flex: 1; min-width: 140px;">
          <label style="font-size: 12px; color: var(--text-muted);">Kas Klan: Token</label>
          <input type="number" id="inputClanToken" min="0" placeholder="Token Klan">
        </div>
      </div>
      <div class="form-row" style="flex-wrap: wrap; margin-top: 12px;">
        <div style="flex: 1; min-width: 140px;">
          <label style="font-size: 12px; color: #f43f5e; font-weight: 600;">❤️ Heart of Kari (Material Market #634)</label>
          <input type="number" id="inputHeartOfKari" min="0" placeholder="Jumlah Heart of Kari">
        </div>
        <div style="flex: 1; min-width: 140px;">
          <label style="font-size: 12px; color: #3b82f6; font-weight: 600;">💎 Crystal of Kari (Material Market #635)</label>
          <input type="number" id="inputCrystalOfKari" min="0" placeholder="Jumlah Crystal of Kari">
        </div>
      </div>
      <div class="help-box" style="margin-top: 12px;"><strong>❤️ Heart of Kari</strong> dan <strong>💎 Crystal of Kari</strong> adalah mata uang Material Market / Material House untuk menempa (forge) senjata, perlengkapan, dan pet. Crystal adalah data lokal trainer; pembelian toko game memakai Token. Kas klan hanya tampil jika karakter sudah memiliki klan.</div>
      <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; align-items: center;">
        <button class="btn btn-gold" onclick="simpanCurrency()">Simpan Saldo</button>
        <button class="btn-secondary preset-btn" onclick="addGold(10000000)">+10 Juta Gold</button>
        <button class="btn-secondary preset-btn" onclick="addToken(50000)">+50.000 Token</button>
        <button class="btn-secondary preset-btn" style="color: #c084fc; border-color: rgba(192, 132, 252, 0.4);" onclick="addMcoin(10000)">+10.000 MCoin</button>
        <button class="btn-secondary preset-btn" style="color: #22d3ee; border-color: rgba(34, 211, 238, 0.4);" onclick="addCrystal(5000)">+5.000 Crystal</button>
        <button class="btn-secondary preset-btn" onclick="addBalance('inputPrestige', 10000)">+10.000 Prestige</button>
        <button class="btn-secondary preset-btn" onclick="addBalance('inputPvpCurrency', 10000)">+10.000 PvP Point</button>
        <button class="btn-secondary preset-btn" style="color: #f43f5e; border-color: rgba(244, 63, 94, 0.4);" onclick="addBalance('inputHeartOfKari', 1000)">+1.000 Heart of Kari</button>
        <button class="btn-secondary preset-btn" style="color: #3b82f6; border-color: rgba(59, 130, 246, 0.4);" onclick="addBalance('inputCrystalOfKari', 1000)">+1.000 Crystal of Kari</button>
        <button class="btn-secondary preset-btn" onclick="maxCurrency()">Maksimal Semua</button>
      </div>
    </div>

    <!-- Quick Perks -->
    <div class="card">
      <div class="card-title">Quick Unlocks & Manajemen Karakter</div>
      <div class="action-grid">
        <button class="btn btn-secondary" onclick="unlockPerk('tails')">🐾 Buka 9 Tailed Beasts</button>
        <button class="btn btn-secondary" onclick="unlockPerk('skills')">📜 Buka Jutsu & Kinjutsu</button>
        <button class="btn btn-secondary" onclick="unlockGauntlet()">🧤 Max Six-Element Gauntlet</button>
        <button class="btn btn-secondary" onclick="unlockPerk('clan_stamina')">⚡ Isi Penuh Stamina Klan</button>
        <button class="btn btn-danger" onclick="resetCharConfirm()">⚠️ Reset Karakter ke Lv 1</button>
      </div>
      <div class="cheat-item" style="margin-top: 16px; gap: 16px;">
        <div class="cheat-info">
          <h3>Mode Semua Talent</h3>
          <p>Untuk karakter terpilih: akses semua ${chars.ALL_TALENT_SKILL_IDS.length} talent yang tersedia. Saat bertarung, klik Next pada lingkaran talent untuk melihat skill aktif berikutnya; skill pasif bekerja otomatis. Skill tambahan mulai Lv 1 dan level talent milikmu tetap. Muat ulang game setelah mengganti mode.</p>
        </div>
        <label class="switch" aria-label="Mode Semua Talent">
          <input type="checkbox" id="chkAllTalents" onchange="setAllTalents(this.checked)">
          <span class="slider"></span>
        </label>
      </div>
      <div class="cheat-item" style="margin-top: 12px; gap: 16px;">
        <div class="cheat-info">
          <h3>Mode Semua Sage</h3>
          <p>Akses Toad dan Snake sekaligus. Semua 17 skill aktif langsung dipasang, termasuk skill yang ada di halaman Next saat bertarung. Skill pasif bekerja otomatis tanpa tombol.</p>
        </div>
        <label class="switch" aria-label="Mode Semua Sage">
          <input type="checkbox" id="chkAllSage" onchange="setAllSage(this.checked)">
          <span class="slider"></span>
        </label>
      </div>
      <div class="cheat-item" style="margin-top: 12px; gap: 16px;">
        <div class="cheat-info">
          <h3>Mode Lima Elemen</h3>
          <p>Buka Api, Air, Angin, Tanah, dan Petir sekaligus. Jutsu tidak diberikan otomatis: pelajari lewat Academy, termasuk jutsu di atas level karakter, lalu pasang di menu Jutsu.</p>
        </div>
        <label class="switch" aria-label="Mode Lima Elemen">
          <input type="checkbox" id="chkAllElements" onchange="setAllElements(this.checked)">
          <span class="slider"></span>
        </label>
      </div>
      <div class="cheat-item" style="margin-top: 12px; gap: 16px;">
        <div class="cheat-info">
          <h3>SP Pertarungan</h3>
          <p>Full mengisi SP saat game dimuat dan tiap giliran. Infinite menjadikan SP 9999/9999 dan menjaganya tetap penuh saat dipakai. Muat ulang game setelah mengganti pilihan.</p>
        </div>
        <select id="selSpMode" aria-label="Mode SP pertarungan" onchange="setSpMode(this.value)" style="min-width: 150px;">
          <option value="normal">Normal</option>
          <option value="full">Full SP</option>
          <option value="infinite">Infinite SP ∞</option>
        </select>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Batu Six-Element Gauntlet</div>
      <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 14px;">Atur jumlah batu untuk karakter terpilih. Jumlah ini muncul pada enam penghitung batu di game setelah dimuat ulang.</p>
      <div class="stone-grid">
        <label class="stone-field"><span style="color: #fb7185;">◆ Api</span><input type="number" id="stone1144" min="0" max="999999" aria-label="Jumlah batu Api"></label>
        <label class="stone-field"><span style="color: #4ade80;">◆ Angin</span><input type="number" id="stone1145" min="0" max="999999" aria-label="Jumlah batu Angin"></label>
        <label class="stone-field"><span style="color: #60a5fa;">◆ Air</span><input type="number" id="stone1146" min="0" max="999999" aria-label="Jumlah batu Air"></label>
        <label class="stone-field"><span style="color: #a78bfa;">◆ Petir</span><input type="number" id="stone1147" min="0" max="999999" aria-label="Jumlah batu Petir"></label>
        <label class="stone-field"><span style="color: #fde047;">◆ Tanah</span><input type="number" id="stone1148" min="0" max="999999" aria-label="Jumlah batu Tanah"></label>
        <label class="stone-field"><span style="color: #67e8f9;">◆ Chakra</span><input type="number" id="stone1150" min="0" max="999999" aria-label="Jumlah batu Chakra"></label>
      </div>
      <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px;">
        <button class="btn btn-secondary" onclick="fillGauntletStones(220)">Isi 220 Semua</button>
        <button class="btn" onclick="saveGauntletStones()">Simpan Batu</button>
      </div>
    </div>

    <!-- Secret Scroll of Wisdom & Element Mastery -->
    <div class="card">
      <div class="card-title" style="display: flex; justify-content: space-between; align-items: center;">
        <span>📜 Secret Scroll of Wisdom & Mastery Elemen</span>
        <span style="font-size: 13px; font-weight: 600; color: var(--gold); background: rgba(245, 158, 11, 0.12); padding: 4px 12px; border-radius: 6px; border: 1px solid rgba(245, 158, 11, 0.25);">
          Dimiliki: <span id="sScrolls">0</span> Scroll
        </span>
      </div>
      <p style="font-size: 13px; color: var(--text-muted); line-height: 1.5; margin-bottom: 14px;">
        Dengan <strong>Secret Scroll of Wisdom</strong> (<code>item503</code>), Anda dapat menguasai seluruh jutsu Level 1–80 dari satu elemen secara instan. Menambah scroll di sini akan langsung membuat tulisan <em>"You have 0"</em> pada menu game Flash Anda bertambah, sehingga tombol <strong>[Learn]</strong> di game bisa langsung dipakai.
      </p>
      
      <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px;">
        <button class="btn btn-gold preset-btn" onclick="tambahScroll(1)">+1 Scroll of Wisdom</button>
        <button class="btn btn-gold preset-btn" onclick="tambahScroll(5)">+5 Scroll of Wisdom</button>
        <button class="btn btn-gold preset-btn" onclick="tambahScroll(10)">+10 Scroll of Wisdom</button>
      </div>

      <div style="font-size: 13px; font-weight: 600; color: #fff; margin-bottom: 10px;">
        ⚡ Instant Element Mastery (Pelajari Semua Jutsu per Elemen Langsung):
      </div>
      <div class="action-grid">
        <button class="btn btn-secondary" onclick="kuasaiElemen('fire')">🔥 Jutsu Api (Fire Lv 1–80)</button>
        <button class="btn btn-secondary" onclick="kuasaiElemen('lightning')">⚡ Jutsu Petir (Lightning Lv 1–80)</button>
        <button class="btn btn-secondary" onclick="kuasaiElemen('earth')">🪨 Jutsu Tanah (Earth Lv 1–80)</button>
        <button class="btn btn-secondary" onclick="kuasaiElemen('wind')">💨 Jutsu Angin (Wind Lv 1–80)</button>
        <button class="btn btn-secondary" onclick="kuasaiElemen('water')">🌊 Jutsu Air (Water Lv 1–80)</button>
        <button class="btn" style="background: linear-gradient(135deg, #7c3aed, #4f46e5);" onclick="kuasaiElemen('all')">🌟 Kuasai 5 Elemen Sekaligus</button>
      </div>
    </div>
  </div>

  <div id="toast">Notifikasi</div>

  <script>
    let state = { activeId: null, characters: [], cheats: {} };

    function getActiveChar() {
      return state.characters.find(c => String(c.id) === String(state.activeId)) || state.characters[0] || null;
    }

    function showToast(msg, isSuccess = true) {
      const t = document.getElementById('toast');
      t.innerText = msg;
      t.className = isSuccess ? 'toast-success show' : 'toast-error show';
      setTimeout(() => t.className = '', 3200);
    }

    async function loadStatus() {
      try {
        const res = await fetch('/api/trainer/status');
        state = await res.json();
        render();
      } catch (e) {
        showToast('Gagal terhubung ke server trainer: ' + e.message, false);
      }
    }

    function render() {
      // Cheats toggle
      document.getElementById('chkGodMode').checked = !!state.cheats.godMode;
      document.getElementById('chkOneHit').checked = !!state.cheats.oneHit;

      // Character tabs
      const listEl = document.getElementById('charList');
      listEl.innerHTML = '';
      if (!state.characters || !state.characters.length) {
        listEl.innerHTML = '<div style="color: var(--text-muted);">Belum ada karakter yang dibuat.</div>';
        return;
      }

      state.characters.forEach(c => {
        const tab = document.createElement('div');
        tab.className = 'char-tab ' + (String(c.id) === String(state.activeId) ? 'active' : '');
        tab.onclick = () => selectChar(c.id);
        tab.innerHTML = '<div class="name">' + c.name + '</div><div class="sub">Lv ' + c.level + ' • Rank ' + c.rank + '</div>';
        listEl.appendChild(tab);
      });

      // Active character stats
      const activeChar = getActiveChar();
      if (activeChar) {
        document.getElementById('chkAllTalents').checked = !!activeChar.allTalentsMode;
        document.getElementById('chkAllSage').checked = !!activeChar.allSageMode;
        document.getElementById('chkAllElements').checked = !!activeChar.allElementsMode;
        document.getElementById('selSpMode').value = activeChar.spMode || 'normal';
        document.getElementById('sLevel').innerText = activeChar.level;
        document.getElementById('sXp').innerText = activeChar.xp.toLocaleString('id-ID');
        document.getElementById('sGold').innerText = activeChar.gold.toLocaleString('id-ID');
        document.getElementById('sToken').innerText = activeChar.token.toLocaleString('id-ID');
        document.getElementById('sMcoin').innerText = (activeChar.mcoin || 0).toLocaleString('id-ID');
        document.getElementById('sCrystal').innerText = (activeChar.crystal || 0).toLocaleString('id-ID');
        document.getElementById('sPrestige').innerText = (activeChar.prestige || 0).toLocaleString('id-ID');
        document.getElementById('sPvpCurrency').innerText = (activeChar.pvpCurrency || 0).toLocaleString('id-ID');
        document.getElementById('sBloodlinePoint').innerText = (activeChar.bloodlinePoint || 0).toLocaleString('id-ID');
        document.getElementById('sSenjutsuSS').innerText = (activeChar.senjutsuSS || 0).toLocaleString('id-ID');
        document.getElementById('sHeartOfKari').innerText = (activeChar.heartOfKari || 0).toLocaleString('id-ID');
        document.getElementById('sCrystalOfKari').innerText = (activeChar.crystalOfKari || 0).toLocaleString('id-ID');
        document.getElementById('sHp').innerText = activeChar.hp.toLocaleString('id-ID');
        document.getElementById('sCp').innerText = activeChar.cp.toLocaleString('id-ID');
        document.getElementById('sAgi').innerText = activeChar.agi.toLocaleString('id-ID');
        document.getElementById('sSkills').innerText = activeChar.skillsCount + ' / ' + activeChar.petsCount + ' pet';
        document.getElementById('sGauntlet').innerText = activeChar.hasGauntlet
          ? ('Lv ' + activeChar.gauntletSlots + '/6')
          : 'Belum Punya';
        for (const stoneId of ['1144', '1145', '1146', '1147', '1148', '1150']) {
          document.getElementById('stone' + stoneId).value = activeChar.gauntletStones[stoneId] || 0;
        }

        document.getElementById('levelRange').value = activeChar.level;
        document.getElementById('levelBadge').innerText = 'Lv ' + activeChar.level;
        document.getElementById('inputXp').value = activeChar.xp || 0;
        updateXpHint(activeChar.level, activeChar.xp || 0);

        const els = activeChar.elements || [0, 0, 0, 0, 0];
        const invested = els.reduce((a, b) => a + (Number(b) || 0), 0);
        const pointPool = activeChar.level + (activeChar.attributePointBonus || 0);
        const ptLeft = pointPool - invested;
        document.getElementById('sPointLeft').innerText = ptLeft + ' / ' + pointPool;
        document.getElementById('sPointLeft').style.color = ptLeft < 0 ? '#ef4444' : '#eab308';
        document.getElementById('inputRefundPoints').max = invested;

        document.getElementById('inputElFire').value = els[0] || 0;
        document.getElementById('inputElWater').value = els[1] || 0;
        document.getElementById('inputElWind').value = els[2] || 0;
        document.getElementById('inputElEarth').value = els[3] || 0;
        document.getElementById('inputElLightning').value = els[4] || 0;
        hitungPointLeftLive();

        document.getElementById('inputGold').value = activeChar.gold;
        document.getElementById('inputToken').value = activeChar.token;
        document.getElementById('inputMcoin').value = activeChar.mcoin || 0;
        document.getElementById('inputCrystal').value = activeChar.crystal || 0;
        document.getElementById('inputPrestige').value = activeChar.prestige || 0;
        document.getElementById('inputPvpCurrency').value = activeChar.pvpCurrency || 0;
        document.getElementById('inputBloodlinePoint').value = activeChar.bloodlinePoint || 0;
        document.getElementById('inputSenjutsuSS').value = activeChar.senjutsuSS || 0;
        document.getElementById('inputHeartOfKari').value = activeChar.heartOfKari || 0;
        document.getElementById('inputCrystalOfKari').value = activeChar.crystalOfKari || 0;
        document.getElementById('clanCurrencyRow').style.display = activeChar.clan ? 'flex' : 'none';
        document.getElementById('inputClanGold').value = activeChar.clan ? activeChar.clan.gold : 0;
        document.getElementById('inputClanToken').value = activeChar.clan ? activeChar.clan.token : 0;
        const scrollsEl = document.getElementById('sScrolls');
        if (scrollsEl) scrollsEl.innerText = (activeChar.scrollOfWisdom || 0);
      }
    }

    async function selectChar(id) {
      try {
        const res = await fetch('/api/trainer/select-character', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id })
        });
        const data = await res.json();
        if (data.success) {
          state.activeId = String(id);
          render();
          showToast('Karakter trainer dipilih: ID ' + id);
        } else { showToast(data.message || 'Gagal memilih karakter', false); }
      } catch (e) { showToast(e.message, false); }
    }

    function calcXpForLevel(lv) {
      if (lv <= 1) return 0;
      let tot = 0;
      for (let i = 1; i < lv; i++) {
        tot += Math.round(i * 130 * Math.pow(50, i / 50));
      }
      return tot;
    }

    function calcLvByXp(xp) {
      let lv = 1;
      let tot = 0;
      while (lv < 80) {
        const nextCost = Math.round(lv * 130 * Math.pow(50, lv / 50));
        if (tot + nextCost > xp) break;
        tot += nextCost;
        lv++;
      }
      return lv;
    }

    function updateXpHint(lv, xp) {
      const hint = document.getElementById('xpHint');
      if (!hint) return;
      if (lv >= 80) {
        hint.innerHTML = 'Level Maksimal (Sennin). Min XP: ' + calcXpForLevel(80).toLocaleString('id-ID');
      } else {
        const curMin = calcXpForLevel(lv);
        const nextMin = calcXpForLevel(lv + 1);
        const diff = Math.max(0, nextMin - xp);
        hint.innerHTML = 'Rentang Lv ' + lv + ': ' + curMin.toLocaleString('id-ID') + ' s/d ' + (nextMin - 1).toLocaleString('id-ID') + ' XP &bull; Sisa <strong>' + diff.toLocaleString('id-ID') + ' XP</strong> lagi menuju Lv ' + (lv + 1);
      }
    }

    function onLevelSlider(val) {
      val = parseInt(val, 10);
      document.getElementById('levelBadge').innerText = 'Lv ' + val;
      const minXp = calcXpForLevel(val);
      document.getElementById('inputXp').value = minXp;
      updateXpHint(val, minXp);
    }

    function applyPreset(lvl) {
      document.getElementById('levelRange').value = lvl;
      document.getElementById('levelBadge').innerText = 'Lv ' + lvl;
      const minXp = calcXpForLevel(lvl);
      document.getElementById('inputXp').value = minXp;
      updateXpHint(lvl, minXp);
    }

    function onXpInput(val) {
      const xp = Math.max(0, parseInt(val, 10) || 0);
      const computedLv = calcLvByXp(xp);
      document.getElementById('levelRange').value = computedLv;
      document.getElementById('levelBadge').innerText = 'Lv ' + computedLv;
      updateXpHint(computedLv, xp);
    }

    function setXpNearLevelUp() {
      const curLv = parseInt(document.getElementById('levelRange').value, 10);
      if (curLv >= 80) {
        showToast('Sudah berada di Level Maksimal (Lv 80)');
        return;
      }
      const nextMin = calcXpForLevel(curLv + 1);
      const targetXp = Math.max(0, nextMin - 1);
      document.getElementById('inputXp').value = targetXp;
      updateXpHint(curLv, targetXp);
      showToast('XP diatur ke ' + targetXp.toLocaleString('id-ID') + ' (1 pertarungan lagi naik level!)');
    }

    async function simpanLevel() {
      const lvl = parseInt(document.getElementById('levelRange').value, 10);
      const xpVal = parseInt(document.getElementById('inputXp').value, 10);
      try {
        const res = await fetch('/api/trainer/set-level', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: state.activeId, level: lvl, xp: isNaN(xpVal) ? null : xpVal })
        });
        const d = await res.json();
        if (d.success) {
          showToast('Level & XP berhasil disimpan! (Lv ' + d.character.level + ' | ' + (d.character.xp || 0).toLocaleString('id-ID') + ' XP)');
          loadStatus();
        } else { showToast(d.message || 'Gagal mengubah level/XP', false); }
      } catch (e) { showToast(e.message, false); }
    }

    function hitungPointLeftLive() {
      const activeChar = getActiveChar();
      const lv = activeChar ? activeChar.level : 1;
      const bonus = activeChar ? (activeChar.attributePointBonus || 0) : 0;
      const fire = Math.max(0, parseInt(document.getElementById('inputElFire').value, 10) || 0);
      const water = Math.max(0, parseInt(document.getElementById('inputElWater').value, 10) || 0);
      const wind = Math.max(0, parseInt(document.getElementById('inputElWind').value, 10) || 0);
      const earth = Math.max(0, parseInt(document.getElementById('inputElEarth').value, 10) || 0);
      const lightning = Math.max(0, parseInt(document.getElementById('inputElLightning').value, 10) || 0);

      const invested = fire + water + wind + earth + lightning;
      const pointLeft = lv + bonus - invested;

      const badge = document.getElementById('badgePointLeft');
      if (badge) {
        badge.innerText = pointLeft;
        if (pointLeft < 0) {
          badge.style.background = 'linear-gradient(135deg, #ef4444, #b91c1c)';
        } else if (pointLeft === 0) {
          badge.style.background = 'linear-gradient(135deg, #64748b, #475569)';
        } else {
          badge.style.background = 'linear-gradient(135deg, #eab308, #ca8a04)';
        }
      }

      const summary = document.getElementById('apSummaryInfo');
      if (summary) {
        summary.innerHTML = 'Total Poin Terpakai: <strong>' + invested + '</strong> / ' + (lv + bonus) + ' AP (Level ' + lv + ' + Bonus ' + bonus + ') &bull; Sisa Point Left: <strong style="color: ' + (pointLeft < 0 ? '#ef4444' : '#eab308') + ';">' + pointLeft + '</strong>';
      }
    }

    function presetAttributes(type) {
      const activeChar = getActiveChar();
      const lv = activeChar ? activeChar.level + (activeChar.attributePointBonus || 0) : 1;
      let fire = 0, water = 0, wind = 0, earth = 0, lightning = 0;

      if (type === 'wind') {
        wind = lv;
      } else if (type === 'fire_thunder') {
        fire = Math.floor(lv / 2);
        lightning = lv - fire;
      } else if (type === 'balance') {
        const each = Math.floor(lv / 5);
        fire = each; water = each; wind = each; earth = each; lightning = each;
        wind += (lv % 5);
      } else if (type === 'reset') {
        fire = 0; water = 0; wind = 0; earth = 0; lightning = 0;
      }

      document.getElementById('inputElFire').value = fire;
      document.getElementById('inputElWater').value = water;
      document.getElementById('inputElWind').value = wind;
      document.getElementById('inputElEarth').value = earth;
      document.getElementById('inputElLightning').value = lightning;
      hitungPointLeftLive();
      showToast('Preset atribut diterapkan ke input');
    }

    async function simpanAttributes() {
      const fire = Math.max(0, parseInt(document.getElementById('inputElFire').value, 10) || 0);
      const water = Math.max(0, parseInt(document.getElementById('inputElWater').value, 10) || 0);
      const wind = Math.max(0, parseInt(document.getElementById('inputElWind').value, 10) || 0);
      const earth = Math.max(0, parseInt(document.getElementById('inputElEarth').value, 10) || 0);
      const lightning = Math.max(0, parseInt(document.getElementById('inputElLightning').value, 10) || 0);

      try {
        const res = await fetch('/api/trainer/set-attributes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: state.activeId,
            elements: [fire, water, wind, earth, lightning]
          })
        });
        const d = await res.json();
        if (d.success) {
          showToast('Alokasi atribut elemen berhasil disimpan!');
          loadStatus();
        } else { showToast(d.message || 'Gagal menyimpan atribut', false); }
      } catch (e) { showToast(e.message, false); }
    }

    async function tambahPointLeft() {
      const amount = Number(document.getElementById('inputRefundPoints').value);
      if (!Number.isSafeInteger(amount) || amount < 1) {
        showToast('Masukkan jumlah poin bulat yang lebih besar dari 0.', false);
        return;
      }
      try {
        const res = await fetch('/api/trainer/add-point-left', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: state.activeId, amount, element: document.getElementById('refundElement').value })
        });
        const d = await res.json();
        if (!d.success) {
          showToast(d.message || 'Gagal menambah Point Left', false);
          return;
        }
        await loadStatus();
        showToast(amount + ' poin elemen dikembalikan. Point Left sekarang ' + d.pointLeft + '. Muat ulang game untuk melihatnya.');
      } catch (e) { showToast(e.message, false); }
    }

    async function tambahBonusAP() {
      const amount = Number(document.getElementById('inputBonusAP').value);
      if (!Number.isSafeInteger(amount) || amount < 1 || amount > 100000) {
        showToast('Masukkan bonus antara 1 dan 100.000 poin.', false);
        return;
      }
      try {
        const res = await fetch('/api/trainer/add-bonus-ap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: state.activeId, amount })
        });
        const d = await res.json();
        if (!d.success) {
          showToast(d.message || 'Gagal menambah bonus Point Left', false);
          return;
        }
        await loadStatus();
        showToast('Bonus +' + amount + ' tersimpan. Point Left sekarang ' + d.pointLeft + '. Muat ulang game untuk melihatnya.');
      } catch (e) { showToast(e.message, false); }
    }

    async function resetAttributesToPointLeft() {
      presetAttributes('reset');
      await simpanAttributes();
      showToast('Semua elemen berhasil dikosongkan. Point Left kini terisi penuh!');
    }

    async function toggleCheat(name, value) {
      try {
        const payload = {};
        payload[name] = value;
        const res = await fetch('/api/trainer/toggle-cheat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const d = await res.json();
        if (d.success) {
          showToast(name === 'godMode' 
            ? ('God Mode ' + (value ? 'DIAKTIFKAN (Kebal)' : 'DIMATIKAN (Normal)'))
            : ('One-Hit Kill ' + (value ? 'DIAKTIFKAN' : 'DIMATIKAN')));
          loadStatus();
        } else { showToast(d.message || 'Gagal mengubah cheat', false); }
      } catch (e) { showToast(e.message, false); }
    }

    async function simpanCurrency(forceAll = false) {
      const activeChar = state.characters.find(c => String(c.id) === String(state.activeId));
      if (!activeChar) return showToast('Pilih karakter terlebih dahulu.', false);
      const fields = [
        ['inputGold', 'gold', activeChar.gold],
        ['inputToken', 'token', activeChar.token],
        ['inputMcoin', 'mcoin', activeChar.mcoin],
        ['inputCrystal', 'crystal', activeChar.crystal],
        ['inputPrestige', 'prestige', activeChar.prestige],
        ['inputPvpCurrency', 'pvp_currency', activeChar.pvpCurrency],
        ['inputBloodlinePoint', 'bloodlinePoint', activeChar.bloodlinePoint],
        ['inputSenjutsuSS', 'senjutsuSS', activeChar.senjutsuSS],
        ['inputHeartOfKari', 'heartOfKari', activeChar.heartOfKari],
        ['inputCrystalOfKari', 'crystalOfKari', activeChar.crystalOfKari],
      ];
      if (activeChar.clan) {
        fields.push(['inputClanGold', 'clanGold', activeChar.clan.gold]);
        fields.push(['inputClanToken', 'clanToken', activeChar.clan.token]);
      }
      const changes = {};
      for (const [inputId, key, oldValue] of fields) {
        const raw = document.getElementById(inputId).value.trim();
        const value = Number(raw);
        if (raw === '' || !Number.isSafeInteger(value) || value < 0) {
          return showToast('Saldo harus berupa bilangan bulat positif.', false);
        }
        if (forceAll || value !== Number(oldValue || 0)) changes[key] = value;
      }
      if (!Object.keys(changes).length) return showToast('Tidak ada saldo yang berubah.');
      try {
        const res = await fetch('/api/trainer/set-currency', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: state.activeId, ...changes })
        });
        const d = await res.json();
        if (d.success) {
          showToast('Saldo Dompet berhasil disimpan!');
          loadStatus();
        } else { showToast(d.message || 'Gagal menyimpan saldo', false); }
      } catch (e) { showToast(e.message, false); }
    }

    function addGold(n) {
      const cur = parseInt(document.getElementById('inputGold').value, 10) || 0;
      document.getElementById('inputGold').value = cur + n;
      simpanCurrency();
    }

    function addToken(n) {
      const cur = parseInt(document.getElementById('inputToken').value, 10) || 0;
      document.getElementById('inputToken').value = cur + n;
      simpanCurrency();
    }

    function addMcoin(n) {
      const cur = parseInt(document.getElementById('inputMcoin').value, 10) || 0;
      document.getElementById('inputMcoin').value = cur + n;
      simpanCurrency();
    }

    function addCrystal(n) {
      const cur = parseInt(document.getElementById('inputCrystal').value, 10) || 0;
      document.getElementById('inputCrystal').value = cur + n;
      simpanCurrency();
    }

    function addBalance(inputId, amount) {
      const input = document.getElementById(inputId);
      input.value = (parseInt(input.value, 10) || 0) + amount;
      simpanCurrency();
    }

    function maxCurrency() {
      document.getElementById('inputGold').value = 999999999;
      document.getElementById('inputToken').value = 999999;
      document.getElementById('inputMcoin').value = 999999;
      document.getElementById('inputCrystal').value = 999999;
      document.getElementById('inputPrestige').value = 999999;
      document.getElementById('inputPvpCurrency').value = 999999;
      document.getElementById('inputBloodlinePoint').value = 999999;
      document.getElementById('inputSenjutsuSS').value = 999999;
      document.getElementById('inputHeartOfKari').value = 5000;
      document.getElementById('inputCrystalOfKari').value = 5000;
      if (document.getElementById('clanCurrencyRow').style.display !== 'none') {
        document.getElementById('inputClanGold').value = 999999;
        document.getElementById('inputClanToken').value = 999999;
      }
      simpanCurrency(true);
    }

    async function unlockGauntlet() {
      try {
        const res = await fetch('/api/trainer/max-gauntlet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: state.activeId })
        });
        const d = await res.json();
        if (d.success) {
          showToast(d.message || 'Six-Element Gauntlet berhasil di-max!');
          loadStatus();
        } else { showToast(d.message || 'Gagal unlock gauntlet', false); }
      } catch (e) { showToast(e.message, false); }
    }

    function fillGauntletStones(amount) {
      for (const stoneId of ['1144', '1145', '1146', '1147', '1148', '1150'])
        document.getElementById('stone' + stoneId).value = amount;
      saveGauntletStones();
    }

    async function saveGauntletStones() {
      if (!getActiveChar()) return showToast('Pilih karakter terlebih dahulu.', false);
      const stones = {};
      for (const stoneId of ['1144', '1145', '1146', '1147', '1148', '1150']) {
        const raw = document.getElementById('stone' + stoneId).value.trim();
        const count = Number(raw);
        if (raw === '' || !Number.isSafeInteger(count) || count < 0 || count > 999999)
          return showToast('Jumlah batu harus antara 0 dan 999999.', false);
        stones[stoneId] = count;
      }
      try {
        const res = await fetch('/api/trainer/gauntlet-stones', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: state.activeId, stones })
        });
        const data = await res.json();
        if (!data.success) return showToast(data.message || 'Gagal menyimpan batu.', false);
        showToast('Jumlah batu disimpan. Muat ulang game.');
        loadStatus();
      } catch (error) { showToast(error.message, false); }
    }

    async function unlockPerk(perk) {
      try {
        const res = await fetch('/api/trainer/unlock-perk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: state.activeId, perk })
        });
        const d = await res.json();
        if (d.success) {
          showToast('Berhasil: ' + d.message);
          loadStatus();
        } else { showToast(d.message || 'Gagal', false); }
      } catch (e) { showToast(e.message, false); }
    }

    async function setAllTalents(enabled) {
      try {
        const res = await fetch('/api/trainer/all-talents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: state.activeId, enabled })
        });
        const d = await res.json();
        if (!res.ok || !d.success) throw new Error(d.message || 'Gagal mengubah mode talent');
        showToast(d.message);
        await loadStatus();
      } catch (e) {
        showToast(e.message, false);
        render();
      }
    }

    async function setAllSage(enabled) {
      try {
        const res = await fetch('/api/trainer/all-sage', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: state.activeId, enabled })
        });
        const d = await res.json();
        if (!res.ok || !d.success) throw new Error(d.message || 'Gagal mengubah mode Sage');
        showToast(d.message);
        await loadStatus();
      } catch (e) {
        showToast(e.message, false);
        render();
      }
    }

    async function setAllElements(enabled) {
      try {
        const res = await fetch('/api/trainer/all-elements', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: state.activeId, enabled })
        });
        const d = await res.json();
        if (!res.ok || !d.success) throw new Error(d.message || 'Gagal mengubah mode lima elemen');
        showToast(d.message);
        await loadStatus();
      } catch (e) {
        showToast(e.message, false);
        render();
      }
    }

    async function setSpMode(mode) {
      try {
        const res = await fetch('/api/trainer/sp-mode', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: state.activeId, mode })
        });
        const d = await res.json();
        if (!res.ok || !d.success) throw new Error(d.message || 'Gagal mengubah SP');
        showToast(d.message);
        await loadStatus();
      } catch (e) {
        showToast(e.message, false);
        render();
      }
    }

    async function resetCharConfirm() {
      if (!confirm('Yakin ingin mereset karakter ini ke Level 1 polosan? Semua skill dan item akan dikosongkan.')) return;
      try {
        const res = await fetch('/api/trainer/reset-character', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: state.activeId })
        });
        const d = await res.json();
        if (d.success) {
          showToast('Karakter berhasil di-reset ke Level 1!');
          loadStatus();
        } else { showToast(d.message || 'Gagal mereset', false); }
      } catch (e) { showToast(e.message, false); }
    }

    async function tambahScroll(jumlah) {
      try {
        const res = await fetch('/api/trainer/add-scrolls', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: state.activeId, count: jumlah })
        });
        const d = await res.json();
        if (d.success) {
          showToast(d.message);
          loadStatus();
        } else { showToast(d.message || 'Gagal menambah scroll', false); }
      } catch (e) { showToast(e.message, false); }
    }

    async function kuasaiElemen(elem) {
      try {
        const res = await fetch('/api/trainer/learn-element', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: state.activeId, element: elem })
        });
        const d = await res.json();
        if (d.success) {
          showToast(d.message);
          loadStatus();
        } else { showToast(d.message || 'Gagal mempelajari elemen', false); }
      } catch (e) { showToast(e.message, false); }
    }

    loadStatus();
  </script>
</body>
</html>`;
}

// ---------------------------------------------------------------
// HTTP Handler
// ---------------------------------------------------------------
function kirimJson(res, statusCode, obj) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
  });
  res.end(JSON.stringify(obj));
}

function parseJsonBody(req, callback) {
  const parts = [];
  req.on('data', c => parts.push(c));
  req.on('end', () => {
    try {
      const text = Buffer.concat(parts).toString('utf8');
      const data = text ? JSON.parse(text) : {};
      callback(null, data);
    } catch (e) {
      callback(e, null);
    }
  });
}

function handleRequest(req, res) {
  if (weaponImporterRoutes(req, res)) return true;
  const [urlPath] = (req.url || '').split('?');

  if (urlPath === '/trainer' || urlPath === '/trainer/') {
    const html = renderTrainerHtml();
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': Buffer.byteLength(html),
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    });
    res.end(html);
    return true;
  }

  if (urlPath === '/api/trainer/status' && req.method === 'GET') {
    try {
      kirimJson(res, 200, getTrainerData());
    } catch (e) {
      kirimJson(res, 500, { error: e.message });
    }
    return true;
  }

  if (urlPath === '/api/trainer/select-character' && req.method === 'POST') {
    parseJsonBody(req, (err, body) => {
      if (err) return kirimJson(res, 400, { success: false, message: 'JSON tidak valid' });
      const id = String(body.id || '');
      if (!chars.listCharacters().some(c => String(c.character_id) === id)) {
        return kirimJson(res, 404, { success: false, message: 'Karakter tidak ditemukan' });
      }
      trainerSelectedId = id;
      kirimJson(res, 200, { success: true, activeId: id });
    });
    return true;
  }

  if (urlPath === '/api/trainer/set-level' && req.method === 'POST') {
    parseJsonBody(req, (err, body) => {
      if (err) return kirimJson(res, 400, { success: false, message: 'JSON tidak valid' });
      const id = String(body.id || chars.getActiveId());
      const level = (body.level !== undefined && body.level !== null && body.level !== '') ? Number(body.level) : null;
      const xp = (body.xp !== undefined && body.xp !== null && body.xp !== '') ? Number(body.xp) : null;
      try {
        const c = chars.setLevel(id, level, xp);
        if (!c) return kirimJson(res, 404, { success: false, message: 'Karakter tidak ditemukan' });
        kirimJson(res, 200, { success: true, character: c });
      } catch (e) {
        kirimJson(res, e instanceof RangeError ? 400 : 500, { success: false, message: e.message });
      }
    });
    return true;
  }

  if (urlPath === '/api/trainer/set-currency' && req.method === 'POST') {
    parseJsonBody(req, (err, body) => {
      if (err) return kirimJson(res, 400, { success: false, message: 'JSON tidak valid' });
      const id = String(body.id || chars.getActiveId());
      try {
        const c = chars.setCurrencies(id, body);
        if (!c) return kirimJson(res, 404, { success: false, message: 'Karakter tidak ditemukan' });
        kirimJson(res, 200, { success: true, character: c });
      } catch (e) {
        kirimJson(res, 500, { success: false, message: e.message });
      }
    });
    return true;
  }

  if (urlPath === '/api/trainer/set-attributes' && req.method === 'POST') {
    parseJsonBody(req, (err, body) => {
      if (err) return kirimJson(res, 400, { success: false, message: 'JSON tidak valid' });
      const id = String(body.id || chars.getActiveId());
      const elements = Array.isArray(body.elements) ? body.elements : [
        Number(body.fire) || 0,
        Number(body.water) || 0,
        Number(body.wind) || 0,
        Number(body.earth) || 0,
        Number(body.lightning) || 0,
      ];
      try {
        const c = chars.setElements(elements, id);
        if (!c) return kirimJson(res, 404, { success: false, message: 'Karakter tidak ditemukan' });
        kirimJson(res, 200, { success: true, character: c });
      } catch (e) {
        kirimJson(res, 500, { success: false, message: e.message });
      }
    });
    return true;
  }

  if (urlPath === '/api/trainer/add-point-left' && req.method === 'POST') {
    parseJsonBody(req, (err, body) => {
      if (err) return kirimJson(res, 400, { success: false, message: 'JSON tidak valid' });
      try {
        const result = chars.refundAttributePoints(body.id || chars.getActiveId(), body.amount, body.element);
        if (!result) return kirimJson(res, 404, { success: false, message: 'Karakter tidak ditemukan' });
        kirimJson(res, 200, { success: true, pointLeft: result.pointLeft });
      } catch (e) {
        kirimJson(res, 400, { success: false, message: e.message });
      }
    });
    return true;
  }

  if (urlPath === '/api/trainer/add-bonus-ap' && req.method === 'POST') {
    parseJsonBody(req, (err, body) => {
      if (err) return kirimJson(res, 400, { success: false, message: 'JSON tidak valid' });
      try {
        const result = chars.addAttributePointBonus(body.id || chars.getActiveId(), body.amount);
        if (!result) return kirimJson(res, 404, { success: false, message: 'Karakter tidak ditemukan' });
        kirimJson(res, 200, { success: true, bonus: result.bonus, pointLeft: result.pointLeft });
      } catch (e) {
        kirimJson(res, 400, { success: false, message: e.message });
      }
    });
    return true;
  }

  if (urlPath === '/api/trainer/toggle-cheat' && req.method === 'POST') {
    parseJsonBody(req, (err, body) => {
      if (err) return kirimJson(res, 400, { success: false, message: 'JSON tidak valid' });
      try {
        const result = setCheatsStatus(body);
        kirimJson(res, 200, { success: true, cheats: result });
      } catch (e) {
        kirimJson(res, 500, { success: false, message: e.message });
      }
    });
    return true;
  }

  if (urlPath === '/api/trainer/unlock-perk' && req.method === 'POST') {
    parseJsonBody(req, (err, body) => {
      if (err) return kirimJson(res, 400, { success: false, message: 'JSON tidak valid' });
      const id = String(body.id || chars.getActiveId());
      const perk = body.perk;
      try {
        if (perk === 'tails') {
          chars.unlockAllTails(id);
          return kirimJson(res, 200, { success: true, message: 'Semua 9 Tailed Beasts berhasil dibuka!' });
        } else if (perk === 'skills') {
          chars.unlockBasicSkills(id);
          return kirimJson(res, 200, { success: true, message: 'Semua Jutsu & Kinjutsu dasar berhasil dibuka!' });
        } else if (perk === 'clan_stamina') {
          chars.refillClanStamina(id);
          return kirimJson(res, 200, { success: true, message: 'Stamina klan berhasil dipulihkan penuh!' });
        }
        kirimJson(res, 400, { success: false, message: 'Perk tidak dikenal' });
      } catch (e) {
        kirimJson(res, 500, { success: false, message: e.message });
      }
    });
    return true;
  }

  if (urlPath === '/api/trainer/all-talents' && req.method === 'POST') {
    parseJsonBody(req, (err, body) => {
      if (err) return kirimJson(res, 400, { success: false, message: 'JSON tidak valid' });
      if (typeof body.enabled !== 'boolean') {
        return kirimJson(res, 400, { success: false, message: 'Nilai mode harus true atau false' });
      }
      const id = String(body.id || '');
      const enabled = chars.setAllTalentsMode(id, body.enabled);
      if (enabled === null) {
        return kirimJson(res, 404, { success: false, message: 'Karakter tidak ditemukan' });
      }
      kirimJson(res, 200, { success: true, enabled,
        message: enabled ? 'Mode Semua Talent aktif. Muat ulang game.'
                         : 'Mode Semua Talent dimatikan. Muat ulang game.' });
    });
    return true;
  }

  if (urlPath === '/api/trainer/all-sage' && req.method === 'POST') {
    parseJsonBody(req, (err, body) => {
      if (err) return kirimJson(res, 400, { success: false, message: 'JSON tidak valid' });
      if (typeof body.enabled !== 'boolean') {
        return kirimJson(res, 400, { success: false, message: 'Nilai mode harus true atau false' });
      }
      const enabled = chars.setAllSageMode(String(body.id || ''), body.enabled);
      if (enabled === null) return kirimJson(res, 404, { success: false, message: 'Karakter tidak ditemukan' });
      kirimJson(res, 200, { success: true, enabled,
        message: enabled ? 'Mode Semua Sage aktif; semua skill aktif terpasang. Muat ulang game.' : 'Mode Semua Sage dimatikan. Muat ulang game.' });
    });
    return true;
  }

  if (urlPath === '/api/trainer/all-elements' && req.method === 'POST') {
    parseJsonBody(req, (err, body) => {
      if (err) return kirimJson(res, 400, { success: false, message: 'JSON tidak valid' });
      if (typeof body.enabled !== 'boolean') {
        return kirimJson(res, 400, { success: false, message: 'Nilai mode harus true atau false' });
      }
      const enabled = chars.setAllElementsMode(String(body.id || ''), body.enabled);
      if (enabled === null) return kirimJson(res, 404, { success: false, message: 'Karakter tidak ditemukan' });
      kirimJson(res, 200, { success: true, enabled,
        message: enabled ? 'Mode Lima Elemen aktif; pilih jutsu yang ingin dipasang. Muat ulang game.'
                         : 'Mode Lima Elemen dimatikan. Muat ulang game.' });
    });
    return true;
  }

  if (urlPath === '/api/trainer/sp-mode' && req.method === 'POST') {
    parseJsonBody(req, (err, body) => {
      if (err) return kirimJson(res, 400, { success: false, message: 'JSON tidak valid' });
      if (!chars.SP_MODES.includes(body.mode)) {
        return kirimJson(res, 400, { success: false, message: 'Mode SP tidak dikenal' });
      }
      const mode = chars.setSpMode(String(body.id || ''), body.mode);
      if (mode === null) return kirimJson(res, 404, { success: false, message: 'Karakter tidak ditemukan' });
      kirimJson(res, 200, { success: true, mode, message: 'Mode SP disimpan. Muat ulang game.' });
    });
    return true;
  }

  if (urlPath === '/api/trainer/max-gauntlet' && req.method === 'POST') {
    parseJsonBody(req, (err, body) => {
      if (err) return kirimJson(res, 400, { success: false, message: 'JSON tidak valid' });
      const id = String(body.id || chars.getActiveId());
      try {
        const c = chars.unlockGauntletMax(id);
        if (!c) return kirimJson(res, 404, { success: false, message: 'Karakter tidak ditemukan' });
        kirimJson(res, 200, {
          success: true,
          message: 'Six-Element Gauntlet (wpn1596), Kinjutsu: Unstoppable Rage, dan 6 Batu berhasil dimaksimalkan!',
          character: c,
        });
      } catch (e) {
        kirimJson(res, 500, { success: false, message: e.message });
      }
    });
    return true;
  }

  if (urlPath === '/api/trainer/gauntlet-stones' && req.method === 'POST') {
    parseJsonBody(req, (err, body) => {
      if (err) return kirimJson(res, 400, { success: false, message: 'JSON tidak valid' });
      try {
        const result = chars.setGauntletStones(String(body.id || ''), body.stones);
        if (!result) return kirimJson(res, 404, { success: false, message: 'Karakter tidak ditemukan' });
        kirimJson(res, 200, {
          success: true,
          stones: Object.fromEntries(chars.GAUNTLET_STONE_IDS.map(stoneId =>
            [stoneId, Number(result.character.materials[stoneId]) || 0])),
        });
      } catch (error) {
        kirimJson(res, 400, { success: false, message: error.message });
      }
    });
    return true;
  }

  if (urlPath === '/api/trainer/add-scrolls' && req.method === 'POST') {
    parseJsonBody(req, (err, body) => {
      if (err) return kirimJson(res, 400, { success: false, message: 'JSON tidak valid' });
      const id = String(body.id || chars.getActiveId());
      const count = parseInt(body.count, 10) || 1;
      try {
        const c = chars.addSecretScrolls(id, count);
        if (!c) return kirimJson(res, 404, { success: false, message: 'Karakter tidak ditemukan' });
        kirimJson(res, 200, {
          success: true,
          message: count + ' Secret Scroll of Wisdom berhasil ditambahkan!',
          scrolls: chars.getSecretScrollCount(c)
        });
      } catch (e) {
        kirimJson(res, 500, { success: false, message: e.message });
      }
    });
    return true;
  }

  if (urlPath === '/api/trainer/learn-element' && req.method === 'POST') {
    parseJsonBody(req, (err, body) => {
      if (err) return kirimJson(res, 400, { success: false, message: 'JSON tidak valid' });
      const id = String(body.id || chars.getActiveId());
      const element = String(body.element || 'all');
      try {
        const learned = chars.unlockElementSkills(id, element);
        kirimJson(res, 200, {
          success: true,
          message: 'Berhasil mempelajari ' + (learned.length ? learned.length + ' ' : '') + 'jutsu elemen ' + element.toUpperCase() + '!',
          learnedCount: learned.length
        });
      } catch (e) {
        kirimJson(res, 500, { success: false, message: e.message });
      }
    });
    return true;
  }

  if (urlPath === '/api/trainer/reset-character' && req.method === 'POST') {
    parseJsonBody(req, (err, body) => {
      if (err) return kirimJson(res, 400, { success: false, message: 'JSON tidak valid' });
      const id = String(body.id || chars.getActiveId());
      try {
        const c = chars.resetCharacter(id);
        if (!c) return kirimJson(res, 404, { success: false, message: 'Karakter tidak ditemukan' });
        kirimJson(res, 200, { success: true, message: 'Karakter berhasil di-reset ke Level 1' });
      } catch (e) {
        kirimJson(res, 500, { success: false, message: e.message });
      }
    });
    return true;
  }

  return false;
}

module.exports = {
  getCheatsStatus,
  setCheatsStatus,
  getTrainerData,
  handleRequest,
};

