import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { ToastProvider } from '@/hooks/useToast';
import { ThemeProvider } from '@/hooks/useTheme';
import { ToastDisplay } from '@/components/ToastDisplay';
import { THEME_INIT_SCRIPT } from '@/lib/theme';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'CoopLumen — Decentralized Community Finance',
  description: 'Open-source community finance network powered by the Stellar blockchain.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The pre-paint script below adds a theme class to this element, so the
    // server markup and the hydrated markup differ here by design.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Runs before first paint to avoid a flash of the wrong palette. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className={inter.className}>
        <ThemeProvider>
          <ToastProvider>
            <ErrorBoundary>{children}</ErrorBoundary>
            <ToastDisplay />
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
