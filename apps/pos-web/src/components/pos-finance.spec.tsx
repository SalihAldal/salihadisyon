import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CashCountGrid, NumericKeypad, PaymentBreakdownCard } from "./pos-finance";

describe("NumericKeypad", () => {
  it("keypad input akisini dogru sekilde yonetir", () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();

    render(
      <NumericKeypad
        value="12"
        onChange={onChange}
        onSubmit={onSubmit}
        submitLabel="Kaydet"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "3" }));
    fireEvent.click(screen.getByRole("button", { name: "," }));
    fireEvent.click(screen.getByRole("button", { name: "Sil" }));
    fireEvent.click(screen.getByRole("button", { name: "Temizle" }));
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));

    expect(onChange).toHaveBeenNthCalledWith(1, "123");
    expect(onChange).toHaveBeenNthCalledWith(2, "12.");
    expect(onChange).toHaveBeenNthCalledWith(3, "1");
    expect(onChange).toHaveBeenNthCalledWith(4, "");
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

describe("PaymentBreakdownCard", () => {
  it("odeme kirilimini ve taslak tutari gosterir", () => {
    render(
      <PaymentBreakdownCard
        title="Odeme Ozeti"
        total={180}
        rows={[
          { key: "cash", label: "Nakit", amount: 100, draftAmount: 20 },
          { key: "card", label: "Kart", amount: 80 },
        ]}
      />,
    );

    expect(screen.getByText("Odeme Ozeti")).toBeInTheDocument();
    expect(screen.getByText("Nakit")).toBeInTheDocument();
    expect(screen.getByText(/Taslak \+/)).toBeInTheDocument();
    expect(screen.getByText("Kart")).toBeInTheDocument();
  });
});

describe("CashCountGrid", () => {
  it("kasa kapanisi ekraninda adet degisimlerini bildirir", () => {
    const onChange = vi.fn();

    render(
      <CashCountGrid
        quantities={{ "200": 1 }}
        onChange={onChange}
        denominations={[200]}
        total={200}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "+" }));
    fireEvent.click(screen.getByRole("button", { name: "-" }));
    fireEvent.change(screen.getByDisplayValue("1"), { target: { value: "3" } });

    expect(onChange).toHaveBeenNthCalledWith(1, 200, 2);
    expect(onChange).toHaveBeenNthCalledWith(2, 200, 0);
    expect(onChange).toHaveBeenNthCalledWith(3, 200, 3);
  });
});
