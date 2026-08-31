"use client";

import { AdminButton, AdminFilterPanel } from "../../ui/admin-ui";
import { EmployeeSelectField, EmployeeTextField, EmployeeToggleField } from "./employee-editor-fields";
import type { EmployeeAccountSettingsFormData, EmployeeEditorMeta } from "./types";

export function AccountSettingsForm({
  value,
  meta,
  currentPinMasked,
  onChange,
  onSubmit,
  saving,
}: {
  value: EmployeeAccountSettingsFormData;
  meta: EmployeeEditorMeta;
  currentPinMasked?: string;
  onChange: (next: EmployeeAccountSettingsFormData) => void;
  onSubmit: () => void;
  saving?: boolean;
}) {
  return (
    <AdminFilterPanel
      title="Hesap Ayarlari"
      description="Hesap, rol ve operasyonel personel ayarlarini bu alandan yonet."
      actions={
        <AdminButton variant="primary" onClick={onSubmit} disabled={saving} loading={saving}>
          {saving ? "Kaydediliyor..." : "Kaydet"}
        </AdminButton>
      }
    >
      <div className="admin-form-grid">
        <EmployeeTextField label="Personel Adi" value={value.firstName} onChange={(firstName) => onChange({ ...value, firstName })} />
        <EmployeeTextField label="Personel Soyadi" value={value.lastName} onChange={(lastName) => onChange({ ...value, lastName })} />
        <EmployeeTextField label="E-posta" type="email" value={value.email} onChange={(email) => onChange({ ...value, email })} />
        <EmployeeTextField
          label="Parola"
          type="password"
          value={value.password}
          onChange={(password) => onChange({ ...value, password })}
          helper="Bos birakirsan mevcut parola degismez. Minimum 8 karakter olmali."
        />
        <EmployeeTextField
          label="Restoran Rolu"
          value={value.restaurantRole}
          onChange={(restaurantRole) => onChange({ ...value, restaurantRole })}
          helper="Operasyondaki gorev tanimini ifade eder. Yetki rolu degildir."
        />
        <EmployeeSelectField
          label="Personel Rolu"
          value={value.staffRoleId}
          options={meta.staffRoleOptions}
          onChange={(staffRoleId) => onChange({ ...value, staffRoleId })}
          helper="Yetki ve izin setini belirler. Restoran rolu ile ayni alan degildir."
        />
        <EmployeeTextField
          label="Satis Ekrani Pin Kodu"
          value={value.pinCode}
          onChange={(pinCode) => onChange({ ...value, pinCode })}
          helper={currentPinMasked ? `Bos birakirsan mevcut pin korunur: ${currentPinMasked}. Sadece 4 haneli sayi gir.` : "Sadece 4 haneli sayi gir."}
        />
        <EmployeeTextField label="Ise Giris Tarihi" type="date" value={value.hireDate} onChange={(hireDate) => onChange({ ...value, hireDate })} />
        <EmployeeTextField
          label="Gunluk Ucretsiz Icecek"
          type="number"
          value={value.dailyFreeDrinkLimit}
          onChange={(dailyFreeDrinkLimit) => onChange({ ...value, dailyFreeDrinkLimit })}
        />
        <EmployeeTextField
          label="Toplam Mola Suresi"
          type="number"
          value={value.totalBreakMinutes}
          onChange={(totalBreakMinutes) => onChange({ ...value, totalBreakMinutes })}
          helper={value.overtimeEnabled ? "Dakika cinsinden ilerler." : "Mesai aktif kapali oldugu icin bu alan pasif ve 0 olarak korunur."}
          disabled={!value.overtimeEnabled}
        />
        <EmployeeToggleField
          label="Mesai Aktif"
          checked={value.overtimeEnabled}
          onChange={(overtimeEnabled) =>
            onChange({
              ...value,
              overtimeEnabled,
              totalBreakMinutes: overtimeEnabled ? value.totalBreakMinutes || "0" : "0",
            })
          }
          helper="Kapaliysa mola suresi 0 olarak sabitlenir."
        />
      </div>
    </AdminFilterPanel>
  );
}
