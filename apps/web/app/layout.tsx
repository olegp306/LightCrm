import type { Metadata } from "next";
import Link from "next/link";
import { ThemeToggle } from "./components/ThemeToggle";
import "./globals.css";

export const metadata: Metadata = {
  title: "LightCrm",
  description: "Table-first lightweight CRM MVP"
};

const navItems = [
  ["Today", "/today"],
  ["Clients", "/clients"],
  ["Leads", "/leads"],
  ["Storage", "/storage"],
  ["Settings", "/settings"],
  ["Cold Targets", "/cold-targets"],
  ["Outreach", "/outreach"],
  ["Calendar", "/calendar"]
] as const;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('lightcrm.colorTheme')||((matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light');document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t;}catch(e){document.documentElement.dataset.theme='light';}"
          }}
        />
      </head>
      <body>
        <div className="appShell">
          <aside className="sidebar">
            <div className="brand">
              <Link href="/">
                <strong>LightCrm</strong>
                <span>Table workspace</span>
              </Link>
            </div>
            <nav className="nav" aria-label="CRM navigation">
              {navItems.map(([label, href]) => (
                <Link key={href} href={href}>
                  {label}
                </Link>
              ))}
            </nav>
            <div className="sidebarFooter">
              <ThemeToggle />
            </div>
          </aside>
          <main className="mainShell">
            <div className="content">{children}</div>
          </main>
        </div>
        <div id="portal" style={{ position: "fixed", left: 0, top: 0, zIndex: 9999 }} />
      </body>
    </html>
  );
}
