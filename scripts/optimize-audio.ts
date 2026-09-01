/**
 * Encode the game's sounds for the web.
 *
 *     npm run opt:audio            # process anything new or changed
 *     npm run opt:audio -- --dry   # report what it would do
 *     npm run opt:audio -- --force # re-encode everything
 *
 * Drop a new file in public/sounds, add it to lib/sounds.ts, run this. The registry says
 * which profile a sound uses, so encoding settings and playback volume live together.
 *
 * WHY A MANIFEST
 * Files are rewritten in place, and MP3 is lossy — re-encoding the same file repeatedly
 * would quietly degrade it. `scripts/audio-manifest.json` records the hash of what this script
 * produced, so an unchanged file is skipped rather than encoded again. The originals are
 * in git if you ever need to go back.
 *
 * WHY TWO KINDS OF NORMALISATION
 * EBU R128 loudness needs a few seconds of programme material to mean anything, so it is
 * right for the voice and music clips but not for a 0.5s click. Short effects are matched
 * on RMS instead, then run through a limiter so nothing can clip. Peak normalisation was
 * the obvious alternative, but it only equalises the single loudest sample — a sharp click
 * and a sustained chime can share a peak and still sound nothing alike.
 */
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import ffmpegPath from 'ffmpeg-static';
import { SOUNDS, SoundId } from '../lib/sounds';

const FFMPEG = ffmpegPath as unknown as string;
const DIR = path.join(process.cwd(), 'public', 'sounds');
const MANIFEST = path.join(process.cwd(), 'scripts', 'audio-manifest.json');

const DRY = process.argv.includes('--dry');
const FORCE = process.argv.includes('--force');

/** Encoding settings per profile. */
const PROFILES = {
    // The ceiling leaves headroom on purpose: MP3 is not sample-accurate, and a stream
    // limited to -1 dB can decode above full scale and crackle.
    ui: { channels: 1, bitrate: '96k', sampleRate: 44100, rmsDb: -20, ceilingDb: -3 },
    feature: { channels: 2, bitrate: '128k', sampleRate: 44100, lufs: -16 },
} as const;

/** Stop correcting once the encoded result is this close to the target, in dB. */
const LEVEL_TOLERANCE = 0.5;

/** Never lift a clip by more than this; past it you are amplifying noise, not signal. */
const MAX_BOOST_DB = 18;

const kb = (bytes: number) => `${(bytes / 1024).toFixed(0)} KB`;
const hash = (buf: Buffer) => createHash('sha1').update(buf).digest('hex').slice(0, 16);

/**
 * Runs ffmpeg. `out` is its stderr, which is where ffmpeg writes everything it has to
 * say — including the volumedetect measurements — whether or not it succeeded.
 */
