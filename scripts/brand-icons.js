// Renders the Sarzee app icons from one vector mark: a white die showing five (a Sarzee is
// five of a kind) on a casino-green tile with a brass edge. Everything the browsers and
// phones ask for comes out of this file, so a change to the mark is one script run:
//
//   app/favicon.ico            16, 32 and 48 px, rounded tile  (browser tabs, bookmarks)
//   app/icon.png               512 px, rounded tile             (modern favicon, search results)
//   app/apple-icon.png         180 px, square, no transparency  (iOS home screen, iMessage)
//   public/icons/icon-192.png  192 px, square                   (Android home screen)
//   public/icons/icon-512.png  512 px, square                   (Android splash, install prompt)
//   public/icons/maskable-512.png  512 px, mark inside the 80% safe zone (adaptive icons)
//
// Usage: node scripts/brand-icons.js

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');

// Midnight Casino's palette, the board the share card uses.
const FELT_LIGHT = '#1E5A3C';
const FELT_DARK = '#0F2219';
const BRASS = '#C9A24A';
const BRASS_LIGHT = '#F3E9CF';

/**
 * The mark as SVG at a given canvas size. `rounded` cuts the tile's corners (for favicons,
 * where the platform does not do it for us). `frame` places the brass edge: on the tile's
 * border ('edge'), as a rounded frame just inside it ('inset', for the square icons that iOS
 * and Android round themselves, so the edge is never cut off at a corner), or not at all
 * ('none', for maskable icons that get cropped to a circle).
 */
function markSvg(size, { rounded, frame = 'edge' } = {}) {
    const s = size;
    const pad = 0;
    const tile = s;
    const radius = rounded ? tile * 0.22 : 0;
    const edge = tile * 0.045; // brass edge width
    const frameInset = tile * 0.07;
    const frameRadius = tile * 0.12;
    const die = tile * 0.56; // die edge length
    const dieR = die * 0.18;
    const pip = die * 0.105;
    const cx = s / 2;
    const cy = s / 2;
    const half = die / 2;
    // Pip offsets for a five, as a fraction of the die's half edge.
    const k = 0.55;
    const pips = [
        [-k, -k],
        [k, -k],
        [0, 0],
        [-k, k],
        [k, k],
    ]
        .map(([px, py]) => `<circle cx="${(px * half).toFixed(2)}" cy="${(py * half).toFixed(2)}" r="${pip.toFixed(2)}" fill="#1a1a1a"/>`)
        .join('');

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <defs>
    <radialGradient id="felt" cx="50%" cy="38%" r="75%">
      <stop offset="0" stop-color="${FELT_LIGHT}"/>
      <stop offset="1" stop-color="${FELT_DARK}"/>
    </radialGradient>
    <linearGradient id="brass" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BRASS_LIGHT}"/>
      <stop offset="0.45" stop-color="${BRASS}"/>
      <stop offset="1" stop-color="#8A6A22"/>
    </linearGradient>
    <linearGradient id="ivory" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/>
      <stop offset="1" stop-color="#E6E0D2"/>
    </linearGradient>
    <clipPath id="tileClip">
      <rect x="${pad}" y="${pad}" width="${tile}" height="${tile}" rx="${radius}" ry="${radius}"/>
    </clipPath>
  </defs>
  <g clip-path="url(#tileClip)">
    <rect x="${pad}" y="${pad}" width="${tile}" height="${tile}" fill="url(#felt)"/>
    <!-- soft vignette so the die pops -->
    <rect x="${pad}" y="${pad}" width="${tile}" height="${tile}" fill="url(#felt)" opacity="0.35"/>
  </g>
  ${
      frame === 'edge'
          ? `<rect x="${edge / 2}" y="${edge / 2}" width="${tile - edge}" height="${tile - edge}" rx="${Math.max(0, radius - edge / 2)}" ry="${Math.max(0, radius - edge / 2)}" fill="none" stroke="url(#brass)" stroke-width="${edge}"/>`
          : frame === 'inset'
            ? `<rect x="${frameInset}" y="${frameInset}" width="${tile - frameInset * 2}" height="${tile - frameInset * 2}" rx="${frameRadius}" ry="${frameRadius}" fill="none" stroke="url(#brass)" stroke-width="${edge * 0.8}"/>`
            : ''
  }
  <!-- die, tilted a touch so it reads as thrown, with a contact shadow on the felt -->
  <g transform="translate(${cx} ${cy}) rotate(-12)">
    <rect x="${(-half + die * 0.04).toFixed(2)}" y="${(-half + die * 0.10).toFixed(2)}" width="${die}" height="${die}" rx="${dieR}" ry="${dieR}" fill="#000" opacity="0.42"/>
    <rect x="${-half}" y="${-half}" width="${die}" height="${die}" rx="${dieR}" ry="${dieR}" fill="url(#ivory)"/>
    ${pips}
  </g>
