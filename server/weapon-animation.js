/* GIF89a decoding and playback shared by the editor and weapon builder. No packages required. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WeaponAnimation = api;
})(typeof globalThis === 'object' ? globalThis : this, function() {
  'use strict';
  const LIMITS = { side: 1024, frames: 120, pixels: 16 * 1024 * 1024, duration: 30000, bytes: 5 * 1024 * 1024 };
  function decodeGIF(input) {
    const bytes = new Uint8Array(input), frames = []; let pos = 0, duration = 0;
    function need(count) { if (pos + count > bytes.length) throw new Error('GIF terpotong.'); }
    function byte() { need(1); return bytes[pos++]; }
    function word() { const lo = byte(); return lo | byte() << 8; }
    function take(count) { need(count); const value = bytes.subarray(pos, pos + count); pos += count; return value; }
    function blocks() {
      const parts = []; let length = 0, n;
      while ((n = byte())) { const data = take(n); parts.push(data); length += n; }
      const result = new Uint8Array(length); let offset = 0;
      for (const part of parts) { result.set(part, offset); offset += part.length; }
      return result;
    }
    if (bytes.length > LIMITS.bytes) throw new Error('GIF maksimal 5 MB.');
    const signature = String.fromCharCode(...take(6));
    if (signature !== 'GIF89a' && signature !== 'GIF87a') throw new Error('GIF tidak valid.');
    const width = word(), height = word(), packed = byte(), backgroundIndex = byte(); byte();
    if (!width || !height || width > LIMITS.side || height > LIMITS.side) throw new Error('GIF maksimal 1024 × 1024 piksel.');
    const globalPalette = packed & 128 ? take(3 * (1 << ((packed & 7) + 1))) : null;
    const background = globalPalette && backgroundIndex * 3 + 2 < globalPalette.length ? [...globalPalette.subarray(backgroundIndex * 3, backgroundIndex * 3 + 3), 255] : [0,0,0,0];
    let canvas = new Uint8Array(width * height * 4), control = { disposal: 0, delay: 100, transparent: null }, ended = false;
    while (pos < bytes.length) {
      const marker = byte();
      if (marker === 0x3b) { ended = true; break; }
      if (marker === 0x21) {
        const label = byte();
        if (label === 0xf9) {
          if (byte() !== 4) throw new Error('Kontrol frame GIF tidak valid.');
          const flags = byte(), delay = word(), transparent = byte();
          if (byte() !== 0 || (flags >> 2 & 7) > 3) throw new Error('Disposal GIF tidak valid.');
          control = { disposal: flags >> 2 & 7, delay: delay < 2 ? 100 : delay * 10, transparent: flags & 1 ? transparent : null };
        } else {
          if (label === 1) throw new Error('GIF dengan frame teks belum didukung.');
          blocks();
        }
        continue;
      }
      if (marker !== 0x2c) throw new Error('Blok GIF tidak valid.');
      const left = word(), top = word(), w = word(), h = word(), flags = byte();
      if (!w || !h || left + w > width || top + h > height) throw new Error('Ukuran frame GIF tidak valid.');
      if (frames.length >= LIMITS.frames || (frames.length + 1) * width * height > LIMITS.pixels) throw new Error('GIF terlalu berat. Maksimal 120 frame dan total 16 juta piksel.');
      duration += control.delay;
      if (duration > LIMITS.duration) throw new Error('Satu putaran GIF maksimal 30 detik.');
      const palette = flags & 128 ? take(3 * (1 << ((flags & 7) + 1))) : globalPalette;
      if (!palette) throw new Error('Palet GIF tidak ditemukan.');
      const minimum = byte(), indices = lzw(blocks(), minimum, w * h);
      if (!frames.length && control.transparent === null) for (let i = 0; i < canvas.length; i += 4) canvas.set(background, i);
      const previous = control.disposal === 3 ? canvas.slice() : null;
      const rows = [];
      if (flags & 64) for (const [start, step] of [[0,8],[4,8],[2,4],[1,2]]) for (let y = start; y < h; y += step) rows.push(y);
      else for (let y = 0; y < h; y++) rows.push(y);
      let source = 0;
      for (const y of rows) for (let x = 0; x < w; x++) {
        const index = indices[source++]; if (index === control.transparent) continue;
        if (index * 3 + 2 >= palette.length) throw new Error('Warna GIF di luar palet.');
        const offset = ((top + y) * width + left + x) * 4;
        canvas.set(palette.subarray(index * 3, index * 3 + 3), offset); canvas[offset + 3] = 255;
      }
      frames.push({ rgba: canvas.slice(), delay: control.delay });
      if (control.disposal === 2) {
        const fill = control.transparent === null ? background : [0,0,0,0];
        for (let y = top; y < top + h; y++) for (let x = left; x < left + w; x++) canvas.set(fill, (y * width + x) * 4);
      } else if (previous) canvas = previous;
      control = { disposal: 0, delay: 100, transparent: null };
    }
    if (!ended || !frames.length) throw new Error('GIF tidak lengkap atau tidak memiliki frame.');
    return { width, height, frames, duration };
  }
  function lzw(bytes, minimum, expected) {
    if (minimum < 2 || minimum > 8) throw new Error('Kompresi GIF tidak valid.');
    const clear = 1 << minimum, end = clear + 1, result = new Uint8Array(expected);
    let table, size, next, previous, bit = 0, written = 0, ended = false, cleared = false;
    function reset() { table = Array.from({length: clear}, (_, i) => Uint8Array.of(i)); size = minimum + 1; next = end + 1; previous = null; }
    reset();
    while (bit + size <= bytes.length * 8) {
      let code = 0; for (let i = 0; i < size; i++, bit++) code |= (bytes[bit >> 3] >> (bit & 7) & 1) << i;
      if (code === clear) { reset(); cleared = true; continue; }
      if (!cleared) throw new Error('Awal kompresi GIF tidak valid.');
      if (code === end) { ended = true; break; }
      let entry;
      if (code < next && table[code]) entry = table[code];
      else if (code === next && previous) { entry = new Uint8Array(previous.length + 1); entry.set(previous); entry[previous.length] = previous[0]; }
      else throw new Error('Kode kompresi GIF tidak valid.');
      if (written + entry.length > expected) throw new Error('Piksel GIF melebihi ukuran frame.');
      result.set(entry, written); written += entry.length;
      if (previous && next < 4096) {
        const value = new Uint8Array(previous.length + 1); value.set(previous); value[previous.length] = entry[0]; table[next++] = value;
        if (next === 1 << size && size < 12) size++;
      }
      previous = entry;
    }
    if (!ended || written !== expected) throw new Error('Data piksel GIF terpotong.');
    return result;
  }
  function frameAt(elapsed, delays, speed = 1) {
    const durations = delays.map(delay => Math.max(1, Math.round(delay / speed)));
    const total = durations.reduce((sum, delay) => sum + delay, 0);
    if (!total) return 0;
    let time = ((elapsed % total) + total) % total;
    for (let i = 0; i < durations.length; i++) { if (time < durations[i]) return i; time -= durations[i]; }
    return 0;
  }
  return { decodeGIF, frameAt, LIMITS };
});

// Python's SWF builder uses the same decoder as the browser, including disposal and timing.
if (typeof require === 'function' && require.main === module) {
  const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib');
  function crc32(bytes) { let crc = -1; for (const byte of bytes) { crc ^= byte; for (let j = 0; j < 8; j++) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0); } return (crc ^ -1) >>> 0; }
  function chunk(type, bytes) { const name = Buffer.from(type), length = Buffer.alloc(4), crc = Buffer.alloc(4); length.writeUInt32BE(bytes.length); crc.writeUInt32BE(crc32(Buffer.concat([name, bytes]))); return Buffer.concat([length, name, bytes, crc]); }
  try {
    const animation = module.exports.decodeGIF(fs.readFileSync(process.argv[2])), destination = process.argv[3];
    fs.mkdirSync(destination, {recursive: true});
    const header = Buffer.alloc(13); header.writeUInt32BE(animation.width); header.writeUInt32BE(animation.height, 4); header[8] = 8; header[9] = 6;
    const entries = animation.frames.map((frame, i) => {
      const rows = Buffer.alloc(animation.height * (animation.width * 4 + 1));
      for (let y = 0; y < animation.height; y++) rows.set(frame.rgba.subarray(y * animation.width * 4, (y + 1) * animation.width * 4), y * (animation.width * 4 + 1) + 1);
      const name = 'frame-' + i + '.png';
      fs.writeFileSync(path.join(destination, name), Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]));
      return { file: name, delay: frame.delay };
    });
    fs.writeFileSync(path.join(destination, 'frames.json'), JSON.stringify({width: animation.width, height: animation.height, duration: animation.duration, frames: entries}));
  } catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1; }
}
