export const themeTokens = {
  colors: {
    sidebar: "#101828",
    sidebarSecondary: "#182230",
    sidebarBorder: "rgba(255, 255, 255, 0.08)",
    background: "#f3f4f6",
    backgroundElevated: "#e9eef8",
    card: "#ffffff",
    cardMuted: "#f8fafc",
    border: "#e2e8f0",
    textPrimary: "#0f172a",
    textSecondary: "#475569",
    textMuted: "#94a3b8",
    accent: "#5b6cff",
    accentStrong: "#4f46e5",
    accentMuted: "#eef2ff",
    success: "#16a34a",
    warning: "#d97706",
    danger: "#dc2626",
    info: "#0ea5e9",
  },
  radii: {
    xl: "1.5rem",
    lg: "1rem",
    md: "0.875rem",
    sm: "0.75rem",
  },
  shadows: {
    card: "0 10px 30px rgba(15, 23, 42, 0.08)",
    elevated: "0 18px 44px rgba(15, 23, 42, 0.12)",
    focus: "0 0 0 4px rgba(91, 108, 255, 0.16)",
  },
  spacing: {
    section: "2rem",
    panel: "1.5rem",
    control: "0.875rem",
  },
  typography: {
    display: "700 2rem/1.1 Inter, Arial, sans-serif",
    heading: "600 1.125rem/1.4 Inter, Arial, sans-serif",
    body: "500 0.9375rem/1.6 Inter, Arial, sans-serif",
    caption: "500 0.75rem/1.4 Inter, Arial, sans-serif",
  },
};

export function panelCardClassName() {
  return "rounded-2xl bg-white shadow-sm ring-1 ring-slate-200";
}

export const dataTableStandards = {
  density: "comfortable",
  rowHeight: 52,
  headerHeight: 44,
  stickyHeader: true,
  pinnedColumns: ["selection", "primaryLabel", "actions"],
  toolbarOrder: ["search", "filters", "date", "branch", "export", "columns"],
};

export const formStandards = {
  labelPlacement: "top",
  fieldGap: 16,
  sectionGap: 24,
  helpTextColor: "textMuted",
  validationTone: "inline-and-summary",
};

export const surfacePatterns = {
  pageShell: "soft-gray background + white cards + subtle shadow",
  headerBar: "title + breadcrumb + action cluster",
  filterBar: "sticky secondary row with chips, dropdowns and search",
  rightDrawer: "detail-first workflow for dense operations",
};
