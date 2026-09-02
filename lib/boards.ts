// lib/boards.ts
//
// Single source of truth for every board: its artwork, its geometry, its palette
// and the way dice look on it. Adding a new board means adding one entry here and
// dropping the image in /public/textures — nothing else needs to change.
//
// GEOMETRY NOTE
// -------------
// All rects are expressed as fractions (0..1) of the *source image*, never as
// percentages of the viewport. That is what makes the layout survive being resized:
// `useBoardLayout` measures the container once and projects these rects into real
// pixels through the same transform it uses to draw the image, so the felt is always
// exactly on the felt no matter what shape the screen is.
//
// The values below were measured off board_texture.jpg and verified against all
// eight boards — they share a common template, so one set fits them all. A board
// with different framing can override `felt` / `rollPlate` / `unit` individually.

export interface FracRect {
    x: number;
    y: number;
    w: number;
    h: number;
}

/** The playing surface the dice roll on. */
export const DEFAULT_FELT: FracRect = { x: 0.3365, y: 0.2185, w: 0.3465, h: 0.5288 };

/**
 * The region the 3D layer covers. Wider than the felt so held dice can sit in the side
 * trays, off the playing surface. Kept symmetric about the felt's centre and identical to
 * it vertically, which means the felt is simply the middle slice of the canvas — so the
 * world the dice roll in is unchanged by the extra room.
 */
export const DEFAULT_ARENA: FracRect = { x: 0.22975, y: 0.2185, w: 0.56, h: 0.5288 };

/**
 * The column of recessed slots down the left of the board. Held dice park here, one per
 * slot — the artwork was already drawn with five of them.
 */
export const DEFAULT_HELD_TRAY: FracRect = { x: 0.2428, y: 0.255, w: 0.0461, h: 0.4505 };

/** The recessed plate along the bottom of the board where the ROLL button sits. */
export const DEFAULT_ROLL_PLATE: FracRect = { x: 0.3588, y: 0.7945, w: 0.2954, h: 0.1430 };

/**
 * The wooden board itself, without the surrounding table dressing. On narrow screens
 * we frame this instead of the whole image — the plants and coffee cup are the first
 * things worth losing, and keeping the board whole is what preserves the theme.
 */
export const DEFAULT_BOARD_UNIT: FracRect = { x: 0.2125, y: 0.002, w: 0.588, h: 0.996 };

export interface BoardTheme {
    text: string;
    bg: string;
    bgAlpha: string;
    containerBg: string;
    border: string;
    borderAlpha: string;
    focus: string;
    focusRing: string;
    placeholder: string;
    accent: string;
    accentHover: string;
    buttonGradientFrom: string;
    buttonGradientTo: string;
    /**
     * Label colour on the solid themed buttons (player count, Launch Arena). Deliberately
     * separate from `text`: on the Forge the button gradient *is* the text colour, which
     * put orange numerals on an orange button and made the player-count step unreadable.
     */
    buttonText: string;
    buttonBorder: string;
    buttonBorderHover: string;
    diceBorder: string;
    diceBorderSelected: string;
    titleGradient: string;
}

/** One entry in a board's dice colour picker. */
export interface DiceColorOption {
    /** Named after the thing in the artwork it is taken from — shown as the swatch's tooltip. */
    name: string;
    hex: string;
}

/**
 * Ambient motes drifting over the felt.
 *
 * Only worth having where the effect is part of the scene — embers over lava, wisps in
 * the forest, stardust in space. On the wood-and-felt boards it reads as grit on the
 * screen rather than atmosphere, so those boards simply omit it.
 */
export interface BoardParticles {
    color: string;
    /** 'rise' floats upward and recycles at the bottom; 'drift' is a slow zero-G orbit. */
    motion: 'rise' | 'drift';
    /** Roughly how many at full quality; halved on low-power devices. */
    count: number;
}

