"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "../../lib/api/client";

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
      <div className="admin-section-head">
        <div>
          <p className="admin-kicker">Auth</p>
          <h3>Yonetici Girisi</h3>
        </div>
        <span className="admin-status-pill admin-status-pill--info">Aldal Pos</span>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16, marginTop: 20 }}>
        <label className="admin-field">
          <span>E-posta</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="owner@aldal.local"
            required
          />
        </label>

        <label className="admin-field">
          <span>Sifre</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Sifreni gir"
            required
          />
        </label>

        <button className="admin-primary-button" type="submit" disabled={loading}>
          {loading ? "Giris yapiliyor..." : "Giris Yap"}
        </button>

        {result ? <div className="admin-status-pill admin-status-pill--success">{result}</div> : null}
        {error ? <div className="admin-status-pill admin-status-pill--danger">{error}</div> : null}
      </form>
    </div>
  );
}
