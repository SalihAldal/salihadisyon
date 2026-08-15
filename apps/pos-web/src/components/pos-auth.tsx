"use client";

import { useState } from "react";

type PosLoginScreenProps = {
  onSubmit: (pinCode: string) => Promise<void>;
  loading: boolean;
  error: string | null;
};

export function PosLoginScreen({ onSubmit, loading, error }: PosLoginScreenProps) {
  const [pinCode, setPinCode] = useState("");

  function handleDigit(value: string) {
    if (pinCode.length >= 4) return;
    setPinCode((current) => `${current}${value}`.replace(/[^\d]/g, "").slice(0, 4));
  }

  function handleDelete() {
    setPinCode((current) => current.slice(0, -1));
  }

  return (
    <div className="pos-login-shell">
      <div className="pos-login-kiosk">
        <header className="pos-login-kiosk__topbar">
          <strong>Kardo</strong>
          <span>Tr Turkce</span>
        </header>
        <div className="pos-login-kiosk__content">
          <section className="pos-pin-panel">
            <label className="pos-login-field">
              <span>Pin kodunuzu giriniz</span>
              <input value={"*".repeat(pinCode.length)} readOnly placeholder="****" />
            </label>
            <div className="pos-pin-grid">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
                <button key={digit} type="button" onClick={() => handleDigit(digit)} disabled={loading}>
                  {digit}
                </button>
              ))}
              <button type="button" onClick={() => handleDigit("0")} disabled={loading}>
                0
              </button>
              <button type="button" className="danger" onClick={handleDelete} disabled={loading}>
                Sil
              </button>
            </div>
            {error ? <div className="status status--danger">{error}</div> : null}
            <button className="pos-login-button" type="button" onClick={() => void onSubmit(pinCode)} disabled={loading || pinCode.length !== 4}>
              {loading ? "Giris yapiliyor..." : "Oturum Ac"}
            </button>
          </section>
          <aside className="pos-login-qr">
            <div className="pos-login-qr__mock" />
            <div className="pos-login-qr__line" />
            <p>0850 885 2048</p>
          </aside>
        </div>
      </div>
    </div>
  );
}