/**
 * How dice are rendered on a given board.
 *
 * Only the *material* — how the surface catches light. The colour always comes from the
 * player's choice in setup. Boards used to be able to override it outright, which meant
 * picking a colour on the Forge or Pirates Cove did nothing at all.
 */
export interface DiceSkin {
    roughness: number;
    metalness: number;
    /**
     * A signature pip colour, used only when it contrasts with the die the player picked.
     * The Forge's magma pips look wonderful on a black die and vanish on an orange one, so
     * this falls back to the automatic light/dark choice when contrast is too low.
     */
    pipColor?: string;
}

export interface BoardDefinition {
    id: string;
    name: string;
    file: string;
    description: string;
    imgW: number;
    imgH: number;
    felt: FracRect;
    /** Region the 3D layer covers; must contain `felt` and share its vertical extent. */
    arena: FracRect;
    /** Where held dice park, divided into one slot per die. */
    heldTray: FracRect;
    rollPlate: FracRect;
    unit: FracRect;
    /**
     * The dice colours offered on this board. The first four are the seat defaults, in seat
     * order, so the first one is the board's signature look. Every board also offers a
     * plain white die, and each colour is drawn from that board's own artwork.
     */
    diceColors: DiceColorOption[];
    /** Ambient motes, when the board's setting calls for them. */
    particles?: BoardParticles;
    diceSkin: DiceSkin;
    theme: BoardTheme;
}

const DEFAULT_SKIN: DiceSkin = {
    roughness: 0.15,
    metalness: 0.3,
};

