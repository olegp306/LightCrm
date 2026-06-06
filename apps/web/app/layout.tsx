import type { Metadata } from "next";
import Link from "next/link";
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
  ["Cold Targets", "/cold-targets"],
  ["Outreach", "/outreach"],
  ["Calendar", "/calendar"]
] as const;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
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
          </aside>
          <main className="content">{children}</main>
        </div>
        <div id="portal" style={{ position: "fixed", left: 0, top: 0, zIndex: 9999 }} />
      </body>
    </html>
  );
}
