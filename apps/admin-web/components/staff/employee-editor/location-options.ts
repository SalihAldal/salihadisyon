import type { EmployeeSelectOption } from "./types";

type LocationTree = Record<string, Record<string, string[]>>;

export const COUNTRY_CITY_DISTRICT_TREE: LocationTree = {
  Turkiye: {
    Istanbul: ["Kadikoy", "Besiktas", "Sisli", "Uskudar"],
    Ankara: ["Cankaya", "Kecioren", "Yenimahalle", "Etimesgut"],
    Izmir: ["Konak", "Bornova", "Karsiyaka", "Buca"],
    Bursa: ["Nilufer", "Osmangazi", "Yildirim", "Mudanya"],
  },
  "Kuzey Kibris Turk Cumhuriyeti": {
    Lefkosa: ["Merkez", "Gonyeli", "Hamitkoy"],
    Girne: ["Merkez", "Alsancak", "Lapta"],
  },
  Almanya: {
    Berlin: ["Mitte", "Charlottenburg", "Kreuzberg"],
    Munih: ["Altstadt", "Schwabing", "Bogenhausen"],
  },
};

export const ACCOUNT_TYPE_OPTIONS: EmployeeSelectOption[] = [
  { label: "Vadesiz Hesap", value: "vadesiz" },
  { label: "Vadeli Hesap", value: "vadeli" },
  { label: "Maas Hesabi", value: "maas" },
  { label: "Diger", value: "other" },
];

export function getCountryOptions(): EmployeeSelectOption[] {
  return Object.keys(COUNTRY_CITY_DISTRICT_TREE).map((country) => ({
    label: country,
    value: country,
  }));
}

export function getCityOptions(country: string): EmployeeSelectOption[] {
  const cities = COUNTRY_CITY_DISTRICT_TREE[country] ?? {};
  return Object.keys(cities).map((city) => ({
    label: city,
    value: city,
  }));
}

export function getDistrictOptions(country: string, city: string): EmployeeSelectOption[] {
  const districts = COUNTRY_CITY_DISTRICT_TREE[country]?.[city] ?? [];
  return districts.map((district) => ({
    label: district,
    value: district,
  }));
}
