/* Shared Canvas/SWF placement math. Values are in the weapon holder's game units. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WeaponPosition = api;
})(typeof globalThis === 'object' ? globalThis : this, function() {
  'use strict';
  function matrix(width, height, settings) {
    const scale = Math.min(Number(settings.displayHeight) / height, 350 / width);
    const angle = Number(settings.rotation) * Math.PI / 180;
    const cosine = Math.cos(angle) * scale, sine = Math.sin(angle) * scale;
    const sx = settings.flipX ? -1 : 1, sy = settings.flipY ? -1 : 1;
    const a = cosine * sx, b = sine * sx, c = -sine * sy, d = cosine * sy;
    const px = Number(settings.pivotX) * width, py = Number(settings.pivotY) * height;
    const fixed = v => Math.round(v * 65536) / 65536;
    return { a: fixed(a), b: fixed(b), c: fixed(c), d: fixed(d),
      tx: Math.round(20 * ((Number(settings.offsetX) || 0) - a * px - c * py)) / 20,
      ty: Math.round(20 * ((Number(settings.offsetY) || 0) - b * px - d * py)) / 20 };
  }
  function compose(outer, inner) {
    return { a: outer.a * inner.a + outer.c * inner.b, b: outer.b * inner.a + outer.d * inner.b,
      c: outer.a * inner.c + outer.c * inner.d, d: outer.b * inner.c + outer.d * inner.d,
      tx: outer.a * inner.tx + outer.c * inner.ty + outer.tx, ty: outer.b * inner.tx + outer.d * inner.ty + outer.ty };
  }
  function point(m, p) { return { x: m.a * p.x + m.c * p.y + m.tx, y: m.b * p.x + m.d * p.y + m.ty }; }
  function inverse(m) {
    const determinant = m.a * m.d - m.b * m.c;
    if (Math.abs(determinant) < 1e-10) throw new Error('Transform tidak dapat dibalik.');
    return { a: m.d / determinant, b: -m.b / determinant, c: -m.c / determinant, d: m.a / determinant,
      tx: (m.c * m.ty - m.d * m.tx) / determinant, ty: (m.b * m.tx - m.a * m.ty) / determinant };
  }
  function localDelta(holder, dx, dy) {
    const inv = inverse(holder);
    return { x: inv.a * dx + inv.c * dy, y: inv.b * dx + inv.d * dy };
  }
  return { matrix, compose, point, inverse, localDelta };
});
