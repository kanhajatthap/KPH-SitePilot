import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'KPH SitePilot — AI WordPress Agent Workspace',
  description: 'Provider-independent, security-first read-only AI WordPress agent dashboard',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-slate-950 text-slate-100 antialiased h-screen overflow-hidden">
        {children}
      </body>
    </html>
  );
}