function ffmpeg(args: string[]): { ok: boolean; out: string } {
    const r = spawnSync(FFMPEG, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    return { ok: r.status === 0, out: r.stderr ?? '' };
}

/** The last few lines of an ffmpeg report, for error messages. */
function lastLines(text: string, count: number): string {
    return text.trim().split(/\r?\n/).filter(Boolean).slice(-count).join(' | ');
}

/**
 * Average (RMS) level in dBFS, measured at the channel count we are going to encode to —
 * downmixing to mono changes the level, so measuring the source would aim at the wrong
 * target. Throws rather than guessing: a silent fallback here just produces quiet files.
 */
function measureRmsDb(file: string, channels: number): number {
    const { out } = ffmpeg([
        '-hide_banner', '-i', file, '-vn', '-ac', String(channels),
        '-af', 'volumedetect', '-f', 'null', '-',
    ]);
    const m = /mean_volume:\s*(-?\d+(?:\.\d+)?) dB/.exec(out);
    if (!m) throw new Error(`could not measure level of ${path.basename(file)}: ${lastLines(out, 2)}`);
    return parseFloat(m[1]);
}

/** Bytes of actual audio, ignoring any ID3 tag wrapped around it. */
function audioBytes(buf: Buffer): number {
    let tag = 0;
    if (buf.subarray(0, 3).toString('latin1') === 'ID3') {
        tag = 10 + ((buf[6] & 0x7f) << 21 | (buf[7] & 0x7f) << 14 | (buf[8] & 0x7f) << 7 | (buf[9] & 0x7f));
    }
    const v1 = buf.subarray(buf.length - 128, buf.length - 125).toString('latin1') === 'TAG' ? 128 : 0;
    return buf.length - tag - v1;
}

type Manifest = Record<string, string>;

function readManifest(): Manifest {
    try {
        return JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
    } catch {
        return {};
    }
}

function main() {
    if (!fs.existsSync(DIR)) {
        console.error(`No such directory: ${DIR}`);
        process.exit(1);
    }

    const manifest = readManifest();
    let before = 0;
    let after = 0;
    let processed = 0;

    for (const id of Object.keys(SOUNDS) as SoundId[]) {
        const def = SOUNDS[id];
        const full = path.join(DIR, def.file);

        if (!fs.existsSync(full)) {
            console.warn(`  MISSING ${def.file.padEnd(16)} (declared in lib/sounds.ts)`);
            continue;
        }

        const input = fs.readFileSync(full);
        const original = input.length;
        before += original;

        if (!FORCE && manifest[def.file] === hash(input)) {
            after += original;
            console.log(`  skip    ${def.file.padEnd(16)} ${kb(original).padStart(8)}  already encoded`);
            continue;
        }

        const profile = PROFILES[def.profile];
        const tmp = path.join(DIR, `.tmp-${def.file}`);

        /** Encode the source into `tmp` with the given filter chain. */
        const encode = (filters: string[]) =>
            ffmpeg([
                '-hide_banner', '-loglevel', 'error', '-y',
                '-i', full,
                // Drop any attached picture. Cover art rides along as a video stream, and
                // ffmpeg will otherwise try to re-encode it and fail once ID3 is disabled.
                '-vn',
                '-af', filters.join(','),
                '-ac', String(profile.channels),
                '-ar', String(profile.sampleRate),
                '-b:a', profile.bitrate,
                '-map_metadata', '-1',   // drop ID3 tags, including any embedded artwork
                '-id3v2_version', '0',
                tmp,
            ]);

        // Always encode to a temp file, even on a dry run, so the reported size is real.
        let run;
        let levelNote = '';

        if (def.profile === 'feature') {
            run = encode([`loudnorm=I=${PROFILES.feature.lufs}:TP=-1.5:LRA=11`]);
        } else {
            // Match average level, then cap the peaks. The limiter is what makes the boost
            // safe: a quiet clip can be lifted 10 dB without its transient clipping.
            // `level=0` matters — alimiter otherwise auto-normalises its output back to
            // full scale, which silently undoes the ceiling.
            const ceiling = Math.pow(10, PROFILES.ui.ceilingDb / 20);
            const chain = (gain: number) => [
                `volume=${gain.toFixed(2)}dB`,
                `alimiter=limit=${ceiling.toFixed(3)}:level=0:attack=0.5:release=20`,
            ];

            // Cap the boost. A source quiet enough to need more than this is usually
            // quiet because it is noisy or badly recorded, and lifting it further just
            // makes the noise louder — better to flag it than to ruin it.
            const wanted = PROFILES.ui.rmsDb - measureRmsDb(full, profile.channels);
            let gain = Math.min(wanted, MAX_BOOST_DB);
            if (wanted > MAX_BOOST_DB) {
                console.warn(
                    `  QUIET   ${def.file.padEnd(16)} wanted +${wanted.toFixed(1)} dB, ` +
                    `capped at +${MAX_BOOST_DB} dB — consider a louder source`
                );
            }
            run = encode(chain(gain));

            // Limiting pulls transients down, so the encoded result lands under target by
            // an amount that depends on the clip. Measure what actually came out and take
            // one corrective pass — always re-encoding from the source, never from tmp.
            if (run.ok && fs.existsSync(tmp)) {
                const error = PROFILES.ui.rmsDb - measureRmsDb(tmp, profile.channels);
                if (Math.abs(error) > LEVEL_TOLERANCE) {
                    gain = Math.min(gain + error, MAX_BOOST_DB);
                    run = encode(chain(gain));
                    levelNote = `  (levelled in 2 passes, ${gain >= 0 ? '+' : ''}${gain.toFixed(1)} dB)`;
                }
            }
        }

        if (!run.ok || !fs.existsSync(tmp)) {
            console.error(`  FAILED  ${def.file.padEnd(16)} ${lastLines(run.out, 2)}`);
            if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
            after += original;
            continue;
        }

        const output = fs.readFileSync(tmp);
        fs.unlinkSync(tmp);
        after += output.length;
        processed++;

        const tagBytes = original - audioBytes(input);
        const note = tagBytes > 32 * 1024 ? `  (${kb(tagBytes)} of it was metadata)` : '';
        console.log(
            `  ${DRY ? 'would' : 'write'}   ${def.file.padEnd(16)} ` +
            `${kb(original).padStart(8)} -> ${kb(output.length).padStart(7)}` +
            `  ${def.profile}/${profile.channels === 1 ? "mono" : "stereo"}/${profile.bitrate}${note}${levelNote}`
        );

        if (!DRY) {
            fs.writeFileSync(full, output);
            manifest[def.file] = hash(output);
        }
    }

    // Flag anything on disk that nothing declares.
    const declared = new Set(Object.values(SOUNDS).map((s) => s.file));
    for (const f of fs.readdirSync(DIR)) {
        if (/\.(mp3|m4a|ogg|wav)$/i.test(f) && !declared.has(f)) {
            console.warn(`  ORPHAN  ${f.padEnd(16)} not in lib/sounds.ts — it ships but is never played`);
        }
    }

    console.log(
        `\nTotal: ${kb(before)} -> ${kb(after)}` +
        (before ? ` (${(100 * (1 - after / before)).toFixed(1)}% smaller)` : '') +
        `, ${processed} encoded`
    );
    if (DRY) console.log('Dry run — nothing was written.');
    else if (processed) fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
}

main();
