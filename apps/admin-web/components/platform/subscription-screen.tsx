"use client";

import { useEffect, useState } from "react";
import type { SubscriptionOverviewResponse, SubscriptionPlanResponse } from "../../lib/api/client";
import { changePlan, fetchSubscriptionOverview, fetchSubscriptionPlans } from "../../lib/services/platform-service";
import { AdminButton, AdminPageHeader, AdminStateCard, AdminStatCard, AdminStatsGrid, AdminStatusBadge, AdminTableCard, AdminTableWrap } from "../ui/admin-ui";

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

  if (loading) return <AdminStateCard tone="info" message="Abonelik ekrani yukleniyor..." />;
  if (!overview) return <AdminStateCard tone="danger" message={error ?? "Abonelik verisi bulunamadi."} />;

  return (
    <div className="admin-page-stack admin-pos-settings-page">
      <AdminPageHeader
        kicker="Platform"
        title="Abonelik"
        description={`${overview.plan.name} paketi aktif. Durum: ${overview.subscription.status}`}
      />

      {error ? <AdminStateCard tone="danger" message={error} /> : null}

      <AdminStatsGrid>
        <AdminStatCard label="Aylik Paket" value={`${overview.plan.priceMonthly} TL`} />
        <AdminStatCard label="Sube Limiti" value={overview.plan.branchLimit} />
        <AdminStatCard label="Kullanici Limiti" value={overview.plan.userLimit} />
        <AdminStatCard label="Trial Bitis" value={overview.subscription.trialEndsAt ? new Date(overview.subscription.trialEndsAt).toLocaleDateString("tr-TR") : "-"} />
      </AdminStatsGrid>

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
              <AdminStatusBadge tone="info">{`${plan.priceMonthly} TL/ay`}</AdminStatusBadge>
            </div>
            <p className="admin-subtle-text">{`Sube ${plan.branchLimit} / Kullanici ${plan.userLimit}`}</p>
            <div className="admin-filter-actions">
              <AdminButton variant="primary" onClick={() => handleChangePlan(plan.code)}>
                Bu Pakete Gec
              </AdminButton>
            </div>
          </article>
        ))}
      </section>

      <AdminTableCard kicker="Billing" title="Son fatura kayitlari">
        <AdminTableWrap>
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
        </AdminTableWrap>
      </AdminTableCard>
    </div>
  );
}
