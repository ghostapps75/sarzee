/**
 * Downscale and re-encode the artwork under public/.
 *
 * The source renders were up to 2816px wide and over a megabyte each, but nothing is ever
 * drawn near that size — most of it was download cost for pixels nobody sees. Run this
 * after adding a new board or asset:
 *
 *     npm run opt:textures              # process anything new or changed
 *     npm run opt:textures -- --dry     # report what it would do
 *     npm run opt:textures -- --force   # re-encode everything
 *
 * Geometry in lib/boards.ts is expressed as fractions of the image, so resizing the board
 * art does not require touching any layout numbers.
 *
 * WHY A MANIFEST
 * Files are rewritten in place, and both JPEG and palette PNG are lossy — re-encoding the
 * same image on every run would quietly degrade it and leave binary diffs on art nobody
 * touched. `scripts/texture-manifest.json` records the hash of each file as this script
 * left it, so an unchanged file is skipped. A file that is still wider than its target is
 * processed regardless, so lowering a max width below takes effect without --force.
 *
 * WHY A THRESHOLD
 * A file the manifest has not seen may already be optimised (art made on another branch,
 * or by hand), and re-encoding it again buys a few KB for another generation of loss. So
 * a new file is only rewritten if it is too wide or the saving is worth it (MIN_SAVING);
 * either way its hash is recorded and later runs leave it alone. --force skips both checks
 * and writes whenever the re-encode is smaller, which is what this script used to do.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

/**
 * Each entry is a folder to sweep and the widest the images in it ever need to be.
 * Board art is drawn at up to ~1300 CSS px (so 1920 covers a high-DPI display); the
 * button art is much smaller on screen; the social thumbnail only ever
 * appears in a link preview.
 */
const TARGETS = [
    { dir: ['public', 'textures'], maxWidth: 1920 },
    {
        dir: ['public', 'assets'],
        maxWidth: 1024,
        overrides: { 'thumbnail.png': 1200 },
    },
];

const QUALITY = 82;

/** A new file at its target width is only rewritten if the re-encode saves both of these. */
const MIN_SAVING = { bytes: 20 * 1024, ratio: 0.1 };

const MANIFEST = path.join(process.cwd(), 'scripts', 'texture-manifest.json');

const DRY_RUN = process.argv.includes('--dry');
const FORCE = process.argv.includes('--force');

const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;
const hash = (buf) => crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16);

function readManifest() {
    try {
        return JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
    } catch {
        return {};
    }
}

/**
 * `manifest` is what the last run recorded; `seen` collects the hash of every file as this
 * run leaves it, so entries for deleted files drop out when it is written back.
 */
async function sweep(target, totals, manifest, seen) {
    const dir = path.join(process.cwd(), ...target.dir);
    if (!fs.existsSync(dir)) {
        console.warn(`  (skipping missing ${dir})`);
        return;
    }

    const files = fs.readdirSync(dir).filter((f) => /\.(jpe?g|png)$/i.test(f));

    for (const file of files) {
        const full = path.join(dir, file);
        // Keyed relative to public/, e.g. "textures/forge.jpg".
        const key = [...target.dir.slice(1), file].join('/');
        const maxWidth = (target.overrides && target.overrides[file]) || target.maxWidth;
        // PNGs stay PNG so transparency survives; JPEGs stay JPEG.
        const isPng = /\.png$/i.test(file);
        const lossless = (target.lossless || []).includes(file);

        // Read into a buffer first: sharp keeps the source file open otherwise, which
        // makes writing back to the same path fail on Windows.
        const input = fs.readFileSync(full);
        const original = input.length;
        const inputHash = hash(input);
        const meta = await sharp(input).metadata();
        const tooWide = meta.width > maxWidth;

        totals.before += original;
        seen[key] = inputHash;

        if (!FORCE && !tooWide && manifest[key] === inputHash) {
            totals.after += original;
            console.log(`  skip   ${file.padEnd(34)} ${kb(original)} (already optimised)`);
            continue;
        }

        const pipeline = sharp(input).rotate();
        if (tooWide) pipeline.resize({ width: maxWidth, withoutEnlargement: true });

        const output = await (isPng
            ? pipeline.png({ compressionLevel: 9, palette: !lossless, quality: 90 })
            : pipeline.jpeg({ quality: QUALITY, mozjpeg: true, progressive: true })
        ).toBuffer();

        const saved = original - output.length;
        let reason = null;
        if (saved <= 0) {
            reason = 're-encode was no smaller';
        } else if (!FORCE && !tooWide && (saved < MIN_SAVING.bytes || saved < MIN_SAVING.ratio * original)) {
            reason = `re-encode would only save ${(saved / 1024).toFixed(1)} KB`;
        }

        if (reason) {
            totals.after += original;
            console.log(`  skip   ${file.padEnd(34)} ${kb(original)} (${reason})`);
            continue;
        }

        totals.after += output.length;
        totals.written++;
        const newMeta = await sharp(output).metadata();
        console.log(
            `  ${DRY_RUN ? 'would' : 'write'}  ${file.padEnd(34)} ` +
            `${meta.width}x${meta.height} ${kb(original)}  ->  ${newMeta.width}x${newMeta.height} ${kb(output.length)}`
        );

        if (!DRY_RUN) {
            fs.writeFileSync(full, output);
            seen[key] = hash(output);
        }
    }
}

async function main() {
    const manifest = readManifest();
    const seen = {};
    const totals = { before: 0, after: 0, written: 0 };
    for (const target of TARGETS) {
        console.log(`\n${path.join(...target.dir)} (max ${target.maxWidth}px wide)`);
        await sweep(target, totals, manifest, seen);
    }
    console.log(
        `\nTotal: ${kb(totals.before)} -> ${kb(totals.after)} ` +
        `(${(100 * (1 - totals.after / totals.before)).toFixed(1)}% smaller), ` +
        `${totals.written} ${DRY_RUN ? 'to write' : 'written'}`
    );
    if (DRY_RUN) {
        console.log('Dry run — nothing was written.');
        return;
    }

    // Sorted so the file does not churn with directory listing order.
    const next = {};
    for (const key of Object.keys(seen).sort()) next[key] = seen[key];
    const text = JSON.stringify(next, null, 2) + '\n';
    const previous = fs.existsSync(MANIFEST) ? fs.readFileSync(MANIFEST, 'utf8') : null;
    if (text !== previous) fs.writeFileSync(MANIFEST, text);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
