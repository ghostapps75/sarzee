// lib/sounds.ts
//
// Every sound the game can make, declared once. Adding one means dropping the file in
// public/sounds, adding an entry here, and running `npm run opt:audio` — nothing else
// needs to know it exists.
//
// This file is read by both the game and the build script, so a sound's encoding profile
// and its playback volume can never drift apart.

export type SoundId =
    | 'roll'
    | 'impact'
    | 'hold'
    | 'score'
    | 'sarzee'
    | 'nancy';

export interface SoundDef {
    /** Filename inside public/sounds. */
    file: string;
    /**
     * Playback gain, 0..1. Sounds are level-matched at build time, so this is a creative
     * choice about how loud something *should* be, not a correction for a hot recording.
     */
    volume: number;
    /**
     * 'eager' warms the file up on the player's first interaction, so a die click or a
     * roll never waits on a download. 'lazy' waits until the sound is first needed —
     * right for the celebrations, which most turns never trigger.
     */
    preload: 'eager' | 'lazy';
    /**
     * How the build encodes it.
     * 'ui'      — short effects: mono, low bitrate, peak-normalised.
     * 'feature' — voice or music: stereo, higher bitrate, loudness-normalised to EBU R128.
     */
    profile: 'ui' | 'feature';
}

export const SOUNDS: Record<SoundId, SoundDef> = {
    roll: { file: 'roll.mp3', volume: 0.7, preload: 'eager', profile: 'ui' },
    impact: { file: 'hit.mp3', volume: 0.45, preload: 'eager', profile: 'ui' },
    hold: { file: 'pop.mp3', volume: 0.5, preload: 'eager', profile: 'ui' },
    score: { file: 'score.mp3', volume: 0.6, preload: 'eager', profile: 'ui' },
    sarzee: { file: 'sarzee.mp3', volume: 0.65, preload: 'lazy', profile: 'feature' },
    nancy: { file: 'nancy.mp3', volume: 0.65, preload: 'lazy', profile: 'feature' },
};

export const soundUrl = (id: SoundId) => `/sounds/${SOUNDS[id].file}`;

export const SOUND_IDS = Object.keys(SOUNDS) as SoundId[];
