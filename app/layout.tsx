import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '4K & 8K Photo Video Editor',
  description: 'Create · Edit · Enhance · Upscale'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
