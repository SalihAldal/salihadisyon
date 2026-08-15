"use client";

export function GoPosLinkScreen() {
  const posUrl = "http://localhost:3001";

  return (
    <div className="dashboard-stack">
      <section className="admin-page-intro">
        <div>
          <p className="admin-kicker">Satış Ekranı</p>
          <h3>POS ekranına geçiş</h3>
        </div>
      </section>
      <section className="admin-surface">
        <p className="admin-subtle-text">POS ekranı ayrı sekmede açılır.</p>
        <div className="admin-filter-actions">
          <a
            className="admin-primary-button"
            href={posUrl}
            target="_blank"
            rel="noreferrer"
          >
            POS Ekranını Aç
          </a>
        </div>
      </section>
    </div>
  );
}
