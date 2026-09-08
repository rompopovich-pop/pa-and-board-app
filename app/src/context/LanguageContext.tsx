import React, { createContext, useContext, useEffect, useState } from "react";
import { I18nManager, Platform } from "react-native";
import * as Localization from "expo-localization";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Updates from "expo-updates";
import i18n, { SupportedLanguage, SUPPORTED_LANGUAGES, isRtlLanguage } from "../i18n";

/**
 * Auto-detects the device locale on first launch, lets the user override it
 * from Settings, and flips React Native's layout direction with
 * I18nManager for Hebrew — per design-ux-localization-spec.md section 5.
 *
 * A layout-direction change (LTR <-> RTL) requires a full reload to take
 * effect everywhere, so we persist the choice, flip the native flag, and
 * reload the app. UI-language-only changes (no direction change) don't
 * need a reload.
 */

const STORAGE_KEY = "pa-board.language-override";

interface LanguageContextValue {
  language: SupportedLanguage;
  isRTL: boolean;
  setLanguage: (language: SupportedLanguage) => Promise<void>;
  ready: boolean;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

function detectDeviceLanguage(): SupportedLanguage {
  const deviceLanguageCode = Localization.getLocales()[0]?.languageCode;
  return SUPPORTED_LANGUAGES.includes(deviceLanguageCode as SupportedLanguage)
    ? (deviceLanguageCode as SupportedLanguage)
    : "en";
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<SupportedLanguage>("en");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const stored = (await AsyncStorage.getItem(STORAGE_KEY)) as SupportedLanguage | null;
      const initialLanguage = stored ?? detectDeviceLanguage();

      await i18n.changeLanguage(initialLanguage);
      applyLayoutDirection(initialLanguage);
      setLanguageState(initialLanguage);
      setReady(true);
    })();
  }, []);

  function applyLayoutDirection(nextLanguage: SupportedLanguage) {
    const shouldBeRTL = isRtlLanguage(nextLanguage);
    if (I18nManager.isRTL !== shouldBeRTL) {
      I18nManager.allowRTL(shouldBeRTL);
      I18nManager.forceRTL(shouldBeRTL);
    }
  }

  async function setLanguage(nextLanguage: SupportedLanguage) {
    const directionChanged = isRtlLanguage(nextLanguage) !== isRtlLanguage(language);

    await AsyncStorage.setItem(STORAGE_KEY, nextLanguage);
    await i18n.changeLanguage(nextLanguage);
    setLanguageState(nextLanguage);

    if (!directionChanged) {
      return;
    }

    applyLayoutDirection(nextLanguage);

    // Reload so every already-mounted screen picks up the new writing
    // direction. Works in dev builds and standalone apps; on web there's
    // no native RTL flag to flip, so this is a no-op there.
    if (Platform.OS !== "web") {
      try {
        await Updates.reloadAsync();
      } catch {
        // Expo Go / environments without expo-updates support: the
        // direction flag is set and will apply on the next manual reload.
      }
    }
  }

  return (
    <LanguageContext.Provider value={{ language, isRTL: I18nManager.isRTL, setLanguage, ready }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return ctx;
}
