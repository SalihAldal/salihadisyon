"use client";

import type { ComponentType, SVGProps } from "react";
import {
  Activity,
  BadgePercent,
  BarChart3,
  Building2,
  ChevronDown,
  ChevronRight,
  CreditCard,
  Bell,
  CircleHelp,
  X,
  LogOut,
  LayoutDashboard,
  LifeBuoy,
  Menu,
  MonitorUp,
  Package,
  Plug,
  QrCode,
  ReceiptText,
  Search,
  ShieldCheck,
  Star,
  Users,
  Wallet,
  Settings2,
} from "lucide-react";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

const ICONS: Record<string, IconComponent> = {
  activity: Activity,
  "badge-percent": BadgePercent,
  "bar-chart-3": BarChart3,
  "building-2": Building2,
  "credit-card": CreditCard,
  "layout-dashboard": LayoutDashboard,
  "life-buoy": LifeBuoy,
  "monitor-up": MonitorUp,
  package: Package,
  plug: Plug,
  "qr-code": QrCode,
  "receipt-text": ReceiptText,
  search: Search,
  "shield-check": ShieldCheck,
  star: Star,
  users: Users,
  wallet: Wallet,
  "settings-2": Settings2,
};

export function AdminIcon({
  name,
  className,
  size = 18,
  "aria-hidden": ariaHidden = true,
}: {
  name?: string | null;
  className?: string;
  size?: number;
  "aria-hidden"?: boolean;
}) {
  const key = String(name ?? "")
    .trim()
    .toLowerCase();
  const Icon = ICONS[key];
  if (!Icon) return null;
  return <Icon aria-hidden={ariaHidden} className={className} width={size} height={size} />;
}

export const AdminChevronDown = ChevronDown;
export const AdminChevronRight = ChevronRight;
export const AdminSearchIcon = Search;
export const AdminMenuIcon = Menu;
export const AdminBellIcon = Bell;
export const AdminHelpIcon = CircleHelp;
export const AdminLogOutIcon = LogOut;
export const AdminCloseIcon = X;

