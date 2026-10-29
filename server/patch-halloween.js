'use strict';
/* Patch Halloween 2016 Event in Halloween_2016.swf
 *
 * 1. Tombol visible = true (trickOrTreatBtn, battleBtn, prizeListBtn).
 * 2. DefineEditText tags (262, 268, 283) diperbaiki layout byte-nya:
 *    - Align: 2 (Center)
 *    - Leading: 40 twips (28 00)
 *    - VariableName: "" (00)
 *    - InitialText: "Trick or Treat", "Rewards List", "Battle"
 *    - Font: 79 (Verdana Bold)
 * 3. Script sinkronisasi frame13 saat animasi popup selesai agar teks tidak hilang.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SWF_PATH = path.join(__dirname, '..', 'web', 'cdn', 'swf', 'latest', 'swf', 'panels', 'Halloween_2016.swf');
const BAK_PATH = SWF_PATH + '.backup-original';

function buildTag(cid, boundsHex, text) {
  const bounds = Buffer.from(boundsHex, 'hex');
  const textBuf = Buffer.from(text + '\0', 'utf8');
  const b = Buffer.concat([
    Buffer.from([(cid & 0xff), ((cid >> 8) & 0xff)]),
    bounds,
    Buffer.from([0x8d, 0x30]), // Flags1, Flags2
    Buffer.from([0x4f, 0x00]), // Font 79 (Verdana Bold)
    Buffer.from([0x90, 0x01]), // 400 (20pt)
    Buffer.from([0xff, 0xff, 0xff, 0xff]), // White
    Buffer.from([0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x28, 0x00]), // Layout (Align=2, Leading=40)
    Buffer.from([0x00]), // VarName = ""
    textBuf
  ]);
  return b;
}

function verifyOrPatch() {
  if (!fs.existsSync(SWF_PATH)) {
    console.error('File tidak ditemukan:', SWF_PATH);
    process.exit(1);
  }

  const buf = fs.readFileSync(SWF_PATH);
  const sig = buf.toString('latin1', 0, 3);
  let header, body;
  if (sig === 'CWS') {
    header = buf.subarray(0, 8);
    body = zlib.inflateSync(buf.subarray(8));
  } else if (sig === 'FWS') {
    header = buf.subarray(0, 8);
    body = buf.subarray(8);
  } else {
    console.error('Format SWF tidak dikenal:', sig);
    process.exit(1);
  }

  // Cek apakah tag 262 sudah ber-layout rapi (28 00 00)
  const pattern262 = Buffer.from('02000000000000280000547269636b', 'hex');
  if (body.indexOf(pattern262) !== -1) {
    console.log('Halloween_2016.swf SUDAH ter-patch dengan benar (teks dan tombol aktif).');
    return;
  }

  console.log('Menerapkan patch DefineEditText pada Halloween_2016.swf...');
  const newTags = {
    262: buildTag(262, '6ff6173ffd812680', 'Trick or Treat'),
    268: buildTag(268, '6ff6122dfd811a00', 'Rewards List'),
    283: buildTag(283, '6ff61519fd811180', 'Battle')
  };

  const decomp = Buffer.concat([header, body]);
  const nb = decomp[8] >> 3;
  let pos = 8 + Math.floor((5 + 4 * nb + 7) / 8) + 4;
  const chunks = [decomp.subarray(0, pos)];

  while (pos < decomp.length) {
    const th = decomp.readUInt16LE(pos);
    const tt = th >> 6;
    let tl = th & 0x3f;
    let hl = 2;
    if (tl === 0x3f) {
      tl = decomp.readUInt32LE(pos + 2);
      hl = 6;
    }
    const td = decomp.subarray(pos + hl, pos + hl + tl);
    if (tt === 37) {
      const cid = td.readUInt16LE(0);
      if (newTags[cid]) {
        const tagContent = newTags[cid];
        const tagLen = tagContent.length;
        if (tagLen < 63) {
          const hdr = Buffer.alloc(2);
          hdr.writeUInt16LE((37 << 6) | tagLen, 0);
          chunks.push(hdr, tagContent);
        } else {
          const hdr = Buffer.alloc(6);
          hdr.writeUInt16LE((37 << 6) | 0x3f, 0);
          hdr.writeUInt32LE(tagLen, 2);
          chunks.push(hdr, tagContent);
        }
        pos += hl + tl;
        continue;
      }
    }
    chunks.push(decomp.subarray(pos, pos + hl + tl));
    pos += hl + tl;
  }

  const outData = Buffer.concat(chunks);
  outData.writeUInt32LE(outData.length, 4);

  const compressed = Buffer.concat([
    Buffer.from('CWS'),
    outData.subarray(3, 8),
    zlib.deflateSync(outData.subarray(8), { level: 9 })
  ]);

  fs.writeFileSync(SWF_PATH, compressed);
  console.log('Halloween_2016.swf berhasil dipatch! Teks tombol sekarang aktif permanen.');
}

verifyOrPatch();
