"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AdminButton, AdminField, AdminFilterPanel, AdminInput, AdminSelect } from "../ui/admin-ui";

interface ReportFilterFormProps {
  branchOptions: Array<{ id: string; name: string }>;
}

function getDefaultDate(daysBack: number) {
  const date = new Date();
  date.setDate(date.getDate() - daysBack);
  return date.toISOString().slice(0, 10);
}

function getRangeFromPreset(preset: "today" | "last7" | "last30" | "thisMonth" | "thisYear") {
  const now = new Date();
  const end = now.toISOString().slice(0, 10);
  if (preset === "today") return { from: end, to: end };
  if (preset === "last7") return { from: getDefaultDate(6), to: end };
  if (preset === "last30") return { from: getDefaultDate(29), to: end };
  if (preset === "thisYear") {
    const start = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
    return { from: start, to: end };
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  return { from: start, to: end };
}

function autoCompareRange(from: string, to: string) {
  if (!from || !to) return { compareFrom: "", compareTo: "" };
  const start = new Date(from);
  const end = new Date(to);
  const diff = end.getTime() - start.getTime();
  const previousEnd = new Date(start.getTime() - 24 * 60 * 60 * 1000);
  const previousStart = new Date(previousEnd.getTime() - diff);
  return {
    compareFrom: previousStart.toISOString().slice(0, 10),
    compareTo: previousEnd.toISOString().slice(0, 10),
  };
}

export function ReportFilterForm({ branchOptions }: ReportFilterFormProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [branchId, setBranchId] = useState(searchParams.get("branchId") ?? "");
  const [dateFrom, setDateFrom] = useState(searchParams.get("dateFrom") ?? getDefaultDate(29));
  const [dateTo, setDateTo] = useState(searchParams.get("dateTo") ?? new Date().toISOString().slice(0, 10));
  const [compareFrom, setCompareFrom] = useState(searchParams.get("compareFrom") ?? "");
  const [compareTo, setCompareTo] = useState(searchParams.get("compareTo") ?? "");
  const [groupBy, setGroupBy] = useState(searchParams.get("groupBy") ?? "day");
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [sortBy, setSortBy] = useState(searchParams.get("sortBy") ?? "");
  const [sortDirection, setSortDirection] = useState(searchParams.get("sortDirection") ?? "desc");
  const [preset, setPreset] = useState("");

  useEffect(() => {
    setBranchId(searchParams.get("branchId") ?? "");
    setDateFrom(searchParams.get("dateFrom") ?? getDefaultDate(29));
    setDateTo(searchParams.get("dateTo") ?? new Date().toISOString().slice(0, 10));
    setCompareFrom(searchParams.get("compareFrom") ?? "");
    setCompareTo(searchParams.get("compareTo") ?? "");
    setGroupBy(searchParams.get("groupBy") ?? "day");
    setSearch(searchParams.get("search") ?? "");
    setSortBy(searchParams.get("sortBy") ?? "");
    setSortDirection(searchParams.get("sortDirection") ?? "desc");
  }, [searchParams]);

  function applyFilters() {
    if (dateFrom && dateTo && new Date(dateFrom) > new Date(dateTo)) {
      return;
    }
    if (compareFrom && compareTo && new Date(compareFrom) > new Date(compareTo)) {
      return;
    }
    const next = new URLSearchParams(searchParams.toString());
    const entries = { branchId, dateFrom, dateTo, compareFrom, compareTo, groupBy, search, sortBy, sortDirection };

    for (const [key, value] of Object.entries(entries)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }

    router.replace(`${pathname}?${next.toString()}`);
  }

  function handleQuickPreset(nextPreset: "today" | "last7" | "last30" | "thisMonth" | "thisYear") {
    const range = getRangeFromPreset(nextPreset);
    const compare = autoCompareRange(range.from, range.to);
    setPreset(nextPreset);
    setDateFrom(range.from);
    setDateTo(range.to);
    setCompareFrom(compare.compareFrom);
    setCompareTo(compare.compareTo);
  }

  function handleAutoCompare() {
    const compare = autoCompareRange(dateFrom, dateTo);
    setCompareFrom(compare.compareFrom);
    setCompareTo(compare.compareTo);
  }

  function clearFilters() {
    setBranchId("");
    setDateFrom(getDefaultDate(29));
    setDateTo(new Date().toISOString().slice(0, 10));
    setCompareFrom("");
    setCompareTo("");
    setGroupBy("day");
    setSearch("");
    setSortBy("");
    setSortDirection("desc");
    setPreset("");
    router.replace(pathname);
  }

  return (
    <AdminFilterPanel
      kicker="Hizli Aralik"
      title="Rapor davranisini hizlandir"
      description="Tarih araligi, karsilastirma ve siralama filtrelerini tek standart panelde toplar."
      className="admin-reference-filters"
      actions={
        <>
          <AdminButton variant="outline" onClick={() => handleQuickPreset("today")}>
            Bugun
          </AdminButton>
          <AdminButton variant="outline" onClick={() => handleQuickPreset("last7")}>
            Son 7 Gun
          </AdminButton>
          <AdminButton variant="outline" onClick={() => handleQuickPreset("last30")}>
            Son 30 Gun
          </AdminButton>
          <AdminButton variant="outline" onClick={() => handleQuickPreset("thisMonth")}>
            Bu Ay
          </AdminButton>
          <AdminButton variant="outline" onClick={() => handleQuickPreset("thisYear")}>
            Bu Yil
          </AdminButton>
        </>
      }
    >
      <div className="admin-form-grid">
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

        <AdminField label="Baslangic">
          <AdminInput type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
        </AdminField>

        <AdminField label="Bitis">
          <AdminInput type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
        </AdminField>

        <AdminField label="Karsi Baslangic">
          <AdminInput type="date" value={compareFrom} onChange={(event) => setCompareFrom(event.target.value)} />
        </AdminField>

        <AdminField label="Karsi Bitis">
          <AdminInput type="date" value={compareTo} onChange={(event) => setCompareTo(event.target.value)} />
        </AdminField>

        <AdminField label="Grup">
          <AdminSelect value={groupBy} onChange={(event) => setGroupBy(event.target.value)}>
            <option value="day">Gun</option>
            <option value="week">Hafta</option>
            <option value="month">Ay</option>
            <option value="year">Yil</option>
          </AdminSelect>
        </AdminField>

        <AdminField label="Ara">
          <AdminInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Sube, urun, personel..." />
        </AdminField>

        <AdminField label="Siralama">
          <AdminInput value={sortBy} onChange={(event) => setSortBy(event.target.value)} placeholder="revenue / quantity / margin / variance" />
        </AdminField>

        <AdminField label="Yon">
          <AdminSelect value={sortDirection} onChange={(event) => setSortDirection(event.target.value)}>
            <option value="desc">Azalan</option>
            <option value="asc">Artan</option>
          </AdminSelect>
        </AdminField>

        <AdminField label="Preset">
          <AdminInput value={preset} readOnly placeholder="Bugun / Son 7 Gun / Son 30 Gun / Bu Ay" />
        </AdminField>
      </div>

      <div className="admin-filter-actions">
        <AdminButton variant="outline" onClick={handleAutoCompare}>
          Karsi Donemi Otomatik Doldur
        </AdminButton>
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
