"use client";

import type { ChangeEvent } from "react";
import { AdminFilterPanel } from "../../ui/admin-ui";
import { EmployeeFilePreview, EmployeeTextField } from "./employee-editor-fields";
import type { EmployeePersonalInfoFormData } from "./types";

export function PersonalInfoForm({
  employeeName,
  value,
  error,
  onChange,
  onPhotoSelect,
  onPhotoRemove,
  onSubmit,
  saving,
}: {
  employeeName: string;
  value: EmployeePersonalInfoFormData;
  error?: string | null;
  onChange: (next: EmployeePersonalInfoFormData) => void;
  onPhotoSelect: (event: ChangeEvent<HTMLInputElement>) => void;
  onPhotoRemove: () => void;
  onSubmit: () => void;
  saving?: boolean;
}) {
  return (
    <AdminFilterPanel
      title="Kisisel Bilgiler"
      description="Kimlik, egitim ve iletisim odakli kisisel alanlari duzenle."
      actions={
        <button type="button" className="admin-primary-button" onClick={onSubmit} disabled={saving}>
          {saving ? "Kaydediliyor..." : "Kaydet"}
        </button>
      }
    >
      <EmployeeFilePreview url={value.photo} fallback={employeeName} />

      <div className="admin-form-grid">
        <div className="admin-field admin-field--full">
          <span>Profil Fotografi</span>
          <div className="admin-employee-editor__upload-row">
            <label className="admin-outline-button admin-employee-editor__upload-button">
              Fotograf Yukle
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onPhotoSelect} hidden />
            </label>
            <button type="button" className="admin-outline-button" onClick={onPhotoRemove} disabled={!value.photo}>
              Fotograf Sil
            </button>
            {value.photoFileName ? <span className="admin-employee-editor__upload-meta">{value.photoFileName}</span> : null}
          </div>
          <small className="admin-field__helper">Sadece PNG, JPG, JPEG veya WEBP. Maksimum 2 MB.</small>
          {error ? <small className="admin-field__helper admin-employee-editor__field-error">{error}</small> : null}
        </div>
        <EmployeeTextField label="Uyruk" value={value.nationality} onChange={(nationality) => onChange({ ...value, nationality })} />
        <EmployeeTextField
          label="Kimlik Numarasi"
          value={value.identityNumber}
          onChange={(identityNumber) => onChange({ ...value, identityNumber })}
          helper={value.identityNumberMasked ? `Bos birakirsan mevcut maskeli deger korunur: ${value.identityNumberMasked}` : "Hassas veri olarak saklanir."}
        />
        <EmployeeTextField label="Cinsiyet" value={value.gender} onChange={(gender) => onChange({ ...value, gender })} />
        <EmployeeTextField label="Kan Grubu" value={value.bloodType} onChange={(bloodType) => onChange({ ...value, bloodType })} />
        <EmployeeTextField label="Engel Durumu" value={value.disabilityStatus} onChange={(disabilityStatus) => onChange({ ...value, disabilityStatus })} />
        <EmployeeTextField label="Egitim Durumu" value={value.educationStatus} onChange={(educationStatus) => onChange({ ...value, educationStatus })} />
        <EmployeeTextField
          label="En Yuksek Egitim"
          value={value.highestEducationLevel}
          onChange={(highestEducationLevel) => onChange({ ...value, highestEducationLevel })}
        />
        <EmployeeTextField
          label="Son Tamamlanan Kurum"
          value={value.lastEducationSchool}
          onChange={(lastEducationSchool) => onChange({ ...value, lastEducationSchool })}
        />
        <EmployeeTextField label="Medeni Durum" value={value.maritalStatus} onChange={(maritalStatus) => onChange({ ...value, maritalStatus })} />
        <EmployeeTextField
          label="Cocuk Sayisi"
          type="number"
          value={value.childrenCount}
          onChange={(childrenCount) => onChange({ ...value, childrenCount })}
          helper="Negatif deger kabul edilmez."
        />
        <EmployeeTextField label="Dogum Tarihi" type="date" value={value.birthDate} onChange={(birthDate) => onChange({ ...value, birthDate })} />
        <EmployeeTextField
          label="Telefon"
          value={value.phone}
          onChange={(phone) => onChange({ ...value, phone })}
          helper="Ornek: 05xx xxx xx xx veya +90 ile baslayan format."
        />
      </div>
    </AdminFilterPanel>
  );
}
