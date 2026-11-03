import type { Metadata, Viewport } from 'next';
import './globals.css';
import { SessionGuard } from '../components/SessionGuard';
import { getSupabasePublicConfig } from '../lib/supabase/config';

/**
 * E9-16: `viewportFit: 'cover'` lets the CSS `env(safe-area-inset-*)` tokens
 * work on notched phones; without it the sticky composer hides behind the home
 * indicator. `themeColor` matches the paper token.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#faf9f6',
};

export const metadata: Metadata = {
  title: 'KPH SitePilot — AI WordPress Agent Workspace',
  description:
    'A Lovable-class conversational workspace for inspecting, designing and publishing WordPress sites safely.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const authEnabled = Boolean(getSupabasePublicConfig());

  return (
    <html lang="en">
      <body className="min-h-dvh bg-paper text-ink antialiased">
        <SessionGuard enabled={authEnabled} />
        {children}
      </body>
    </html>
  );
}
