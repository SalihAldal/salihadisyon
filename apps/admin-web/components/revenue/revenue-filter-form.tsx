"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

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
    <section className="admin-surface admin-filter-panel admin-reference-filters">
      <div className="admin-section-head">
        <div>
          <p className="admin-kicker">Hizli Tarih</p>
          <h3>Ciro akisini hizli filtrele</h3>
        </div>
        <div className="admin-button-row">
          <button className="admin-outline-button" type="button" onClick={() => handleQuickPreset("today")}>
            Bugun
          </button>
          <button className="admin-outline-button" type="button" onClick={() => handleQuickPreset("last7")}>
            Son 7 Gun
          </button>
          <button className="admin-outline-button" type="button" onClick={() => handleQuickPreset("last30")}>
            Son 30 Gun
          </button>
          <button className="admin-outline-button" type="button" onClick={() => handleQuickPreset("thisMonth")}>
            Bu Ay
          </button>
        </div>
      </div>
      <div className="admin-form-grid" onKeyDown={(event) => (event.key === "Enter" ? applyFilters() : undefined)}>
        {branchOptions.length > 0 ? (
          <label className="admin-field">
            <span>Sube</span>
            <select value={branchId} onChange={(event) => setBranchId(event.target.value)}>
              <option value="">Tum subeler</option>
              {branchOptions.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="admin-field">
          <span>Baslangic</span>
          <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
        </label>

        <label className="admin-field">
          <span>Bitis</span>
          <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
        </label>

        <label className="admin-field">
          <span>Grup</span>
          <select value={groupBy} onChange={(event) => setGroupBy(event.target.value)}>
            <option value="day">Gun</option>
            <option value="week">Hafta</option>
            <option value="month">Ay</option>
          </select>
        </label>

        {includeBranchSearch ? (
          <>
            <label className="admin-field">
              <span>Sube Ara</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Sube ismi ara" />
            </label>

            <label className="admin-field">
              <span>Siralama</span>
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                <option value="revenue">Ciro</option>
                <option value="ticketCount">Adisyon</option>
                <option value="averageBasket">Ort. Sepet</option>
              </select>
            </label>

            <label className="admin-field">
              <span>Yon</span>
              <select value={sortDirection} onChange={(event) => setSortDirection(event.target.value)}>
                <option value="desc">Azalan</option>
                <option value="asc">Artan</option>
              </select>
            </label>
          </>
        ) : null}

        <label className="admin-field">
          <span>Preset</span>
          <input value={preset} readOnly placeholder="Bugun / Son 7 Gun / Son 30 Gun / Bu Ay" />
        </label>
      </div>

      <div className="admin-filter-actions">
        <button className="admin-outline-button" type="button" onClick={clearFilters}>
          Sifirla
        </button>
        <button className="admin-primary-button" type="button" onClick={applyFilters}>
          Filtreleri Uygula
        </button>
      </div>
    </section>
  );
}
