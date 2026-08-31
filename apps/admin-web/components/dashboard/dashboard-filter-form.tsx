"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AdminButton, AdminField, AdminFilterPanel, AdminInput, AdminSelect } from "../ui/admin-ui";

interface DashboardFilterFormProps {
  branchOptions: Array<{ id: string; name: string }>;
}

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function DashboardFilterForm({ branchOptions }: DashboardFilterFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const defaults = useMemo(() => {
    const dateTo = searchParams.get("dateTo") ?? formatDateInput(new Date());
    const dateFrom = searchParams.get("dateFrom") ?? formatDateInput(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000));
    return {
      branchId: searchParams.get("branchId") ?? "",
      dateFrom,
      dateTo,
      granularity: searchParams.get("granularity") ?? "day",
    };
  }, [searchParams]);

  const [branchId, setBranchId] = useState(defaults.branchId);
  const [dateFrom, setDateFrom] = useState(defaults.dateFrom);
  const [dateTo, setDateTo] = useState(defaults.dateTo);
  const [granularity, setGranularity] = useState(defaults.granularity);

  useEffect(() => {
    setBranchId(defaults.branchId);
    setDateFrom(defaults.dateFrom);
    setDateTo(defaults.dateTo);
    setGranularity(defaults.granularity);
  }, [defaults]);

  function applyFilters() {
    if (dateFrom && dateTo && new Date(dateFrom) > new Date(dateTo)) {
      return;
    }
    const next = new URLSearchParams(searchParams.toString());

    if (branchId) next.set("branchId", branchId);
    else next.delete("branchId");

    next.set("dateFrom", dateFrom);
    next.set("dateTo", dateTo);
    next.set("granularity", granularity);
    router.replace(`${pathname}?${next.toString()}`);
  }

  function resetFilters() {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("branchId");
    next.delete("dateFrom");
    next.delete("dateTo");
    next.delete("granularity");
    router.replace(`${pathname}?${next.toString()}`);
  }

  return (
    <AdminFilterPanel
      kicker="Filtre"
      title="Şube · Tarih · Grafik"
      className="admin-filter-panel--toolbar"
    >
      <div className="admin-form-grid">
        <AdminField label="Şube">
          <AdminSelect value={branchId} onChange={(event) => setBranchId(event.target.value)}>
            <option value="">Tum yetkili subeler</option>
            {branchOptions.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </AdminSelect>
        </AdminField>

        <AdminField label="Başlangıç">
          <AdminInput type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
        </AdminField>

        <AdminField label="Bitiş">
          <AdminInput type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
        </AdminField>

        <AdminField label="Grafik Grubu">
          <AdminSelect value={granularity} onChange={(event) => setGranularity(event.target.value)}>
            <option value="day">Gunluk</option>
            <option value="week">Haftalik</option>
            <option value="month">Aylik</option>
          </AdminSelect>
        </AdminField>
      </div>

      <div className="admin-filter-actions">
        <AdminButton variant="outline" onClick={resetFilters}>
          Temizle
        </AdminButton>
        <AdminButton variant="primary" onClick={applyFilters}>
          Uygula
        </AdminButton>
      </div>
    </AdminFilterPanel>
  );
}
