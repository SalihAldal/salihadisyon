"use client";

import type { ChangeEvent, ReactNode } from "react";
import type { EmployeeSelectOption } from "./types";

function FieldShell({
  label,
  helper,
  fullWidth = false,
  children,
}: {
  label: string;
  helper?: ReactNode;
  fullWidth?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={`admin-field ${fullWidth ? "admin-field--full" : ""}`}>
      <span>{label}</span>
      {children}
      {helper ? <small className="admin-field__helper">{helper}</small> : null}
    </label>
  );
}

export function EmployeeTextField({
  label,
  value,
  onChange,
  placeholder,
  helper,
  type = "text",
  fullWidth = false,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  helper?: ReactNode;
  type?: "text" | "email" | "password" | "number" | "date";
  fullWidth?: boolean;
  disabled?: boolean;
}) {
  return (
    <FieldShell label={label} helper={helper} fullWidth={fullWidth}>
      <input type={type} value={value} placeholder={placeholder} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
    </FieldShell>
  );
}

export function EmployeeTextareaField({
  label,
  value,
  onChange,
  placeholder,
  helper,
  fullWidth = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  helper?: ReactNode;
  fullWidth?: boolean;
}) {
  return (
    <FieldShell label={label} helper={helper} fullWidth={fullWidth}>
      <textarea value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </FieldShell>
  );
}

export function EmployeeSelectField({
  label,
  value,
  onChange,
  options,
  placeholder = "Seciniz",
  helper,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: EmployeeSelectOption[];
  placeholder?: string;
  helper?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <FieldShell label={label} helper={helper}>
      <select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function EmployeeToggleField({
  label,
  checked,
  onChange,
  helper,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  helper?: ReactNode;
}) {
  return (
    <FieldShell label={label} helper={helper}>
      <select value={checked ? "true" : "false"} onChange={(event) => onChange(event.target.value === "true")}>
        <option value="true">Aktif</option>
        <option value="false">Pasif</option>
      </select>
    </FieldShell>
  );
}

export function EmployeeFilePreview({
  url,
  fallback,
}: {
  url: string;
  fallback: string;
}) {
  if (!url) return null;
  return (
    <div className="admin-employee-editor__photo-preview">
      <img src={url} alt={fallback} />
    </div>
  );
}

export function numberInputValue(event: ChangeEvent<HTMLInputElement>) {
  return event.target.value.replace(/[^\d]/g, "");
}
