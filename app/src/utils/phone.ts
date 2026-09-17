import { Linking, Platform } from "react-native";
import * as Localization from "expo-localization";

// Turning what an owner typed into a dialable number and a wa.me link.
// People write phone numbers the way they say them - "07700 900123",
// "054-123 4567", "+44 7700 900123" - so the stored value is kept exactly
// as typed (it's their record, not ours) and normalised only at the moment
// it's used.

/** Dialling codes for the launch markets plus the common ones around them. */
const DIALLING_CODES: Record<string, string> = {
  GB: "44",
  IL: "972",
  US: "1",
  CA: "1",
  IE: "353",
  AU: "61",
  NZ: "64",
  ZA: "27",
  FR: "33",
  DE: "49",
  ES: "34",
  IT: "39",
  NL: "31",
  BE: "32",
  PT: "351",
  PL: "48",
  RU: "7",
  UA: "380",
  IN: "91",
  BR: "55",
};

function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, "");
}

/** The device's country, used only to expand a local number for WhatsApp. */
export function deviceRegionCode(): string | null {
  try {
    return Localization.getLocales()[0]?.regionCode ?? null;
  } catch {
    return null;
  }
}

/**
 * Best-effort international form for a wa.me link. WhatsApp needs a country
 * code, and a number saved as "07700 900123" doesn't carry one, so the
 * device's own country fills that gap - the same assumption the owner makes
 * when they write a local number down. Returns null when there's nothing
 * usable to dial.
 */
export function toWhatsAppNumber(raw: string, regionCode = deviceRegionCode()): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("+")) {
    const digits = digitsOnly(trimmed);
    return digits.length >= 7 ? digits : null;
  }

  const digits = digitsOnly(trimmed);
  if (digits.length < 6) return null;

  // 00 is the other way people write an international prefix.
  if (digits.startsWith("00")) {
    const rest = digits.slice(2);
    return rest.length >= 7 ? rest : null;
  }

  const code = regionCode ? DIALLING_CODES[regionCode.toUpperCase()] : undefined;
  if (!code) {
    // We don't know the country, so we hand WhatsApp what we have rather
    // than guessing wrong.
    return digits;
  }

  // A leading 0 is the trunk prefix most countries write locally; it's
  // dropped when the country code goes on.
  if (digits.startsWith("0")) {
    return `${code}${digits.slice(1)}`;
  }
  // No trunk prefix (North America writes "212 555 0147", not "0212..."),
  // so decide by length whether the country code is already on the front:
  // a national number is at most ~10 digits, an international one longer.
  if (digits.startsWith(code) && digits.length >= code.length + 9) {
    return digits;
  }
  return `${code}${digits}`;
}

/** What `tel:` should dial - the number as written, minus the prettifying. */
export function toDialNumber(raw: string): string | null {
  const cleaned = raw.trim().replace(/[^\d+]/g, "");
  return cleaned.replace(/\D/g, "").length >= 3 ? cleaned : null;
}

export async function callNumber(raw: string): Promise<boolean> {
  const number = toDialNumber(raw);
  if (!number) return false;
  try {
    await Linking.openURL(`tel:${number}`);
    return true;
  } catch {
    return false;
  }
}

export async function openWhatsApp(raw: string): Promise<boolean> {
  const number = toWhatsAppNumber(raw);
  if (!number) return false;
  // wa.me works on every platform and hands off to the installed app when
  // there is one, so there's no app-installed check to get wrong.
  const url = `https://wa.me/${number}`;
  try {
    if (Platform.OS === "web") {
      window.open(url, "_blank", "noopener");
      return true;
    }
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
