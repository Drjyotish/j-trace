"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LanguageSwitch, useI18n } from "./I18n";

const LINKS = [
  { href: "/start", key: "nav.start" },
  { href: "/case", key: "nav.case" },
  { href: "/protect", key: "nav.protect" },
  { href: "/feasibility", key: "nav.feasibility" },
  { href: "/dashboard", key: "nav.officer" },
];

export function Shell({ demo, children }: { demo: boolean; children: React.ReactNode }) {
  const { t } = useI18n();
  const path = usePathname() ?? "/";
  const wide = path.startsWith("/dashboard") || path.startsWith("/feasibility");
  return (
    <>
      {demo && (
        <div className="demo-banner" role="note">
          <div className="container wide">{t("demo.banner")}</div>
        </div>
      )}
      <header className="site-header">
        <div className="container wide row">
          <Link href="/" className="logo">
            <span className="logo-mark" aria-hidden="true">JT</span>
            <span>
              J TRACE
              <small>{t("brand.tagline")}</small>
            </span>
          </Link>
          <nav className="nav" aria-label="Main">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className={path.startsWith(l.href) ? "active" : undefined}>
                {t(l.key)}
              </Link>
            ))}
            <LanguageSwitch />
          </nav>
        </div>
      </header>
      <main>
        <div className={wide ? "container wide" : "container"}>{children}</div>
      </main>
      <footer className="site-footer">
        <div className="container wide">
          <p>{t("footer.what")}</p>
          <p>
            <strong>{t("footer.emergency")}</strong>
          </p>
          <p>
            Open source (MIT) ·{" "}
            <a href="https://github.com/Drjyotish/j-trace" rel="noreferrer">
              source code
            </a>{" "}
            · Not affiliated with any government, regulator, operator or device maker.
          </p>
        </div>
      </footer>
    </>
  );
}
