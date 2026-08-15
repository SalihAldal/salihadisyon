import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PaymentDrawer } from "./kardo-pos-layout";
import { CashCountGrid, NumericKeypad } from "./pos-finance";

describe("PaymentDrawer integrations", () => {
  it("odeme ekrani drawer icinde keypad ve split aksiyonlarini gosterir", () => {
    const onClose = vi.fn();
    const onAmountChange = vi.fn();
    const onAddSplit = vi.fn();

    render(
      <PaymentDrawer open title="Kismi ve coklu odeme" eyebrow="Odeme Onayi" compact onClose={onClose}>
        <div className="payment-entry">
          <input aria-label="Tutar" value="45.00" readOnly />
          <button type="button" onClick={onAddSplit}>
            Ekle
          </button>
        </div>
        <NumericKeypad
          value="45.00"
          onChange={onAmountChange}
          onSubmit={onAddSplit}
          submitLabel="Parcayi Ekle"
        />
      </PaymentDrawer>,
    );

    fireEvent.click(screen.getByRole("button", { name: "3" }));
    fireEvent.click(screen.getByRole("button", { name: "Parcayi Ekle" }));
    fireEvent.click(screen.getByRole("button", { name: "Kapat" }));

    expect(screen.getByText("Kismi ve coklu odeme")).toBeInTheDocument();
    expect(onAmountChange).toHaveBeenCalledWith("45.003");
    expect(onAddSplit).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("gider modalinda keypad submit aksiyonunu tetikler", () => {
    const onClose = vi.fn();
    const onAmountChange = vi.fn();
    const onSaveExpense = vi.fn();

    render(
      <PaymentDrawer open title="Gider Ekle" eyebrow="Hizli Gider" compact onClose={onClose}>
        <label>
          <span>Aciklama</span>
          <input aria-label="Aciklama" defaultValue="Market" />
        </label>
        <NumericKeypad
          value="125"
          onChange={onAmountChange}
          onSubmit={onSaveExpense}
          submitLabel="Gideri Kaydet"
        />
      </PaymentDrawer>,
    );

    fireEvent.click(screen.getByRole("button", { name: "00" }));
    fireEvent.click(screen.getByRole("button", { name: "Gideri Kaydet" }));

    expect(screen.getByText("Gider Ekle")).toBeInTheDocument();
    expect(onAmountChange).toHaveBeenCalledWith("12500");
    expect(onSaveExpense).toHaveBeenCalledTimes(1);
  });

  it("kasa kapanisi ekraninda sayim gridini drawer icinde render eder", () => {
    const onClose = vi.fn();
    const onDenominationChange = vi.fn();

    render(
      <PaymentDrawer open title="Kasa Kapanisi" eyebrow="Kasa Islemleri" onClose={onClose}>
        <CashCountGrid
          quantities={{ "100": 2, "50": 1 }}
          onChange={onDenominationChange}
          denominations={[100, 50]}
          total={250}
        />
      </PaymentDrawer>,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "+" })[0]);

    expect(screen.getByText("Kasa Kapanisi")).toBeInTheDocument();
    expect(screen.getByText("Nakit Sayim Grid")).toBeInTheDocument();
    expect(onDenominationChange).toHaveBeenCalledWith(100, 3);
  });
});
