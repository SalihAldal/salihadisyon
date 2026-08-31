"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AdminButton, AdminField, AdminFilterPanel, AdminInput, AdminSelect, AdminStatusBadge } from "../ui/admin-ui";

interface RevenueFilterFormProps {
  branchOptions?: Array<{ id: string; name: string }>;
  includeBranchSearch?: boolean;
}

function getDefaultDate(daysBack: number) {
  const date = new Date();
  date.setDate(date.getDate() - daysBack);
  return date.toISOString().slice(0, 10);
}

function getRangeFromPreset(preset: "today" | "last7" | "last30" | "thisMonth") {
  const now = new Date();
  const end = now.toISOString().slice(0, 10);
  if (preset === "today") return { from: end, to: end };
  if (preset === "last7") return { from: getDefaultDate(6), to: end };
  if (preset === "last30") return { from: getDefaultDate(29), to: end };
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  return { from: start, to: end };
}

export function RevenueFilterForm({ branchOptions = [], includeBranchSearch = false }: RevenueFilterFormProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [branchId, setBranchId] = useState(searchParams.get("branchId") ?? "");
  const [dateFrom, setDateFrom] = useState(searchParams.get("dateFrom") ?? getDefaultDate(29));
  const [dateTo, setDateTo] = useState(searchParams.get("dateTo") ?? new Date().toISOString().slice(0, 10));
  const [groupBy, setGroupBy] = useState(searchParams.get("groupBy") ?? "day");
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [sortBy, setSortBy] = useState(searchParams.get("sortBy") ?? "revenue");
  const [sortDirection, setSortDirection] = useState(searchParams.get("sortDirection") ?? "desc");
  const [preset, setPreset] = useState("");

  function applyFilters() {
    const next = new URLSearchParams(searchParams.toString());
    if (branchId) next.set("branchId", branchId);
    else next.delete("branchId");
    next.set("dateFrom", dateFrom);
    next.set("dateTo", dateTo);
    next.set("groupBy", groupBy);
    next.set("search", search);
    next.set("sortBy", sortBy);
    next.set("sortDirection", sortDirection);
    router.replace(`${pathname}?${next.toString()}`);
  }

  function clearFilters() {
    setBranchId("");
    setDateFrom(getDefaultDate(29));
    setDateTo(new Date().toISOString().slice(0, 10));
    setGroupBy("day");
    setSearch("");
    setSortBy("revenue");
    setSortDirection("desc");
    setPreset("");
    router.replace(pathname);
  }

  function handleQuickPreset(nextPreset: "today" | "last7" | "last30" | "thisMonth") {
    const range = getRangeFromPreset(nextPreset);
    setPreset(nextPreset);
    setDateFrom(range.from);
    setDateTo(range.to);
  }

  return (
    <AdminFilterPanel
      kicker="Filtre"
      title="Ciro filtresi"
      description="Şube, tarih aralığı ve gruplama seçimine göre raporlar güncellenir."
      badge={preset ? <AdminStatusBadge tone="info">{preset === "today" ? "Bugün" : preset === "last7" ? "Son 7 Gün" : preset === "last30" ? "Son 30 Gün" : "Bu Ay"}</AdminStatusBadge> : undefined}
      actions={
        <div className="admin-button-row">
          <AdminButton variant="outline" onClick={() => handleQuickPreset("today")}>
            Bugün
          </AdminButton>
          <AdminButton variant="outline" onClick={() => handleQuickPreset("last7")}>
            Son 7 Gün
          </AdminButton>
          <AdminButton variant="outline" onClick={() => handleQuickPreset("last30")}>
            Son 30 Gün
          </AdminButton>
          <AdminButton variant="outline" onClick={() => handleQuickPreset("thisMonth")}>
            Bu Ay
          </AdminButton>
        </div>
      }
      className="admin-filter-panel--toolbar"
    >
      <div className="admin-form-grid" onKeyDown={(event) => (event.key === "Enter" ? applyFilters() : undefined)}>
        {branchOptions.length > 0 ? (
          <AdminField label="Sube">
            <AdminSelect value={branchId} onChange={(event) => setBranchId(event.target.value)}>
              <option value="">Tum subeler</option>
              {branchOptions.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </AdminSelect>
          </AdminField>
        ) : null}

        <AdminField label="Baslangic">
          <AdminInput type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
        </AdminField>

        <AdminField label="Bitis">
          <AdminInput type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
        </AdminField>

        <AdminField label="Grup">
          <AdminSelect value={groupBy} onChange={(event) => setGroupBy(event.target.value)}>
            <option value="day">Gun</option>
            <option value="week">Hafta</option>
            <option value="month">Ay</option>
          </AdminSelect>
        </AdminField>

        {includeBranchSearch ? (
          <>
            <AdminField label="Sube Ara">
              <AdminInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Sube ismi ara" />
            </AdminField>

            <AdminField label="Siralama">
              <AdminSelect value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                <option value="revenue">Ciro</option>
                <option value="ticketCount">Adisyon</option>
                <option value="averageBasket">Ort. Sepet</option>
              </AdminSelect>
            </AdminField>

            <AdminField label="Yon">
              <AdminSelect value={sortDirection} onChange={(event) => setSortDirection(event.target.value)}>
                <option value="desc">Azalan</option>
                <option value="asc">Artan</option>
              </AdminSelect>
            </AdminField>
          </>
        ) : null}
      </div>

      <div className="admin-filter-actions">
        <AdminButton variant="outline" onClick={clearFilters}>
          Sifirla
        </AdminButton>
        <AdminButton variant="primary" onClick={applyFilters}>
          Filtreleri Uygula
        </AdminButton>
      </div>
    </AdminFilterPanel>
  );
}
