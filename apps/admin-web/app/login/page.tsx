"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "../../lib/api/client";
import { AdminButton, AdminField, AdminInput, AdminStateCard } from "../../components/ui/admin-ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await apiClient.login(email, password);
      window.localStorage.setItem("adisyon.accessToken", response.accessToken);
      window.localStorage.setItem("adisyon.refreshToken", response.refreshToken);
      window.localStorage.setItem("adisyon.user", JSON.stringify(response.user));
      setResult(`Giris basarili: ${response.user.fullName} / ${response.user.role}`);
      router.replace("/");
      router.refresh();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Beklenmeyen hata.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="admin-login-card">
      <div className="admin-login-head">
        <div className="admin-login-brand">
          <div className="admin-brand__mark" aria-hidden="true">
            AL
          </div>
          <div>
            <p className="admin-kicker">ALDAL POS</p>
            <h3>Yönetici Girişi</h3>
            <p className="admin-subtle-text">Paneli yönetmek için hesabınla giriş yap.</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} action="#" method="post" className="admin-login-form">
        <AdminField label="E-posta">
          <AdminInput
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="ornek@isletme.com"
            required
          />
        </AdminField>

        <AdminField label="Sifre">
          <AdminInput
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Sifreni gir"
            required
          />
        </AdminField>

        <div className="admin-login-actions">
          <AdminButton variant="primary" type="submit" disabled={loading} loading={loading}>
            {loading ? "Giris yapiliyor..." : "Giris Yap"}
          </AdminButton>
        </div>

        {result ? <AdminStateCard tone="success" message={result} /> : null}
        {error ? <AdminStateCard tone="danger" message={error} /> : null}
      </form>
    </div>
  );
}
