import type { Metadata } from 'next';
import './globals.css';
import { SessionGuard } from '../components/SessionGuard';
import { ThemeProvider } from '../contexts/theme-context';
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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          // Apply saved/system theme before first paint to avoid a light/dark flash.
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('sitepilot.theme-preference.v1');var d=t==='dark'||((!t||t==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-dvh bg-paper text-ink antialiased">
        <ThemeProvider>
          <SessionGuard enabled={authEnabled} />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
