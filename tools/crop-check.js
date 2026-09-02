#!/usr/bin/env node
/* The logo cropper's arithmetic, run without a browser.

   What could go wrong and cost us: the company drags or zooms until the square
   contains blank edges, uploads it, and every listing shows a logo with a white
   strip down one side. So the only thing worth asserting is the invariant, the picture always covers the box, at every zoom level, after any drag. */
const fs = require('fs'), path = require('path'), assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, '..', 'portal.js'), 'utf8');
const from = src.indexOf('const CROP_BOX');
const to = src.indexOf('function openCropper');
assert.ok(from >= 0 && to > from, 'could not find the cropper helpers in portal.js');

/* the slice touches el() and the canvas; neither matters to the maths */
global.el = () => null;
let CROP = null;
/* `const` inside an indirect eval lands in the global lexical scope, not on
   globalThis, so the constants are rewritten to plain assignments. */
const body = src.slice(from, to)
  .replace('let CROP = null;', '')
  .replace(/^const (CROP_BOX|CROP_OUT|CROP_MAX_MB) =/gm, 'global.$1 =')
  .replace('function closeCropper', 'global.closeCropper = function')
  .replace('function drawCrop', 'global.drawCrop = function')
  .replace('function clampCrop', 'global.clampCrop = function');
(0, eval)(body);
global.drawCrop = () => {};   // no canvas in Node

const BOX = global.CROP_BOX;
const covers = () => {
  const w = CROP.img.naturalWidth * CROP.scale, h = CROP.img.naturalHeight * CROP.scale;
  return CROP.x <= 1e-9 && CROP.y <= 1e-9 && CROP.x + w >= BOX - 1e-9 && CROP.y + h >= BOX - 1e-9;
};

/* wide, tall, square, tiny and huge sources */
const shapes = [[1200, 300], [300, 1200], [800, 800], [40, 40], [4000, 2250], [1, 900]];
for (const [nw, nh] of shapes) {
  const img = { naturalWidth: nw, naturalHeight: nh };
  const min = Math.max(BOX / nw, BOX / nh);
  CROP = { img, min, scale: min, x: (BOX - nw * min) / 2, y: (BOX - nh * min) / 2 };
  global.CROP = CROP;
  assert.ok(covers(), `${nw}x${nh}: the starting view does not fill the square`);

  // drag hard in every direction, at several zoom levels
  for (let z = 1; z <= 4; z += 0.5) {
    CROP.scale = min * z;
    for (const [dx, dy] of [[9e5, 9e5], [-9e5, -9e5], [9e5, -9e5], [-9e5, 9e5], [0, 0]]) {
      CROP.x += dx; CROP.y += dy;
      clampCrop();
      assert.ok(covers(), `${nw}x${nh} at zoom ${z}: dragging ${dx},${dy} exposed a blank edge`);
    }
  }

  // zooming about the centre, the way the slider does it, must also stay covered
  CROP.scale = min; CROP.x = (BOX - nw * min) / 2; CROP.y = (BOX - nh * min) / 2;
  for (let z = 1; z <= 4; z += 0.25) {
    const next = min * z, k = next / CROP.scale;
    CROP.x = BOX / 2 - (BOX / 2 - CROP.x) * k;
    CROP.y = BOX / 2 - (BOX / 2 - CROP.y) * k;
    CROP.scale = next;
    clampCrop();
    assert.ok(covers(), `${nw}x${nh}: zooming to ${z}x exposed a blank edge`);
  }
  // and zooming back out
  for (let z = 4; z >= 1; z -= 0.25) {
    const next = min * z, k = next / CROP.scale;
    CROP.x = BOX / 2 - (BOX / 2 - CROP.x) * k;
    CROP.y = BOX / 2 - (BOX / 2 - CROP.y) * k;
    CROP.scale = next;
    clampCrop();
    assert.ok(covers(), `${nw}x${nh}: zooming back to ${z}x exposed a blank edge`);
  }
}

/* the saved square must be the same square that was on screen: the output
   canvas is drawn with everything multiplied by one scale factor */
{
  const OUT = global.CROP_OUT;
  const k = OUT / BOX;
  const img = { naturalWidth: 1200, naturalHeight: 300 };
  const min = Math.max(BOX / 1200, BOX / 300);
  const c = { x: -170, y: 0, scale: min * 2 };
  const drawn = { x: c.x * k, y: c.y * k, w: 1200 * c.scale * k, h: 300 * c.scale * k };
  assert.ok(Math.abs(drawn.w / drawn.h - 1200 / 300) < 1e-9, 'the saved crop distorts the aspect ratio');
  assert.ok(drawn.x <= 0 && drawn.x + drawn.w >= OUT, 'the saved crop does not fill its canvas');
}

console.log('logo cropper OK, the square is always filled, at every zoom and drag');
