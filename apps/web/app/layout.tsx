import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { CalendarDays, FileText, Folders, Megaphone, MoreHorizontal, Send, Settings, UsersRound, type LucideIcon } from "lucide-react";
import appPackage from "../package.json";
import { authSessionCookieName, readSessionCookieValue } from "../auth/session";
import { BackupButton } from "./components/BackupButton";
import { ThemeToggle } from "./components/ThemeToggle";
import "./globals.css";

export const metadata: Metadata = {
  title: "LightCrm",
  description: "Table-first lightweight CRM MVP"
};

type NavItem = {
  label: string;
  href: string;
  Icon: LucideIcon;
};

const primaryNavItems: NavItem[] = [
  { label: "Today", href: "/today", Icon: CalendarDays },
  { label: "Clients", href: "/clients", Icon: UsersRound },
  { label: "Leads", href: "/leads", Icon: Folders },
  { label: "Call Target", href: "/cold-targets", Icon: Megaphone }
];

const tableNavItems: NavItem[] = [
  { label: "StorageTable", href: "/storage", Icon: FileText },
  { label: "Settings", href: "/settings", Icon: Settings },
  { label: "Outreach", href: "/outreach", Icon: Send },
  { label: "CalendarTable", href: "/calendar", Icon: CalendarDays }
];

function NavIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="navIcon" aria-hidden="true">
      <Icon size={16} strokeWidth={1.8} />
    </span>
  );
}

function getEnvironmentBadge() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const workspaceId = process.env.LIGHTCRM_WORKSPACE_ID ?? "";
  if (workspaceId.toLowerCase() === "test" || appUrl.includes(":3004")) {
    return "Тестовый стенд · 3004";
  }
  return null;
}

function accountLabel(email: string) {
  return email.split("@")[0] || email;
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const environmentBadge = getEnvironmentBadge();
  const session = await readSessionCookieValue(cookies().get(authSessionCookieName)?.value);

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
                <span>v{appPackage.version}</span>
              </Link>
              {environmentBadge ? <div className="environmentBadge">{environmentBadge}</div> : null}
              {session ? (
                <form className="sidebarUser" action="/api/auth/logout" method="post" title={session.email}>
                  <button type="submit">
                    <span>Logout</span>
                    <b>{accountLabel(session.email)}</b>
                  </button>
                </form>
              ) : null}
            </div>
            <nav className="nav" aria-label="CRM navigation">
              <div className="navPrimary" aria-label="Operator workspace">
                {primaryNavItems.map((item) => (
                  <Link key={item.href} href={item.href}>
                    <NavIcon icon={item.Icon} />
                    <span>{item.label}</span>
                  </Link>
                ))}
              </div>
              <details className="navSecondary">
                <summary>
                  <span className="navSummaryIcon" aria-hidden="true">
                    <MoreHorizontal size={16} strokeWidth={1.8} />
                  </span>
                  <span className="navMoreLabelDesktop">More tables</span>
                  <span className="navMoreLabelMobile">More</span>
                </summary>
                <div>
                  {tableNavItems.map((item) => (
                    <Link key={item.href} href={item.href}>
                      <NavIcon icon={item.Icon} />
                      <span>{item.label}</span>
                    </Link>
                  ))}
                </div>
              </details>
            </nav>
            <div className="sidebarFooter">
              <div className="sidebarBackup">
                <BackupButton />
              </div>
              <div className="sidebarBottom">
                <ThemeToggle />
              </div>
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
