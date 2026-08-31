"use client";

import { useMemo, useState } from "react";
import type { DashboardOverviewResponse } from "../../lib/api/client";
import { formatTrDateTime, formatTryCurrency } from "../../lib/utils/admin-format";
import { AdminButton, AdminChartCard, AdminStatCard, AdminStatsGrid, AdminStatusBadge, AdminTableCard, AdminTableWrap, resolveBadgeTone } from "../ui/admin-ui";

function renderEmptyState(message: string) {
  return <p className="admin-subtle-text">{message}</p>;
}

export function DashboardWidgets({ data }: { data: DashboardOverviewResponse }) {
  const [showMore, setShowMore] = useState(false);
  const maxTrendRevenue = useMemo(
    () => Math.max(...data.trend.points.map((entry) => entry.revenue), 1),
    [data.trend.points],
  );

  const kpiCards = data.cards.slice(0, 4);

  return (
    <>
      <AdminStatsGrid>
        {kpiCards.map((card) => (
          <AdminStatCard
            key={card.key}
            label={card.label}
            value={card.key.includes("count") || card.key.includes("branches") ? card.value : formatTryCurrency(card.value)}
            helper={card.meta}
            badge={<AdminStatusBadge tone={resolveBadgeTone(card.tone)}>{card.delta.toFixed(0)}</AdminStatusBadge>}
          />
        ))}
      </AdminStatsGrid>

      <section className="dashboard-grid dashboard-grid--hero">
        <AdminChartCard
          kicker="Ana Analitik"
          title="Ciro Trendi & Ödeme Dağılımı"
          description="Seçili filtreye göre ciro trendini ve ödeme dağılımını izleyin."
          actions={
            <div className="admin-tab-row">
              <span className="admin-tab admin-tab--active">{data.trend.granularity.toUpperCase()}</span>
              <AdminStatusBadge tone="info">{data.trend.points.length} nokta</AdminStatusBadge>
            </div>
          }
        >
          <div className="admin-chart-live">
            {data.trend.points.map((point) => (
              <div key={point.label} className="admin-chart-live__item">
                <div
                  className="admin-chart-live__bar"
                  style={{
                    height: `${Math.max(12, (point.revenue / maxTrendRevenue) * 180)}px`,
                  }}
                />
                <strong>{point.label}</strong>
                <span>{formatTryCurrency(point.revenue)}</span>
              </div>
            ))}
          </div>
          <div className="admin-chart-live__legend">
            {data.paymentBreakdown.map((item) => (
              <span key={item.method}>
                {item.method} {item.ratio.toFixed(1)}%
              </span>
            ))}
          </div>
        </AdminChartCard>

        <AdminChartCard
          kicker="Operasyon"
          title="Anlık Uyarılar"
          badge={<AdminStatusBadge tone="warning">{data.statusFlow.length} olay</AdminStatusBadge>}
          className="admin-stream-card"
        >
          <div className="admin-section-head">
            <p className="admin-subtle-text">Anlik izlenmesi gereken operasyonel sinyaller.</p>
          </div>
          <div className="admin-stream-list">
            {data.statusFlow.map((alert) => (
              <div key={`${alert.title}-${alert.meta}`} className="admin-stream-item">
                <span className={`admin-status-dot admin-status-dot--${alert.tone}`} />
                <div>
                  <strong>{alert.title}</strong>
                  <p>{alert.meta}</p>
                </div>
              </div>
            ))}
          </div>
        </AdminChartCard>
      </section>

      <section className="dashboard-grid dashboard-grid--secondary">
        {data.widgetVisibility.finance ? (
          <AdminChartCard
            kicker="İkincil Analitik"
            title="Finans Özeti"
            badge={<AdminStatusBadge tone={data.financeSnapshot.estimatedNet >= 0 ? "success" : "danger"}>{formatTryCurrency(data.financeSnapshot.estimatedNet)}</AdminStatusBadge>}
          >
            <div className="admin-metric-row">
              <div>
                <span className="admin-kicker">Gunluk Ciro</span>
                <strong>{formatTryCurrency(data.financeSnapshot.dailyRevenue)}</strong>
              </div>
              <div>
                <span className="admin-kicker">Gunluk Gider</span>
                <strong>{formatTryCurrency(data.financeSnapshot.dailyExpense)}</strong>
              </div>
              <div>
                <span className="admin-kicker">Tahmini Net</span>
                <strong>{formatTryCurrency(data.financeSnapshot.estimatedNet)}</strong>
              </div>
              <div>
                <span className="admin-kicker">Sabit Yuku / Gun</span>
                <strong>{formatTryCurrency(data.financeSnapshot.dailyCommittedFixedBurn)}</strong>
              </div>
            </div>
          </AdminChartCard>
        ) : (
          <AdminTableCard kicker="İkincil Analitik" title="Finans Özeti">
            {renderEmptyState("Bu rol icin finans ozeti gosterilmiyor.")}
          </AdminTableCard>
        )}

        {data.widgetVisibility.staff ? (
          <AdminTableCard
            kicker="İkincil Analitik"
            title="Personel Mesai Durumu"
            badge={<AdminStatusBadge tone="info">{data.dailyShifts.length} kayit</AdminStatusBadge>}
          >
            {data.dailyShifts.length ? (
              <ul className="admin-list">
                {data.dailyShifts.map((shift) => (
                  <li key={shift.id}>
                    <strong>{shift.employeeName}</strong>
                    <span>{` / ${shift.branchName} / ${formatTrDateTime(shift.scheduledStartAt, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} - ${formatTrDateTime(shift.scheduledEndAt, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`}</span>
                    <AdminStatusBadge tone={resolveBadgeTone(shift.statusTone)}>{shift.statusLabel}</AdminStatusBadge>
                  </li>
                ))}
              </ul>
            ) : (
              renderEmptyState("Bugun icin planli mesai kaydi yok.")
            )}
          </AdminTableCard>
        ) : (
          <AdminTableCard kicker="İkincil Analitik" title="Personel Mesai Durumu">
            {renderEmptyState("Bu rol icin personel mesai verisi gosterilmiyor.")}
          </AdminTableCard>
        )}

        <AdminTableCard
          kicker="İkincil Analitik"
          title="Hedefler & Prim Uygunluğu"
          badge={<AdminStatusBadge tone="success">{data.eligibleBonuses.length} prim uygun</AdminStatusBadge>}
        >
          {data.widgetVisibility.goals && data.goalProgress.length ? (
            <ul className="admin-list">
              {data.goalProgress.map((goal) => (
                <li key={goal.id}>
                  <strong>{goal.title}</strong>
                  <span>{` / ${goal.employeeName} / ${goal.branchName} / ${goal.goalTypeLabel} / ${goal.currentValue} / ${goal.targetValue}`}</span>
                  <AdminStatusBadge tone={resolveBadgeTone(goal.statusTone)}>{`${goal.progressRate.toFixed(0)}%`}</AdminStatusBadge>
                </li>
              ))}
            </ul>
          ) : data.widgetVisibility.goals ? (
            renderEmptyState("Aktif hedef verisi bulunmuyor.")
          ) : (
            renderEmptyState("Bu rol icin hedef verisi gosterilmiyor.")
          )}
        </AdminTableCard>
      </section>

      <section className="dashboard-grid dashboard-grid--secondary">
        <AdminTableCard
          kicker="Operasyon"
          title="Son Aktivite"
          description="Görevler, bildirimler ve bekleyen aksiyonlar tek akışta."
          actions={
            <AdminButton variant="outline" className="admin-outline-button--sm" onClick={() => setShowMore((value) => !value)}>
              {showMore ? "Daha Az" : "Daha Fazla"}
            </AdminButton>
          }
        >
          <div className="admin-activity-feed">
            <div className="admin-activity-feed__section">
              <div className="admin-activity-feed__head">
                <h4>Yapılacaklar</h4>
                <AdminStatusBadge tone="info">{data.todoItems.length}</AdminStatusBadge>
              </div>
              {data.todoItems.length ? (
                <ul className="admin-list">
                  {data.todoItems.slice(0, showMore ? 6 : 3).map((item) => (
                    <li key={item.id}>
                      <strong>{item.title}</strong>
                      <span>{`${item.branchName} / ${item.priorityLabel}${item.dueAt ? ` / ${formatTrDateTime(item.dueAt, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}`}</span>
                      <AdminStatusBadge tone={item.statusTone === "danger" ? "danger" : item.statusTone}>{item.statusLabel}</AdminStatusBadge>
                    </li>
                  ))}
                </ul>
              ) : (
                renderEmptyState("Bugün için planlanan görev yok.")
              )}
            </div>

            <div className="admin-activity-feed__divider" />

            <div className="admin-activity-feed__section">
              <div className="admin-activity-feed__head">
                <h4>Bildirimler</h4>
                <AdminStatusBadge tone="warning">{data.notifications.length}</AdminStatusBadge>
              </div>
              {data.widgetVisibility.notifications && data.notifications.length ? (
                <ul className="admin-list">
                  {data.notifications.slice(0, showMore ? 6 : 3).map((item) => (
                    <li key={item.id}>
                      <strong>{item.title}</strong>
                      <span>{`${item.branchName} / ${formatTrDateTime(item.createdAt, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`}</span>
                      <AdminStatusBadge tone={item.isRead ? "neutral" : "info"}>{item.isRead ? "Okundu" : "Yeni"}</AdminStatusBadge>
                    </li>
                  ))}
                </ul>
              ) : (
                renderEmptyState("Yeni bildirim yok.")
              )}
            </div>
          </div>
        </AdminTableCard>

        <AdminTableCard kicker="Operasyon" title="Bekleyen Taskler" badge={<AdminStatusBadge tone="warning">{data.pendingTasks.length} bekleyen</AdminStatusBadge>}>
          {data.pendingTasks.length ? (
            <ul className="admin-list">
              {data.pendingTasks.slice(0, showMore ? 8 : 4).map((item) => (
                <li key={item.id}>
                  <strong>{item.title}</strong>
                  <span>{`${item.assigneeName} / ${item.branchName} / ${item.priorityLabel}${item.dueAt ? ` / ${formatTrDateTime(item.dueAt, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}`}</span>
                  <AdminStatusBadge tone={item.statusTone === "danger" ? "danger" : item.statusTone}>{item.statusLabel}</AdminStatusBadge>
                </li>
              ))}
            </ul>
          ) : (
            renderEmptyState("Bekleyen task yok.")
          )}
        </AdminTableCard>

        <AdminTableCard kicker="Satis" title="En Cok Satan Urunler" badge={<AdminStatusBadge tone="success">{data.topProducts.length} urun</AdminStatusBadge>}>
          {data.topProducts.length ? (
            <ul className="admin-list">
              {data.topProducts.slice(0, showMore ? 8 : 4).map((item) => (
                <li key={item.id}>
                  <strong>{item.productName}</strong>
                  <span>{` / ${item.quantity.toFixed(2)} adet / ${formatTryCurrency(item.revenue)}`}</span>
                </li>
              ))}
            </ul>
          ) : (
            renderEmptyState("Secili donemde satis verisi yok.")
          )}
        </AdminTableCard>
      </section>

      {showMore ? (
        <section className="dashboard-grid dashboard-grid--secondary">
          {data.widgetVisibility.staff ? (
            <AdminTableCard
              kicker="Geç Gelenler"
              title="Bugun Gec Gelen Personeller"
              badge={<AdminStatusBadge tone="danger">{data.lateStaff.length} kayit</AdminStatusBadge>}
            >
              {data.lateStaff.length ? (
                <ul className="admin-list">
                  {data.lateStaff.map((item) => (
                    <li key={item.id}>
                      <strong>{item.employeeName}</strong>
                      <span>{` / ${item.branchName} / ${item.lateMinutes} dk / plan ${formatTrDateTime(item.scheduledStartAt, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`}</span>
                      <AdminStatusBadge tone="danger">{item.lateMinutes} dk gec</AdminStatusBadge>
                    </li>
                  ))}
                </ul>
              ) : (
                renderEmptyState("Bugun gec gelen personel yok.")
              )}
            </AdminTableCard>
          ) : null}

          {data.widgetVisibility.goals ? (
            <AdminTableCard
              kicker="Prim"
              title="Prim Hak Edilen Hedefler"
              badge={<AdminStatusBadge tone="success">{data.eligibleBonuses.length} hak edis</AdminStatusBadge>}
            >
              {data.eligibleBonuses.length ? (
                <ul className="admin-list">
                  {data.eligibleBonuses.map((goal) => (
                    <li key={goal.id}>
                      <strong>{goal.employeeName}</strong>
                      <span>{` / ${goal.title} / ${goal.goalTypeLabel} / ${goal.progressRate.toFixed(0)}% / ${formatTryCurrency(goal.bonusAmount)}`}</span>
                      <AdminStatusBadge tone="success">{goal.bonusStatus === "pending_approval" ? "Onay Bekliyor" : "Prim"}</AdminStatusBadge>
                    </li>
                  ))}
                </ul>
              ) : (
                renderEmptyState("Prim hak eden hedef yok.")
              )}
            </AdminTableCard>
          ) : null}
        </section>
      ) : null}

      <section className="dashboard-grid dashboard-grid--secondary">
        {data.widgetVisibility.inventory ? (
          <AdminTableCard
            kicker="Stok"
            title="Kritik Stok Uyarilari"
            badge={<AdminStatusBadge tone="danger">{data.criticalStockAlerts.length} kritik</AdminStatusBadge>}
          >
            {data.criticalStockAlerts.length ? (
              <ul className="admin-list">
                {data.criticalStockAlerts.map((item) => (
                  <li key={item.id}>
                    <strong>{item.itemName}</strong>
                    <span>{` / ${item.branchName} / ${item.currentStock} / esik ${item.threshold}`}</span>
                  </li>
                ))}
              </ul>
            ) : (
              renderEmptyState("Kritik stok uyarisi yok.")
            )}
          </AdminTableCard>
        ) : (
          <AdminTableCard kicker="Stok" title="Kritik Stok Uyarilari">
            {renderEmptyState("Bu rol icin stok verisi gosterilmiyor.")}
          </AdminTableCard>
        )}

        {data.widgetVisibility.inventory ? (
          <AdminTableCard
            kicker="Hammadde"
            title="En Az Kalan Hammaddeler"
            badge={<AdminStatusBadge tone="warning">{data.lowStockIngredients.length} kalem</AdminStatusBadge>}
          >
            {data.lowStockIngredients.length ? (
              <ul className="admin-list">
                {data.lowStockIngredients.map((item) => (
                  <li key={item.id}>
                    <strong>{item.itemName}</strong>
                    <span>{` / ${item.branchName} / ${item.currentStock} ${item.unit} / min ${item.minimumLevel}`}</span>
                  </li>
                ))}
              </ul>
            ) : (
              renderEmptyState("Reçeteye bagli dusuk hammadde bulunmuyor.")
            )}
          </AdminTableCard>
        ) : null}

        {data.widgetVisibility.inventory ? (
          <AdminTableCard
            kicker="Hareket"
            title="Son Stok Hareketleri"
            badge={<AdminStatusBadge tone="info">{data.recentStockMovements.length} hareket</AdminStatusBadge>}
          >
            {data.recentStockMovements.length ? (
              <ul className="admin-list">
                {data.recentStockMovements.map((item) => (
                  <li key={item.id}>
                    <strong>{item.itemName}</strong>
                    <span>{` / ${item.branchName} / ${item.quantityEffect > 0 ? "+" : ""}${item.quantityEffect} ${item.unit} / ${formatTrDateTime(item.createdAt, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`}</span>
                  </li>
                ))}
              </ul>
            ) : (
              renderEmptyState("Son stok hareketi bulunmuyor.")
            )}
          </AdminTableCard>
        ) : null}
      </section>

      <section className="dashboard-grid dashboard-grid--secondary">
        {data.widgetVisibility.finance ? (
          <AdminTableCard
            kicker="Sabit Maliyet"
            title="Aylik Yuku En Yuksek Kalemler"
            badge={<AdminStatusBadge tone="warning">{data.fixedCostSnapshot.activeCount} aktif plan</AdminStatusBadge>}
          >
            {data.fixedCostSnapshot.items.length ? (
              <ul className="admin-list">
                {data.fixedCostSnapshot.items.map((item) => (
                  <li key={item.id}>
                    <strong>{item.title}</strong>
                    <span>{` / ${item.branchName} / ${formatTryCurrency(item.monthlyEstimate)}`}</span>
                  </li>
                ))}
              </ul>
            ) : (
              renderEmptyState("Aktif sabit maliyet plani bulunmuyor.")
            )}
          </AdminTableCard>
        ) : null}

        <AdminTableCard
          kicker="Sube Performansi"
          title="Ciro ve Sepet Karsilastirmasi"
          badge={<AdminStatusBadge tone="info">{data.branchComparison.length} sube</AdminStatusBadge>}
        >
          <AdminTableWrap>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Sube</th>
                  <th>Ciro</th>
                  <th>Adisyon</th>
                  <th>Ort. Sepet</th>
                </tr>
              </thead>
              <tbody>
                {data.branchComparison.map((row) => (
                  <tr key={row.branchId}>
                    <td>{row.branchName}</td>
                    <td>{formatTryCurrency(row.revenue)}</td>
                    <td>{row.ticketCount}</td>
                    <td>{formatTryCurrency(row.averageBasket)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminTableWrap>
        </AdminTableCard>

        <AdminTableCard
          kicker="Insan Kaynagi"
          title="Yaklasan Dogum Gunleri"
          badge={<AdminStatusBadge tone="warning">{data.upcomingBirthdays.length} kayit</AdminStatusBadge>}
        >
          {data.widgetVisibility.staff && data.upcomingBirthdays.length ? (
            <ul className="admin-list">
              {data.upcomingBirthdays.map((item) => (
                <li key={item.id}>
                  <strong>{item.employeeName}</strong>
                  <span>{` / ${item.branchName} / ${item.daysLeft} gun`}</span>
                </li>
              ))}
            </ul>
          ) : data.widgetVisibility.staff ? (
            renderEmptyState("Yaklasan dogum gunu kaydi bulunmuyor.")
          ) : (
            renderEmptyState("Bu rol icin IK verisi gosterilmiyor.")
          )}
        </AdminTableCard>
      </section>
    </>
  );
}
