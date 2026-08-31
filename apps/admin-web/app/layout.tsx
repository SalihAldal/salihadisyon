import "./styles.css";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import { AdminShell } from "../components/admin-shell";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const runtimeConfigScript = `
window.__ADISYON_API_BASE__=window.location.origin+"/adisyon/admin/backend/v1";
window.__ADISYON_SOCKET_URL__="/adisyon/ws/pos";
window.__POS_SOCKET_URL__=window.location.origin+"/adisyon/ws/pos";
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr" className={inter.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: runtimeConfigScript }} />
      </head>
      <body className="admin-body">
        <AdminShell>{children}</AdminShell>
      </body>
    </html>
  );
}
