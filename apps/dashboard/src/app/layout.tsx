import type { Metadata } from 'next';
import './globals.css';
import { SessionGuard } from '../components/SessionGuard';
import { getSupabasePublicConfig } from '../lib/supabase/config';

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
