// scripts/turn-chime.ts
//
// Synthesises `public/sounds/chime.mp3`, the cue that plays as a score is written in and
// the turn passes to the next player.
//
// It replaced a recorded six-note glockenspiel run (two seconds, hard mallet attacks)
// that was loud and busy for something heard every turn. This is two soft notes, a
// rising fourth from E5 to A5, each a sine with a faint octave and twelfth for a little
// bell colour. Each note fades in over a few milliseconds rather than being struck, and
// rings away on an exponential decay, the upper partials dying first as a real bell's do.
// The whole cue is 0.7 s.
//
//   npm run gen:chime     writes the source file
//   npm run opt:audio     then level-matches and encodes it like every other sound
//
// The tone is built as 16-bit PCM in a WAV, handed to ffmpeg (from ffmpeg-static, so
// nothing needs installing) and written as a high-bitrate MP3. That is a source file, not
// the shipped one: `opt:audio` re-encodes it to the `ui` profile and records it in
// scripts/audio-manifest.json. Running this again overwrites the source, the manifest
// hash no longer matches, and `opt:audio` picks it up.

import { spawnSync } from 'child_process';
import path from 'path';
import ffmpegPath from 'ffmpeg-static';

const FFMPEG = ffmpegPath as unknown as string;
const TARGET = path.join(process.cwd(), 'public', 'sounds', 'chime.mp3');

const SAMPLE_RATE = 44100;
const LENGTH_S = 0.7;

/** Fade-in per note. Long enough that nothing clicks or strikes, short enough to stay crisp. */
const ATTACK_S = 0.012;
/** Time for the fundamental to fall to 1/e. The partials above it go faster. */
const DECAY_S = 0.17;
/** A short fade at the very end, so the file stops at silence rather than mid-ring. */
const TAIL_S = 0.08;

/** Partials as [frequency ratio, level]. Mostly fundamental: soft, not glassy. */
const PARTIALS: Array<[number, number]> = [
    [1, 1],
    [2, 0.14],
    [3, 0.035],
];

/** The two notes: start time, frequency, level. The second is the one that lands. */
const NOTES: Array<{ at: number; hz: number; level: number }> = [
    { at: 0, hz: 659.25, level: 0.8 }, // E5
    { at: 0.13, hz: 880, level: 1 }, // A5
];

/** Peak of the source before levelling. `opt:audio` sets the real level. */
const PEAK = 0.5;

function synthesise(): Float32Array {
    const frames = Math.round(LENGTH_S * SAMPLE_RATE);
    const out = new Float32Array(frames);

    for (const note of NOTES) {
        const start = Math.round(note.at * SAMPLE_RATE);
        for (let i = start; i < frames; i++) {
            const t = (i - start) / SAMPLE_RATE;
            // Raised-cosine fade-in: starts and arrives with zero slope, so no click.
            const attack = t < ATTACK_S ? 0.5 - 0.5 * Math.cos((Math.PI * t) / ATTACK_S) : 1;
            let sample = 0;
            for (const [ratio, level] of PARTIALS) {
                // Higher partials die faster, which is what makes it ring like a bell
                // and not sustain like an organ.
                const decay = Math.exp(-t / (DECAY_S / Math.pow(ratio, 0.8)));
                sample += level * decay * Math.sin(2 * Math.PI * note.hz * ratio * t);
            }
            out[i] += note.level * attack * sample;
        }
    }

    const tail = Math.round(TAIL_S * SAMPLE_RATE);
    for (let i = 0; i < tail; i++) {
        out[frames - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / tail);
    }

    let peak = 0;
    for (const s of out) peak = Math.max(peak, Math.abs(s));
    for (let i = 0; i < frames; i++) out[i] *= PEAK / peak;
    return out;
}

/** A mono 16-bit PCM WAV, in memory. */
function wav(samples: Float32Array): Buffer {
    const data = Buffer.alloc(samples.length * 2);
    samples.forEach((s, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), i * 2));

    const header = Buffer.alloc(44);
    header.write('RIFF', 0, 'latin1');
    header.writeUInt32LE(36 + data.length, 4);
    header.write('WAVE', 8, 'latin1');
    header.write('fmt ', 12, 'latin1');
    header.writeUInt32LE(16, 16); // fmt chunk size
    header.writeUInt16LE(1, 20); // PCM
    header.writeUInt16LE(1, 22); // mono
    header.writeUInt32LE(SAMPLE_RATE, 24);
    header.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate
    header.writeUInt16LE(2, 32); // block align
    header.writeUInt16LE(16, 34); // bits per sample
    header.write('data', 36, 'latin1');
    header.writeUInt32LE(data.length, 40);
    return Buffer.concat([header, data]);
}

function main() {
    const source = wav(synthesise());
    const r = spawnSync(
        FFMPEG,
        [
            '-hide_banner', '-loglevel', 'error', '-y',
            '-f', 'wav', '-i', 'pipe:0',
            '-ac', '1', '-b:a', '192k',
            '-map_metadata', '-1', '-id3v2_version', '0',
            TARGET,
        ],
        { input: source, encoding: 'utf8' }
    );
    if (r.status !== 0) {
        console.error(`ffmpeg failed: ${(r.stderr ?? '').trim()}`);
        process.exit(1);
    }
    console.log(`Wrote ${path.relative(process.cwd(), TARGET)} (${LENGTH_S}s). Now run: npm run opt:audio`);
}

main();
