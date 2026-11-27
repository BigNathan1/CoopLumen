import type { MetadataRoute } from 'next';

/**
 * PWA manifest, served by Next.js at `/manifest.webmanifest`.
 *
 * `display: standalone` is what makes the app installable as a home-screen
 * app on Android and iOS; the two PNG sizes are the pair browsers require to
 * consider the app installable, and the maskable variant keeps the icon from
 * being cropped on Android's adaptive shapes.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'CoopLumen — Community finance on Stellar',
    short_name: 'CoopLumen',
    description: 'Community-owned savings, loans and governance on the Stellar blockchain.',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0b1120',
    theme_color: '#0b1120',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
