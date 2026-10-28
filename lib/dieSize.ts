// lib/dieSize.ts
//
// The die's size on its own, with no three.js import, so the HTML drawn over the felt (the
// Sarzee shockwave) can use it without pulling the 3D stack into the page's first load.
// lib/dieFaces.ts re-exports it with the rest of the die.

/**
 * Edge length of a die, in world units. The arena is ARENA_WORLD_HEIGHT tall, so this is
 * the one number that decides how big dice look — pip size, corner rounding, resting
 * height, spacing and the physics collision box are all derived from it.
 */
export const DIE_SIZE = 1.164;
