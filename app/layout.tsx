import type { Metadata } from "next";
import "./globals.css";
import DarkModeToggle from "@/components/DarkModeToggle";

export const metadata: Metadata = {
  title: "Caltrain Commuter - Train Schedules & Weather",
  description:
    "Real-time Caltrain schedules and weather information for your commute",
  viewport: "width=device-width, initial-scale=1",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
            (function() {
              const theme = localStorage.getItem('theme');
              if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                document.documentElement.classList.add('dark');
              }
            })();
          `,
          }}
        />
      </head>
      <body className="bg-gray-50 dark:bg-gray-900 antialiased">
        <header className="shadow-lg" style={{ backgroundColor: "#E31837" }}>
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-white">
                  Caltrain Commuter
                </h1>
                <p className="text-sm md:text-base text-white opacity-90 mt-1">
                  Real-time schedules & weather at a glance
                </p>
              </div>
              <DarkModeToggle />
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-6 min-h-screen">
          {children}
        </main>

        <footer className="bg-gray-800 text-gray-300 mt-12">
          <div className="container mx-auto px-4 py-6 text-center text-sm">
            <p>Built with Next.js | Data updates automatically</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
