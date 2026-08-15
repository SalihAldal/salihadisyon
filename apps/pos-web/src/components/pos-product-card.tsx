"use client";

import { memo } from "react";
import { formatCurrency } from "../pos-helpers";

type PosProductCardProps = {
  product: Record<string, any>;
  onSelect: () => void;
};

export const PosProductCard = memo(function PosProductCard({ product, onSelect }: PosProductCardProps) {
  return (
    <button className="product-card" type="button" onClick={onSelect}>
      <div className="product-card__name">{String(product.name ?? "-")}</div>
      <div className="product-card__footer">
        <strong>{formatCurrency(Number(product.price ?? 0))}</strong>
        <span className="product-card__add">+</span>
      </div>
    </button>
  );
});
