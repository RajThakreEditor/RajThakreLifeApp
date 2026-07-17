import './globals.css';
import { Toaster } from 'sonner';

export const metadata = {
  title: 'LifeOS — Personal Life Operating System',
  description: 'Executive dashboard for personal growth. Plan. Execute. Measure. Improve.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased bg-background text-foreground min-h-screen">
        {children}
        <Toaster theme="dark" position="bottom-right" richColors />
      </body>
    </html>
  );
}
