"use client";

import { useEffect, useState } from "react";
import type { SubscriptionOverviewResponse, SubscriptionPlanResponse } from "../../lib/api/client";
import { changePlan, fetchSubscriptionOverview, fetchSubscriptionPlans } from "../../lib/services/platform-service";

export function SubscriptionScreen() {
  const [overview, setOverview] = useState<SubscriptionOverviewResponse | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlanResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    try {
      const [overviewResponse, plansResponse] = await Promise.all([fetchSubscriptionOverview(), fetchSubscriptionPlans()]);
      setOverview(overviewResponse);
      setPlans(plansResponse);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Abonelik verisi alinamadi.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function handleChangePlan(planCode: string) {
    try {
      await changePlan(planCode);
      await loadData();
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : "Plan degisikligi basarisiz.");
    }
  }

  if (loading) return <div className="admin-surface admin-empty-state">Abonelik ekrani yukleniyor...</div>;
  if (!overview) return <div className="admin-surface admin-empty-state">{error ?? "Abonelik verisi bulunamadi."}</div>;

  return (
    <div className="dashboard-stack">
      <section className="admin-page-intro">
        <div>
          <p className="admin-kicker">Sprint 8 / Abonelik</p>
          <h3>Paket, feature ve kullanim limitleri</h3>
          <p className="admin-subtle-text">{`${overview.plan.name} paketi aktif. Durum: ${overview.subscription.status}`}</p>
        </div>
      </section>

      {error ? <div className="admin-status-pill admin-status-pill--danger">{error}</div> : null}

      <section className="dashboard-grid dashboard-grid--stats">
        <article className="admin-surface admin-stat-card">
          <span className="admin-kicker">Aylik Paket</span>
          <strong className="admin-stat-card__value">{overview.plan.priceMonthly} TL</strong>
        </article>
        <article className="admin-surface admin-stat-card">
          <span className="admin-kicker">Sube Limiti</span>
          <strong className="admin-stat-card__value">{overview.plan.branchLimit}</strong>
        </article>
        <article className="admin-surface admin-stat-card">
          <span className="admin-kicker">Kullanici Limiti</span>
          <strong className="admin-stat-card__value">{overview.plan.userLimit}</strong>
        </article>
        <article className="admin-surface admin-stat-card">
          <span className="admin-kicker">Trial Bitis</span>
          <strong className="admin-stat-card__value">{overview.subscription.trialEndsAt ? new Date(overview.subscription.trialEndsAt).toLocaleDateString("tr-TR") : "-"}</strong>
        </article>
      </section>

      <section className="dashboard-grid dashboard-grid--secondary">
        <article className="admin-surface">
          <div className="admin-section-head">
            <div>
              <p className="admin-kicker">Usage Limits</p>
              <h3>Kullanim ozetleri</h3>
            </div>
          </div>
          <div className="admin-metric-row">
            {overview.usage.map((item) => (
              <div key={item.metricKey}>
                <span className="admin-kicker">{item.metricKey}</span>
                <strong>{`${item.currentValue} / ${item.limitValue}`}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="admin-surface">
          <div className="admin-section-head">
            <div>
              <p className="admin-kicker">Feature Matrix</p>
              <h3>Paket ozellikleri</h3>
            </div>
          </div>
          <ul className="admin-list">
            {Object.entries(overview.plan.features).map(([key, value]) => (
              <li key={key}>
                <strong>{key}</strong>
                <span>{` / ${value === true ? "aktif" : String(value)}`}</span>
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="dashboard-grid dashboard-grid--secondary">
        {plans.map((plan) => (
          <article key={plan.id} className="admin-surface">
            <div className="admin-section-head">
              <div>
                <p className="admin-kicker">{plan.code.toUpperCase()}</p>
                <h3>{plan.name}</h3>
              </div>
              <span className="admin-status-pill admin-status-pill--info">{`${plan.priceMonthly} TL/ay`}</span>
            </div>
            <p className="admin-subtle-text">{`Sube ${plan.branchLimit} / Kullanici ${plan.userLimit}`}</p>
            <div className="admin-filter-actions">
              <button className="admin-primary-button" type="button" onClick={() => handleChangePlan(plan.code)}>
                Bu Pakete Gec
              </button>
            </div>
          </article>
        ))}
      </section>

      <section className="admin-surface">
        <div className="admin-section-head">
          <div>
            <p className="admin-kicker">Billing</p>
            <h3>Son fatura kayitlari</h3>
          </div>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Tutar</th>
                <th>Donem</th>
                <th>Odeme</th>
                <th>Ref</th>
              </tr>
            </thead>
            <tbody>
              {overview.billing.map((item) => (
                <tr key={item.id}>
                  <td>{item.amount}</td>
                  <td>{`${new Date(item.periodStart).toLocaleDateString("tr-TR")} - ${new Date(item.periodEnd).toLocaleDateString("tr-TR")}`}</td>
                  <td>{item.paidAt ? new Date(item.paidAt).toLocaleDateString("tr-TR") : "-"}</td>
                  <td>{item.providerRef ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
