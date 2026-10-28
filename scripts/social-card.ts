// scripts/social-card.ts
//
// Renders `app/opengraph-image.jpg`: the 1200x630 picture that iMessage, WhatsApp, Slack,
// Facebook, LinkedIn and X show when someone shares a link to the game.
//
// It is a photograph of the real thing rather than a mock-up. Headless Chrome loads the
// production export, picks a board, starts a game and rolls, and the viewport is sized so
// the board's safe area next to the scorecard rail is exactly 1200x630. The HUD on the
// title plate is swapped for the SARZEE wordmark in the board's own title gradient, the
// shot is taken at 2x and the rail is cropped away.
//
// Needs a production build in `out/` (`npm run build`) and Google Chrome.
//
//   npm run gen:card                       Midnight Casino, second roll of the turn
//   npm run gen:card -- --board the-cafe   another board id from lib/boards.ts
//   npm run gen:card -- --rolls 1          which throw of the turn to photograph
//   npm run gen:card -- --dice White       a dice colour from that board's palette
//
// The throw is deterministic for a given roll number, so re-running gives the same picture
// (give or take a few pixels of anti-aliasing).
// Chrome is looked for in the usual places; set CHROME to point at another binary.

import { spawn } from 'child_process';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { getBoard } from '../lib/boards';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'out');
const TARGET = path.join(ROOT, 'app', 'opengraph-image.jpg');

const CARD_W = 1200;
const CARD_H = 630;
const DPR = 2;
/** In a rail layout this wide the scorecard rail is capped at 460px, leaving exactly the card for the board. */
const RAIL_W = 460;
const SETTLE_MS = 4500;

const args = process.argv.slice(2);
const opt = (name: string, fallback: string) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const boardId = opt('board', 'midnight-casino');
const rolls = Number(opt('rolls', '2'));
const dice = opt('dice', '');

const CHROME_CANDIDATES = [
    process.env.CHROME,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
].filter((p): p is string => !!p);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const MIME: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.mp3': 'audio/mpeg',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.txt': 'text/plain',
    '.webmanifest': 'application/manifest+json',
};

/** Serves the static export on a free local port. */
function serve(): Promise<{ url: string; close: () => void }> {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            let p = decodeURIComponent(new URL(req.url || '/', 'http://x').pathname);
            if (p.endsWith('/')) p += 'index.html';
            let file = path.join(OUT_DIR, p);
            if (!file.startsWith(OUT_DIR)) {
                res.writeHead(403);
                return res.end();
            }
            if (!fs.existsSync(file) && fs.existsSync(file + '.html')) file += '.html';
            fs.readFile(file, (err, data) => {
                if (err) {
                    res.writeHead(404);
                    return res.end('not found');
                }
                res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
                res.end(data);
            });
        });
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address() as { port: number };
            resolve({ url: `http://127.0.0.1:${port}/`, close: () => server.close() });
        });
    });
}

type CdpMessage = { id?: number; method?: string; params?: unknown; result?: Record<string, unknown> };

