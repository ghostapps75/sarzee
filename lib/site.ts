// lib/site.ts
//
// The one place the site describes itself. The page metadata, the web manifest and the
// share card all read from here, so a link preview, a home-screen icon and a search
// result never tell three different stories.

export const SITE_URL = 'https://sarzee.netlify.app';
export const SITE_NAME = 'Sarzee';
export const SITE_TITLE = 'Sarzee - Multiplayer Dice Game';
export const SITE_DESCRIPTION =
    'Play Sarzee with friends: a multiplayer dice game with real 3D physics, ten boards to play on and a handwritten score sheet. Roll five of a kind to win big!';

/** The colour behind everything, so the browser chrome on phones matches the table edge. */
export const THEME_COLOR = '#0a0a0a';
