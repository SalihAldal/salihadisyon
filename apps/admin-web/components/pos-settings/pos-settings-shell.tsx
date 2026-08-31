"use client";

import Link from "next/link";
import { posSettingsScreens } from "../../lib/pos-settings-config";

const posSettingsExtras: Array<{ slug: string; title: string }> = [
  { slug: "fis-entegrasyonlari", title: "Fis Entegrasyonlari" },
  { slug: "yedekleme", title: "Yedekleme" },
  { slug: "feature-flags", title: "Feature Flags" },
];

const posSettingsNavGroups: Array<{ key: string; title: string; slugs: string[] }> = [
  { key: "menu", title: "MENÜ", slugs: ["menu", "urunler", "kategoriler", "opsiyonel-urunler", "zorunlu-secim-gruplari"] },
  { key: "sales", title: "SATIŞ", slugs: ["kampanyalar", "happy-hour", "sureli-indirimler", "indirim-turleri"] },
  { key: "service", title: "SERVİS / QR", slugs: ["qr-menu", "masalar", "paket-servis-adresleri", "musteriler", "on-tanimli-notlar"] },
  { key: "hardware", title: "DONANIM", slugs: ["tanimli-cihazlar", "terminaller", "yazicilar", "fis-entegrasyonlari", "arka-ekran-slider", "masa-renkleri"] },
  { key: "system", title: "SİSTEM", slugs: ["ayarlar", "yedekleme", "feature-flags"] },
];

function buildSlugIndex() {
  const map = new Map<string, { slug: string; title: string }>();
  for (const item of posSettingsScreens) {
    map.set(item.slug, { slug: item.slug, title: item.title });
  }
  for (const extra of posSettingsExtras) {
    map.set(extra.slug, extra);
  }
  return map;
}

const slugIndex = buildSlugIndex();

export function PosSettingsShell({
  activeSlug,
  aside,
  children,
}: {
  activeSlug?: string | null;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="admin-pos-settings-shell">
      <aside className="admin-pos-settings-shell__aside">
        <nav className="admin-pos-settings-subnav" aria-label="POS ayarları menüsü">
          {posSettingsNavGroups.map((group) => (
            <div key={group.key} className="admin-pos-settings-subnav__group">
              <p className="admin-pos-settings-subnav__title">{group.title}</p>
              <div className="admin-pos-settings-subnav__items">
                {group.slugs
                  .map((slug) => slugIndex.get(slug))
                  .filter(Boolean)
                  .map((item) => {
                    const active = Boolean(activeSlug && item!.slug === activeSlug);
                    return (
                      <Link
                        key={item!.slug}
                        href={`/pos-ayarlari/${item!.slug}`}
                        className={`admin-pos-settings-subnav__item ${active ? "is-active" : ""}`}
                      >
                        <span>{item!.title}</span>
                      </Link>
                    );
                  })}
              </div>
            </div>
          ))}
        </nav>
        {aside}
      </aside>
      <main className="admin-pos-settings-shell__main">{children}</main>
    </section>
  );
}

