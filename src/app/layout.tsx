import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AmplifyProvider } from '@/components/AmplifyProvider';

export const metadata: Metadata = {
  title: 'MacroAI - Smart Calorie & Macro Tracker',
  description:
    'Track your calories and macros with AI-powered food recognition. Log meals by search, text, or photo.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'MacroAI',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0A0A0F',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-bg-primary text-text-primary font-satoshi antialiased min-h-screen">
        <AmplifyProvider>{children}</AmplifyProvider>
      </body>
    </html>
  );
}
