import "./styles.css";
import type { ReactNode } from "react";
import { AdminShell } from "../components/admin-shell";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr">
      <body className="admin-body">
        <AdminShell>{children}</AdminShell>
      </body>
    </html>
  );
}
