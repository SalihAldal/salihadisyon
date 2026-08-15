export const staffResources = [
  "team",
  "payroll",
  "staff-discounts",
  "goals",
  "notifications",
  "shifts",
  "breaks",
  "tracking",
  "roles",
  "tasks",
  "audit-questions",
  "audit-survey",
] as const;

export type StaffResource = (typeof staffResources)[number];