export const BOARDS: BoardDefinition[] = [
    {
        id: 'the-cafe',
        name: 'Vintage Café',
        file: 'board_texture.jpg',
        description: 'Cozy rustic mahogany table with warm ambient cafe lighting.',
        imgW: 1408,
        imgH: 752,
        felt: DEFAULT_FELT,
        arena: DEFAULT_ARENA,
        heldTray: DEFAULT_HELD_TRAY,
        rollPlate: DEFAULT_ROLL_PLATE,
        unit: DEFAULT_BOARD_UNIT,
        // Copper leads. Seat 1 used to be the same brown as the felt, which made its
        // dice effectively invisible on this board.
        diceColors: [
            { name: 'Copper Spoon', hex: '#C2703D' },
            { name: 'Cafe Crema', hex: '#E0C591' },
            { name: 'Inlay Teal', hex: '#2A8CA1' },
            { name: 'Rose Quartz', hex: '#D9779A' },
            { name: 'White', hex: '#F4F4F4' },
            { name: 'Ivy', hex: '#7D9652' },
        ],
        diceSkin: DEFAULT_SKIN,
        theme: {
            text: '#F2E6D8',
            bg: '#3B2820',
            bgAlpha: 'rgba(59, 40, 32, 0.8)',
            containerBg: 'rgba(59, 40, 32, 0.95)',
            border: '#7D9652',
            borderAlpha: 'rgba(125, 150, 82, 0.5)',
            focus: '#2A8CA1',
            focusRing: 'rgba(42, 140, 161, 0.3)',
            placeholder: 'rgba(242, 230, 216, 0.5)',
            accent: '#2A8CA1',
            accentHover: '#23899c',
            buttonGradientFrom: '#3B2820',
            buttonGradientTo: '#5a3f33',
            buttonText: '#F2E6D8',
            buttonBorder: 'rgba(125, 150, 82, 0.3)',
            buttonBorderHover: 'rgba(125, 150, 82, 0.5)',
            diceBorder: '#7D9652',
            diceBorderSelected: '#2A8CA1',
            titleGradient: 'linear-gradient(to right, #7D9652, #2A8CA1, #7D9652)',
        },
    },
    {
        id: 'the-emerald-forest',
        name: 'Emerald Forest',
        file: 'emeraldforest_board.jpg',
        description: 'Ancient mossy jade runes, glowing forest wisps, and elven magic.',
        imgW: 1920,
        imgH: 1025,
        felt: DEFAULT_FELT,
        arena: DEFAULT_ARENA,
        heldTray: DEFAULT_HELD_TRAY,
        rollPlate: DEFAULT_ROLL_PLATE,
        unit: DEFAULT_BOARD_UNIT,
        diceColors: [
            { name: 'Emerald', hex: '#22B36B' },
            { name: 'Toadstool', hex: '#E04A3F' },
            { name: 'Wisp Blue', hex: '#3FB8F0' },
            { name: 'Amethyst', hex: '#9B5DE5' },
            { name: 'White', hex: '#F4F4F4' },
            { name: 'Old Scroll', hex: '#E2CC8F' },
        ],
        // The forest wisps the board description promises.
        particles: { color: '#4DEE9E', motion: 'rise', count: 55 },
        // Polished jade. It used to be translucent, which looked lovely in isolation and
        // made the dice impossible to read against the forest behind them.
        diceSkin: {
            roughness: 0.08,
            metalness: 0.05,
            pipColor: '#FFFFFF',
        },
        theme: {
            text: '#E6AF2E',
            bg: '#2E4830',
            bgAlpha: 'rgba(46, 72, 48, 0.8)',
            containerBg: 'rgba(46, 72, 48, 0.95)',
            border: '#4ABFAC',
            borderAlpha: 'rgba(74, 191, 172, 0.5)',
            focus: '#4ABFAC',
            focusRing: 'rgba(74, 191, 172, 0.3)',
            placeholder: 'rgba(230, 175, 46, 0.5)',
            accent: '#4ABFAC',
            accentHover: '#3aa896',
            buttonGradientFrom: '#2E4830',
            buttonGradientTo: '#3a5a3d',
            buttonText: '#E6AF2E',
            buttonBorder: 'rgba(74, 191, 172, 0.3)',
            buttonBorderHover: 'rgba(74, 191, 172, 0.5)',
            diceBorder: '#4ABFAC',
            diceBorderSelected: '#E6AF2E',
            titleGradient: 'linear-gradient(to right, #E6AF2E, #4ABFAC, #E6AF2E)',
        },
    },
    {
        id: 'the-forge',
        name: 'Obsidian Forge',
        file: 'forge.jpg',
        description: 'Deep underground volcanic anvil stage with flowing orange magma.',
        imgW: 1408,
        imgH: 752,
        felt: DEFAULT_FELT,
        arena: DEFAULT_ARENA,
        heldTray: DEFAULT_HELD_TRAY,
        rollPlate: DEFAULT_ROLL_PLATE,
        unit: DEFAULT_BOARD_UNIT,
        diceColors: [
            { name: 'Obsidian', hex: '#1C1C1C' },
            { name: 'Magma', hex: '#FF5A14' },
            { name: 'Blue Temper', hex: '#4A90E2' },
            { name: 'Peridot', hex: '#2ECC71' },
            { name: 'White', hex: '#F4F4F4' },
            { name: 'Smoke', hex: '#C4BDB3' },
        ], // obsidian first: the classic look
        // Embers coming off the magma.
        particles: { color: '#FF5500', motion: 'rise', count: 90 },
        // Rough volcanic stone, whatever colour the player picked.
        diceSkin: {
            roughness: 0.8,
            metalness: 0.1,
            pipColor: '#FF6A00', // glowing magma, on dark dice
        },
        theme: {
            text: '#FF8C00',
            bg: '#1C1C1C',
            bgAlpha: 'rgba(28, 28, 28, 0.8)',
            containerBg: 'rgba(28, 28, 28, 0.95)',
            border: '#8A2323',
            borderAlpha: 'rgba(138, 35, 35, 0.5)',
            focus: '#FF8C00',
            focusRing: 'rgba(255, 140, 0, 0.3)',
            placeholder: 'rgba(255, 140, 0, 0.5)',
            accent: '#FF8C00',
            accentHover: '#e67d00',
            buttonGradientFrom: '#FF8C00',
            buttonGradientTo: '#cc7000',
            buttonText: '#1C1C1C',
            buttonBorder: 'rgba(255, 140, 0, 0.3)',
            buttonBorderHover: 'rgba(255, 140, 0, 0.5)',
            diceBorder: '#8A2323',
            diceBorderSelected: '#FF8C00',
            titleGradient: 'linear-gradient(to right, #FF8C00, #8A2323, #FF8C00)',
        },
    },
    {
        id: 'franklins-tower',
        name: "Franklin's Tower",
        file: 'gd_board.JPG',
        description: 'Classic psychedelic rock arena with crimson and indigo soundwaves.',
        imgW: 1920,
        imgH: 1025,
        felt: DEFAULT_FELT,
        arena: DEFAULT_ARENA,
        heldTray: DEFAULT_HELD_TRAY,
        rollPlate: DEFAULT_ROLL_PLATE,
        unit: DEFAULT_BOARD_UNIT,
        diceColors: [
            { name: 'Stealie Red', hex: '#FF4757' },
            { name: 'Stealie Blue', hex: '#3B8BFF' },
            { name: 'Skull Bone', hex: '#DECBA4' },
            { name: 'Cassette Black', hex: '#141414' },
            { name: 'White', hex: '#F4F4F4' },
            { name: 'Tie-Dye Violet', hex: '#A45CFF' },
        ],
        diceSkin: DEFAULT_SKIN,
        theme: {
            text: '#FFFFFF',
            bg: '#1E3A5F',
            bgAlpha: 'rgba(30, 58, 95, 0.8)',
            containerBg: 'rgba(30, 58, 95, 0.95)',
            border: '#2056A2',
            borderAlpha: 'rgba(32, 86, 162, 0.5)',
            focus: '#E68A00',
            focusRing: 'rgba(230, 138, 0, 0.3)',
            placeholder: 'rgba(255, 255, 255, 0.5)',
            accent: '#C01E32',
            accentHover: '#a91a29',
            buttonGradientFrom: '#C01E32',
            buttonGradientTo: '#8B1623',
            buttonText: '#FFFFFF',
            buttonBorder: 'rgba(192, 30, 50, 0.3)',
            buttonBorderHover: 'rgba(192, 30, 50, 0.5)',
            diceBorder: '#2056A2',
            diceBorderSelected: '#E68A00',
            titleGradient: 'linear-gradient(to right, #E68A00, #2056A2, #E68A00)',
        },
    },
    {
        id: 'linguiniiis-maple-shack',
        name: "Linguiniii's Maple Shack",
        file: 'linguiniii_board.jpg',
        description: 'Warm autumn cabin vibe with fresh organic maple syrup barrels.',
        imgW: 1920,
        imgH: 1025,
        felt: DEFAULT_FELT,
        arena: DEFAULT_ARENA,
        heldTray: DEFAULT_HELD_TRAY,
        rollPlate: DEFAULT_ROLL_PLATE,
        unit: DEFAULT_BOARD_UNIT,
        diceColors: [
            { name: 'Maple Leaf', hex: '#A32220' },
            { name: 'Tray Green', hex: '#1E5E2A' },
            { name: 'Soap Bubble', hex: '#9FD3EA' },
            { name: 'Black Coffee', hex: '#3B2418' },
            { name: 'White', hex: '#F4F4F4' },
            { name: 'Leaf Blush', hex: '#F2A0B4' },
        ],
        diceSkin: DEFAULT_SKIN,
        theme: {
            text: '#F5E6D3',
            bg: '#5A3D2E',
            bgAlpha: 'rgba(90, 61, 46, 0.8)',
            containerBg: 'rgba(90, 61, 46, 0.95)',
            border: '#6B8248',
            borderAlpha: 'rgba(107, 130, 72, 0.5)',
            focus: '#76B6C4',
            focusRing: 'rgba(118, 182, 196, 0.3)',
            placeholder: 'rgba(245, 230, 211, 0.5)',
            accent: '#C93F38',
            accentHover: '#b83730',
            buttonGradientFrom: '#5A3D2E',
            buttonGradientTo: '#7A5D4E',
            buttonText: '#F5E6D3',
            buttonBorder: 'rgba(107, 130, 72, 0.3)',
            buttonBorderHover: 'rgba(107, 130, 72, 0.5)',
            diceBorder: '#6B8248',
            diceBorderSelected: '#76B6C4',
            titleGradient: 'linear-gradient(to right, #C93F38, #6B8248, #76B6C4)',
        },
    },
    {
        id: 'the-map-room',
        name: 'Ancient Map Room',
        file: 'maproom_board.jpg',
        description: 'Mysterious antique explorers compass and aged cartography.',
        imgW: 1920,
        imgH: 1025,
        felt: DEFAULT_FELT,
        arena: DEFAULT_ARENA,
        heldTray: DEFAULT_HELD_TRAY,
        rollPlate: DEFAULT_ROLL_PLATE,
        unit: DEFAULT_BOARD_UNIT,
        diceColors: [
            { name: 'Globe Ocean', hex: '#2B4C9B' },
            { name: 'Oxblood', hex: '#A32626' },
            { name: 'Verdigris', hex: '#278574' },
            { name: 'Sepia Ink', hex: '#2B1B12' },
            { name: 'White', hex: '#F4F4F4' },
            { name: 'Sea Chart', hex: '#A9D6E5' },
        ],
        diceSkin: DEFAULT_SKIN,
        theme: {
            text: '#D9B056',
            bg: '#273C52',
            bgAlpha: 'rgba(39, 60, 82, 0.8)',
            containerBg: 'rgba(39, 60, 82, 0.95)',
            border: '#649C8F',
            borderAlpha: 'rgba(100, 156, 143, 0.5)',
            focus: '#649C8F',
            focusRing: 'rgba(100, 156, 143, 0.3)',
            placeholder: 'rgba(217, 176, 86, 0.5)',
            accent: '#D9B056',
            accentHover: '#c9a048',
            buttonGradientFrom: '#273C52',
            buttonGradientTo: '#3a5472',
            buttonText: '#D9B056',
            buttonBorder: 'rgba(100, 156, 143, 0.3)',
            buttonBorderHover: 'rgba(100, 156, 143, 0.5)',
            diceBorder: '#649C8F',
            diceBorderSelected: '#D9B056',
            titleGradient: 'linear-gradient(to right, #D9B056, #649C8F, #D9B056)',
        },
    },
    {
        id: 'pirates-cove',
        name: 'Pirates Cove',
        file: 'pirate_board.jpg',
        description: 'Weathered pirate treasure chest deck with doubloon gold highlights.',
        imgW: 1024,
        imgH: 564,
        felt: DEFAULT_FELT,
        arena: DEFAULT_ARENA,
        heldTray: DEFAULT_HELD_TRAY,
        rollPlate: DEFAULT_ROLL_PLATE,
        unit: DEFAULT_BOARD_UNIT,
        diceColors: [
            { name: 'Weathered Bone', hex: '#DCC9A0' },
            { name: 'Jolly Roger', hex: '#1A1A1A' },
            { name: 'Lagoon', hex: '#2FB5A8' },
            { name: 'Starfish', hex: '#F2604F' },
            { name: 'White', hex: '#F4F4F4' },
            { name: 'Sapphire Gem', hex: '#1B2F8A' },
        ], // bone first: the classic look
        // Sun-bleached and weathered, whatever colour the player picked.
        diceSkin: {
            roughness: 0.65,
            metalness: 0.05,
            pipColor: '#4d3019', // weathered brown, on light dice
        },
        theme: {
            text: '#E8DCC2',
            bg: '#1A4F8B',
            bgAlpha: 'rgba(26, 79, 139, 0.8)',
            containerBg: 'rgba(26, 79, 139, 0.95)',
            border: '#D4AF37',
            borderAlpha: 'rgba(212, 175, 55, 0.5)',
            focus: '#D4AF37',
            focusRing: 'rgba(212, 175, 55, 0.3)',
            placeholder: 'rgba(232, 220, 194, 0.5)',
            accent: '#D4AF37',
            accentHover: '#c49f2e',
            buttonGradientFrom: '#1A4F8B',
            buttonGradientTo: '#2565b3',
            buttonText: '#E8DCC2',
            buttonBorder: 'rgba(212, 175, 55, 0.3)',
            buttonBorderHover: 'rgba(212, 175, 55, 0.5)',
            diceBorder: '#D4AF37',
            diceBorderSelected: '#E8DCC2',
            titleGradient: 'linear-gradient(to right, #D4AF37, #1A4F8B, #D4AF37)',
        },
    },
    {
        id: 'space-mission',
        name: 'Cosmic Station',
        file: 'space_mission_board.jpg',
        description: 'Super-sleek dark space station over a cyan gas nebula.',
        imgW: 1920,
        imgH: 1025,
        felt: DEFAULT_FELT,
        arena: DEFAULT_ARENA,
        heldTray: DEFAULT_HELD_TRAY,
        rollPlate: DEFAULT_ROLL_PLATE,
        unit: DEFAULT_BOARD_UNIT,
        // Cyan leads: the indigo that used to be first is the same value as the nebula
        // behind it, so seat 1's dice all but disappeared. The rest are the nebula's own
        // glows, which is why this is the only board with a magenta.
        diceColors: [
            { name: 'Cyan Crystal', hex: '#4DEEEA' },
            { name: 'Amber Crystal', hex: '#FF7F1F' },
            { name: 'Nebula Pink', hex: '#FF4FD8' },
            { name: 'Nebula Violet', hex: '#C77DF3' },
            { name: 'White', hex: '#F4F4F4' },
            { name: 'Hull Silver', hex: '#B4BAC4' },
        ],
        // Stardust, hanging rather than rising — there is no up out there.
        particles: { color: '#8C52FF', motion: 'drift', count: 70 },
        diceSkin: {
            // There is no environment map in the scene, and a near-fully metallic surface
            // with nothing to reflect renders black. This keeps the polished look while
            // letting the player's colour actually show.
            roughness: 0.18,
            metalness: 0.45,
        },
        theme: {
            text: '#4DEEEA',
            bg: '#211A45',
            bgAlpha: 'rgba(33, 26, 69, 0.8)',
            containerBg: 'rgba(33, 26, 69, 0.95)',
            border: '#C77DF3',
            borderAlpha: 'rgba(199, 125, 243, 0.5)',
            focus: '#4DEEEA',
            focusRing: 'rgba(77, 238, 234, 0.3)',
            placeholder: 'rgba(77, 238, 234, 0.5)',
            accent: '#FCA311',
            accentHover: '#e8940f',
            buttonGradientFrom: '#C77DF3',
            buttonGradientTo: '#a660d3',
            buttonText: '#211A45',
            buttonBorder: 'rgba(252, 163, 17, 0.3)',
            buttonBorderHover: 'rgba(252, 163, 17, 0.5)',
            diceBorder: '#C77DF3',
            diceBorderSelected: '#FCA311',
            titleGradient: 'linear-gradient(to right, #4DEEEA, #C77DF3, #4DEEEA)',
        },
    },
];

export const DEFAULT_BOARD_ID = 'the-cafe';

export function getBoard(id: string): BoardDefinition {
    return BOARDS.find((b) => b.id === id) ?? BOARDS[0];
}

/**
 * Centres of the held-dice slots, in image fractions — the tray split into `count` rows.
 */
export function heldSlotCentres(board: BoardDefinition, count: number): Array<{ x: number; y: number }> {
    const { x, y, w, h } = board.heldTray;
    return Array.from({ length: count }, (_, i) => ({
        x: x + w / 2,
        y: y + ((i + 0.5) * h) / count,
    }));
}

export function boardTextureUrl(board: BoardDefinition): string {
    return `/textures/${board.file}`;
}
