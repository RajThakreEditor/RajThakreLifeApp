import './globals.css';
import Sidebar from './components/Sidebar';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="app-body">
        <div className="app-shell">
          <Sidebar />

          <main className="app-main">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