</svg>`;
}

async function png(svg, size, { flatten } = {}) {
    let img = sharp(Buffer.from(svg), { density: 300 }).resize(size, size);
    if (flatten) img = img.flatten({ background: FELT_DARK });
    return img.png({ compressionLevel: 9, palette: false }).toBuffer();
}

/** Raw RGBA pixels of the mark at a size. */
async function rgba(svg, size) {
    return sharp(Buffer.from(svg), { density: 300 }).resize(size, size).ensureAlpha().raw().toBuffer();
}

/**
 * One .ico frame as a classic 32-bit DIB (bottom-up BGRA plus an empty AND mask). PNG frames
 * are allowed in .ico too, but the plain bitmap form is what every reader, from the Windows
 * shell to old mail clients, agrees on.
 */
function dib(size, pixels) {
    const header = Buffer.alloc(40);
    header.writeUInt32LE(40, 0);
    header.writeInt32LE(size, 4);
    header.writeInt32LE(size * 2, 8); // colour rows plus mask rows
    header.writeUInt16LE(1, 12);
    header.writeUInt16LE(32, 14);
    const colour = Buffer.alloc(size * size * 4);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const src = ((size - 1 - y) * size + x) * 4;
            const dst = (y * size + x) * 4;
            colour[dst] = pixels[src + 2];
            colour[dst + 1] = pixels[src + 1];
            colour[dst + 2] = pixels[src];
            colour[dst + 3] = pixels[src + 3];
        }
    }
    const mask = Buffer.alloc(Math.ceil(size / 32) * 4 * size); // transparency comes from alpha
    return Buffer.concat([header, colour, mask]);
}

/** An .ico container around the given frames. */
function ico(frames) {
    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(frames.length, 4);
    const dir = [];
    const data = [];
    let offset = 6 + 16 * frames.length;
    for (const { size, buf } of frames) {
        const e = Buffer.alloc(16);
        e.writeUInt8(size >= 256 ? 0 : size, 0);
        e.writeUInt8(size >= 256 ? 0 : size, 1);
        e.writeUInt8(0, 2);
        e.writeUInt8(0, 3);
        e.writeUInt16LE(1, 4);
        e.writeUInt16LE(32, 6);
        e.writeUInt32LE(buf.length, 8);
        e.writeUInt32LE(offset, 12);
        offset += buf.length;
        dir.push(e);
        data.push(buf);
    }
    return Buffer.concat([header, ...dir, ...data]);
}

async function main() {
    const out = (rel, buf) => {
        const file = path.join(ROOT, rel);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, buf);
        console.log(`${rel.padEnd(30)} ${buf.length.toLocaleString()} bytes`);
    };

    const rounded = (size) => markSvg(size, { rounded: true, frame: 'edge' });
    const square = (size) => markSvg(size, { rounded: false, frame: 'inset' });
    const maskable = (size) => markSvg(size, { rounded: false, frame: 'none' });

    out('app/favicon.ico', ico(await Promise.all([16, 32, 48].map(async (size) => ({ size, buf: dib(size, await rgba(rounded(size), size)) })))));
    out('app/icon.png', await png(rounded(512), 512));
    out('app/apple-icon.png', await png(square(180), 180, { flatten: true }));
    out('public/icons/icon-192.png', await png(square(192), 192, { flatten: true }));
    out('public/icons/icon-512.png', await png(square(512), 512, { flatten: true }));
    // Maskable: the platform crops to a circle or squircle inside the 80% safe zone, so the
    // felt bleeds to the edge and the die stays comfortably inside.
    out('public/icons/maskable-512.png', await png(maskable(512), 512, { flatten: true }));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