async function main() {
    if (!fs.existsSync(path.join(OUT_DIR, 'index.html'))) {
        throw new Error('No production build in out/. Run `npm run build` first.');
    }
    const chromePath = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
    if (!chromePath) throw new Error('Google Chrome not found. Set CHROME to its executable.');

    const board = getBoard(boardId);
    const viewW = CARD_W + RAIL_W;
    const viewH = CARD_H;
    const site = await serve();
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sarzee-card-'));
    const debugPort = 9333;

    const chrome = spawn(
        chromePath,
        [
            '--headless=new',
            `--remote-debugging-port=${debugPort}`,
            `--user-data-dir=${profile}`,
            '--no-first-run',
            '--no-default-browser-check',
            `--window-size=${viewW},${viewH}`,
            // Software WebGL, so the dice render on a machine with no GPU (CI, a laptop lid down).
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
            '--ignore-gpu-blocklist',
            '--hide-scrollbars',
            '--mute-audio',
            'about:blank',
        ],
        { stdio: 'ignore' }
    );

    try {
        let wsUrl: string | null = null;
        for (let i = 0; i < 60 && !wsUrl; i++) {
            try {
                const list = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()) as { type: string; webSocketDebuggerUrl: string }[];
                const page = list.find((t) => t.type === 'page');
                if (page) wsUrl = page.webSocketDebuggerUrl;
            } catch {
                /* not up yet */
            }
            if (!wsUrl) await sleep(250);
        }
        if (!wsUrl) throw new Error('Chrome did not expose a page to drive');

        const ws = new WebSocket(wsUrl);
        await new Promise<void>((res, rej) => {
            ws.onopen = () => res();
            ws.onerror = () => rej(new Error('could not connect to Chrome'));
        });
        let nextId = 0;
        const pending = new Map<number, (m: CdpMessage) => void>();
        const listeners: ((m: CdpMessage) => void)[] = [];
        ws.onmessage = (e) => {
            const m = JSON.parse(String(e.data)) as CdpMessage;
            if (m.id && pending.has(m.id)) {
                pending.get(m.id)!(m);
                pending.delete(m.id);
            } else if (m.method) listeners.forEach((l) => l(m));
        };
        const send = (method: string, params: Record<string, unknown> = {}) =>
            new Promise<CdpMessage>((res) => {
                const id = ++nextId;
                pending.set(id, res);
                ws.send(JSON.stringify({ id, method, params }));
            });
        const evaluate = async <T,>(expression: string): Promise<T> => {
            const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
            const result = r.result as { exceptionDetails?: { exception?: { description?: string } }; result?: { value: T } } | undefined;
            if (result?.exceptionDetails) throw new Error('page error: ' + (result.exceptionDetails.exception?.description ?? JSON.stringify(result.exceptionDetails)));
            return result!.result!.value;
        };
        const waitFor = async (expr: string, ms = 15000) => {
            const t0 = Date.now();
            while (Date.now() - t0 < ms) {
                if (await evaluate<boolean>(expr)) return;
                await sleep(150);
            }
            throw new Error('timed out waiting for ' + expr);
        };
        const click = (finder: string) => evaluate(`(${finder}).click(); true`);
        const buttonByText = (text: string) => `[...document.querySelectorAll('button')].find(e => e.textContent.trim() === ${JSON.stringify(text)})`;
        const ROLL = `document.querySelector('button[aria-label="Roll the dice"]:not([disabled])')`;

        await send('Page.enable');
        await send('Runtime.enable');
        await send('Emulation.setDeviceMetricsOverride', { width: viewW, height: viewH, deviceScaleFactor: DPR, mobile: false });
        const loaded = new Promise<void>((res) => listeners.push((m) => m.method === 'Page.loadEventFired' && res()));
        await send('Page.navigate', { url: site.url });
        await loaded;

        // Setup: board, one player, optional dice colour, launch.
        const boardCard = `document.querySelector('button[data-board=${JSON.stringify(board.id)}]')`;
        await waitFor(`!!${boardCard}`);
        await click(boardCard);
        await waitFor(`!!${buttonByText('1')}`);
        await click(buttonByText('1'));
        await waitFor(`!!${buttonByText('Launch Arena')}`);
        if (dice) await click(`document.querySelector('button[aria-label=${JSON.stringify(dice + ' dice')}]')`);
        await click(buttonByText('Launch Arena'));
        await waitFor(`!!${ROLL}`, 30000);
        await sleep(1500); // textures

        // The HUD's root is the first absolutely positioned ancestor of its Rules button and
        // sits exactly on the title plate. Swap it for the wordmark.
        await evaluate(`(() => {
            let el = document.querySelector('button[aria-label="How to play"]');
            while (el && getComputedStyle(el).position !== 'absolute') el = el.parentElement;
            if (!el) throw new Error('HUD not found');
            const r = el.getBoundingClientRect();
            el.style.visibility = 'hidden';
            const t = document.createElement('div');
            t.textContent = 'SARZEE';
            Object.assign(t.style, {
                position: 'fixed', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, pointerEvents: 'none',
                fontFamily: 'var(--font-geist-sans), Arial, sans-serif', fontWeight: '800', textTransform: 'uppercase',
                letterSpacing: '0.22em', textIndent: '0.22em', lineHeight: '1', fontSize: (r.height * 0.56) + 'px',
                backgroundImage: ${JSON.stringify(board.theme.titleGradient)}, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
                filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.55)) drop-shadow(0 6px 14px rgba(0,0,0,0.45))',
            });
            document.body.appendChild(t);
            return true;
        })()`);

        for (let i = 0; i < rolls; i++) {
            await waitFor(`!!${ROLL}`, 30000);
            await click(ROLL);
            await sleep(SETTLE_MS);
        }

        const shot = await send('Page.captureScreenshot', { format: 'png' });
        const png = Buffer.from((shot.result as { data: string }).data, 'base64');
        ws.close();

        await sharp(png)
            .extract({ left: 0, top: 0, width: CARD_W * DPR, height: CARD_H * DPR })
            .resize(CARD_W, CARD_H)
            .jpeg({ quality: 86, mozjpeg: true })
            .toFile(TARGET);
        const bytes = fs.statSync(TARGET).size;
        console.log(`${path.relative(ROOT, TARGET)}  ${board.name}, roll ${rolls}${dice ? `, ${dice} dice` : ''}  ${CARD_W}x${CARD_H}  ${bytes.toLocaleString()} bytes`);
        if (bytes > 300_000) console.warn('Over 300 KB: WhatsApp may skip the picture. Lower the JPEG quality.');
    } finally {
        // Chrome holds locks in its profile until it has actually gone.
        const exited = new Promise<void>((res) => {
            chrome.once('exit', () => res());
            setTimeout(res, 5000);
        });
        chrome.kill();
        await exited;
        site.close();
        try {
            fs.rmSync(profile, { recursive: true, force: true });
        } catch {
            /* a straggling lock; it is in the OS temp dir and harmless */
        }
    }
}

main().catch((e) => {
    console.error(e.message || e);
    process.exit(1);
});
