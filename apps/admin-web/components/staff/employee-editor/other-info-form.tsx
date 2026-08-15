"use client";

import { useMemo } from "react";
import { formatTryCurrencySafe } from "../../../lib/utils/admin-format";
import { AdminFilterPanel } from "../../ui/admin-ui";
import { EmployeeSelectField, EmployeeTextField, EmployeeTextareaField } from "./employee-editor-fields";
import { ACCOUNT_TYPE_OPTIONS, getCityOptions, getCountryOptions, getDistrictOptions } from "./location-options";
import type { EmployeeOtherInfoFormData } from "./types";

export function OtherInfoForm({
  value,
  onChange,
  onSubmit,
  saving,
}: {
  value: EmployeeOtherInfoFormData;
  onChange: (next: EmployeeOtherInfoFormData) => void;
  onSubmit: () => void;
  saving?: boolean;
}) {
  const countryOptions = useMemo(() => getCountryOptions(), []);
  const cityOptions = useMemo(() => getCityOptions(value.country), [value.country]);
  const districtOptions = useMemo(() => getDistrictOptions(value.country, value.city), [value.country, value.city]);
  const salaryPreview = value.salary.trim() ? formatTryCurrencySafe(value.salary, { maximumFractionDigits: 2 }) : "-";

  return (
    <AdminFilterPanel
      title="Diger Bilgiler"
      description="Adres, finans ve acil durum alanlarini tek blokta yonet."
      actions={
        <button type="button" className="admin-primary-button" onClick={onSubmit} disabled={saving}>
          {saving ? "Kaydediliyor..." : "Kaydet"}
        </button>
      }
    >
      <div className="admin-form-grid">
        <EmployeeTextareaField label="Adres" value={value.address} onChange={(address) => onChange({ ...value, address })} fullWidth />
        <EmployeeSelectField
          label="Ulke"
          value={value.country}
          options={countryOptions}
          onChange={(country) => onChange({ ...value, country, city: "", district: "" })}
        />
        <EmployeeSelectField
          label="Sehir"
          value={value.city}
          options={cityOptions}
          onChange={(city) => onChange({ ...value, city, district: "" })}
          disabled={!value.country}
          helper={!value.country ? "Once ulke sec." : undefined}
        />
        <EmployeeSelectField
          label="Ilce"
          value={value.district}
          options={districtOptions}
          onChange={(district) => onChange({ ...value, district })}
          disabled={!value.country || !value.city}
          helper={!value.city ? "Once sehir sec." : undefined}
        />
        <EmployeeTextField label="Posta Kodu" value={value.postalCode} onChange={(postalCode) => onChange({ ...value, postalCode })} />
        <EmployeeTextField label="Ev Telefonu" value={value.homePhone} onChange={(homePhone) => onChange({ ...value, homePhone })} />
        <EmployeeTextField
          label="Maas"
          type="number"
          value={value.salary}
          onChange={(salary) => onChange({ ...value, salary })}
          helper={`Para formati onizleme: ${salaryPreview}`}
        />
        <EmployeeTextField
          label="Maas Odeme Gunu"
          type="number"
          value={value.salaryPaymentDay}
          onChange={(salaryPaymentDay) => onChange({ ...value, salaryPaymentDay })}
          helper="1 ile 31 arasinda olmalidir."
        />
        <EmployeeTextField label="Banka Adi" value={value.bankName} onChange={(bankName) => onChange({ ...value, bankName })} />
        <EmployeeSelectField
          label="Hesap Turu"
          value={value.accountType}
          options={ACCOUNT_TYPE_OPTIONS}
          onChange={(accountType) => onChange({ ...value, accountType })}
          helper="Banka bilgisi girilecekse hesap turu da secilmelidir."
        />
        <EmployeeTextField
          label="Hesap Numarasi"
          value={value.accountNumber}
          onChange={(accountNumber) => onChange({ ...value, accountNumber })}
          helper={
            value.accountNumberMasked
              ? `Bos birakirsan mevcut maskeli deger korunur: ${value.accountNumberMasked}`
              : "Banka bilgisi girilecekse bos birakma."
          }
        />
        <EmployeeTextField
          label="IBAN Numarasi"
          value={value.iban}
          onChange={(iban) => onChange({ ...value, iban: iban.toUpperCase() })}
          helper={value.ibanMasked ? `Bos birakirsan mevcut maskeli deger korunur: ${value.ibanMasked}` : "TR ile baslayan gecerli IBAN gir."}
        />
        <EmployeeTextField label="Acil Durumda Aranacak Kisi" value={value.contactName} onChange={(contactName) => onChange({ ...value, contactName })} />
        <EmployeeTextField label="Acil Durum Telefonu" value={value.contactPhone} onChange={(contactPhone) => onChange({ ...value, contactPhone })} />
        <EmployeeTextField label="Yakinlik Derecesi" value={value.relation} onChange={(relation) => onChange({ ...value, relation })} />
      </div>
    </AdminFilterPanel>
  );
}
