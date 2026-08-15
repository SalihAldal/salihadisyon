export const POS_STORAGE_KEY = "pos-web-session";

export const CASH_DENOMINATIONS = [1, 5, 10, 20, 50, 100, 200];

export const NOTE_KEYBOARD_ROWS = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["Z", "X", "C", "V", "B", "N", "M", ",", "."],
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
];

export const NOTE_KEYBOARD_ACTIONS = ["-", " ", "Sil", "Temizle"];

export const FALLBACK_PAYMENT_METHODS = [
  { id: "fallback-cash", name: "Nakit", paymentMethod: "CASH" },
  { id: "fallback-card", name: "Kredi Karti POS", paymentMethod: "CREDIT_CARD" },
];

export const MAX_VISIBLE_PRODUCTS = 120;
