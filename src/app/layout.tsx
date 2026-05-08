import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LogiTrack Express — Soluções em Logística',
  description: 'Rastreamento e gestão de encomendas em todo o Brasil',
  icons: { icon: '/favicon.ico' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
