import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { ToastProvider } from '@/hooks/useToast';
import { ThemeProvider } from '@/hooks/useTheme';
import { LocaleProvider } from '@/hooks/useLocale';
import { ToastDisplay } from '@/components/ToastDisplay';
import { Footer } from '@/components/Footer';
import { THEME_INIT_SCRIPT } from '@/lib/theme';
import { LOCALE_INIT_SCRIPT, getDefaultLocale, getDirection } from '@/lib/i18n';
import { validateFrontendEnv } from '@/lib/env';
import './globals.css';

validateFrontendEnv();

const inter = Inter({ subsets: ['latin'] });

const defaultLocale = getDefaultLocale();
const defaultDirection = getDirection(defaultLocale);

export const metadata: Metadata = {
  title: 'CoopLumen — Decentralized Community Finance',
  description: 'Open-source community finance network powered by the Stellar blockchain.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The pre-paint scripts below set the theme class and the `lang`/`dir`
    // attributes on this element, so the server markup and the hydrated markup
    // differ here by design.
    <html lang={defaultLocale} dir={defaultDirection} suppressHydrationWarning>
      <head>
        {/* Both run before first paint to avoid a flash of the wrong palette or direction. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: LOCALE_INIT_SCRIPT }} />
      </head>
      <body className={inter.className}>
        <ThemeProvider>
          <LocaleProvider defaultLocale={defaultLocale}>
            <ToastProvider>
              <ErrorBoundary>{children}</ErrorBoundary>
              <Footer />
              <ToastDisplay />
            </ToastProvider>
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
