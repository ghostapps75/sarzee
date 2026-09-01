/**
 * Downscale and re-encode the artwork under public/.
 *
 * The source renders were up to 2816px wide and over a megabyte each, but nothing is ever
 * drawn near that size — most of it was download cost for pixels nobody sees. Run this
 * after adding a new board or asset:
 *
 *     npm run opt:textures            # rewrite in place
 *     npm run opt:textures -- --dry   # report what it would do
 *
 * Geometry in lib/boards.ts is expressed as fractions of the image, so resizing the board
 * art does not require touching any layout numbers.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

/**
 * Each entry is a folder to sweep and the widest the images in it ever need to be.
 * Board art is drawn at up to ~1300 CSS px (so 1920 covers a high-DPI display); the
 * button and scorecard art are much smaller on screen; the social thumbnail only ever
 * appears in a link preview.
 */
const TARGETS = [
    { dir: ['public', 'textures'], maxWidth: 1920 },
    {
        dir: ['public', 'assets'],
        maxWidth: 1024,
        overrides: { 'thumbnail.png': 1200 },
        // The scorecard is fine-line art with small printed text; palette quantisation
        // makes the rules column mushy, so keep it lossless.
        lossless: ['scorecard_bg.png'],
    },
];

const QUALITY = 82;
const DRY_RUN = process.argv.includes('--dry');

const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;

async function sweep(target, totals) {
    const dir = path.join(process.cwd(), ...target.dir);
    if (!fs.existsSync(dir)) {
        console.warn(`  (skipping missing ${dir})`);
        return;
    }

    const files = fs.readdirSync(dir).filter((f) => /\.(jpe?g|png)$/i.test(f));

    for (const file of files) {
        const full = path.join(dir, file);
        const maxWidth = (target.overrides && target.overrides[file]) || target.maxWidth;
        // PNGs stay PNG so transparency survives; JPEGs stay JPEG.
        const isPng = /\.png$/i.test(file);
        const lossless = (target.lossless || []).includes(file);

        // Read into a buffer first: sharp keeps the source file open otherwise, which
        // makes writing back to the same path fail on Windows.
        const input = fs.readFileSync(full);
        const original = input.length;
        const meta = await sharp(input).metadata();

        const pipeline = sharp(input).rotate();
        if (meta.width > maxWidth) pipeline.resize({ width: maxWidth, withoutEnlargement: true });

        const output = await (isPng
            ? pipeline.png({ compressionLevel: 9, palette: !lossless, quality: 90 })
            : pipeline.jpeg({ quality: QUALITY, mozjpeg: true, progressive: true })
        ).toBuffer();

        totals.before += original;

        if (output.length >= original) {
            totals.after += original;
            console.log(`  skip   ${file.padEnd(34)} ${kb(original)} (re-encode was no smaller)`);
            continue;
        }

        totals.after += output.length;
        const newMeta = await sharp(output).metadata();
        console.log(
            `  ${DRY_RUN ? 'would' : 'write'}  ${file.padEnd(34)} ` +
            `${meta.width}x${meta.height} ${kb(original)}  ->  ${newMeta.width}x${newMeta.height} ${kb(output.length)}`
        );

        if (!DRY_RUN) fs.writeFileSync(full, output);
    }
}

async function main() {
    const totals = { before: 0, after: 0 };
    for (const target of TARGETS) {
        console.log(`\n${path.join(...target.dir)} (max ${target.maxWidth}px wide)`);
        await sweep(target, totals);
    }
    console.log(
        `\nTotal: ${kb(totals.before)} -> ${kb(totals.after)} ` +
        `(${(100 * (1 - totals.after / totals.before)).toFixed(1)}% smaller)`
    );
    if (DRY_RUN) console.log('Dry run — nothing was written.');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
