import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './cp-portal.css';

export const metadata: Metadata = {
  title: 'Channel Partner Portal',
  description: 'Independent workspace for Channel Partners',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
