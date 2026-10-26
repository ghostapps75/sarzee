import type { MetadataRoute } from 'next';
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, THEME_COLOR } from '@/lib/site';

// A static export has no server to run this on request, so it is written out at build time.
export const dynamic = 'force-static';

/**
 * Web app manifest, served at /manifest.webmanifest. It is what lets a phone add Sarzee
 * to its home screen as an app rather than a bookmark. The icons come from
 * `scripts/brand-icons.js`.
 */
export default function manifest(): MetadataRoute.Manifest {
    return {
        name: SITE_TITLE,
        short_name: SITE_NAME,
        description: SITE_DESCRIPTION,
        start_url: '/',
        display: 'standalone',
        background_color: THEME_COLOR,
        theme_color: THEME_COLOR,
        icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
    };
}
