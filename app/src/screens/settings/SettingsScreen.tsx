import React, { useCallback, useEffect, useState } from "react";
import { Alert, AppState, Linking, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../theme";
import { useLanguage } from "../../context/LanguageContext";
import { useAuth } from "../../context/AuthContext";
import { ScreenContainer, Button, Card, TextField } from "../../components";
import { extractErrorMessage } from "../../api/client";
import { disconnectGoogle, fetchGoogleConnectUrl, fetchGoogleStatus, type GoogleStatus } from "../../api/pa";
import type { SupportedLanguage } from "../../i18n";

const WHATSAPP_NUMBER = process.env.EXPO_PUBLIC_WHATSAPP_NUMBER;

export function SettingsScreen() {
  const { t } = useTranslation();
  const { colors, typography, spacing, radii } = useTheme();
  const { language, setLanguage } = useLanguage();
  const { user, logOut, updateProfile } = useAuth();

  const [phoneDraft, setPhoneDraft] = useState(user?.phone ?? "");
  const [savingPhone, setSavingPhone] = useState(false);
  const [phoneError, setPhoneError] = useState<string | undefined>();

  const [google, setGoogle] = useState<GoogleStatus | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleError, setGoogleError] = useState<string | undefined>();

  const refreshGoogle = useCallback(async () => {
    try {
      setGoogle(await fetchGoogleStatus());
    } catch {
      // Leave the card as-is; the next focus/foreground will retry.
    }
  }, []);

  // The OAuth consent happens in the browser, so re-check when the user
  // comes back to the app (or to this screen).
  useFocusEffect(
    useCallback(() => {
      refreshGoogle();
    }, [refreshGoogle]),
  );
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshGoogle();
    });
    return () => subscription.remove();
  }, [refreshGoogle]);

  async function handleConnectGoogle() {
    setGoogleBusy(true);
    setGoogleError(undefined);
    try {
      await Linking.openURL(await fetchGoogleConnectUrl());
    } catch (err) {
      setGoogleError(extractErrorMessage(err));
    } finally {
      setGoogleBusy(false);
    }
  }

  async function handleDisconnectGoogle() {
    setGoogleBusy(true);
    setGoogleError(undefined);
    try {
      await disconnectGoogle();
      await refreshGoogle();
    } catch (err) {
      setGoogleError(extractErrorMessage(err));
    } finally {
      setGoogleBusy(false);
    }
  }

  async function handleSelectLanguage(next: SupportedLanguage) {
    if (next === language) return;
    Alert.alert(t("settings.language"), t("settings.restartNotice"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.confirm"), onPress: () => setLanguage(next) },
    ]);
  }

  async function handleSavePhone() {
    if (!phoneDraft.trim()) return;
    setSavingPhone(true);
    setPhoneError(undefined);
    try {
      await updateProfile({ phone: phoneDraft.trim() });
    } catch (err) {
      setPhoneError(extractErrorMessage(err));
    } finally {
      setSavingPhone(false);
    }
  }

  function handleOpenWhatsApp() {
    if (!WHATSAPP_NUMBER) return;
    Linking.openURL(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent("Hi")}`);
  }

  return (
    <ScreenContainer>
      <Text
        style={{
          color: colors.textPrimary,
          fontFamily: typography.fontFamilyHeading,
          fontSize: typography.sizes.xxl,
        }}
      >
        {t("settings.title")}
      </Text>

      <Card>
        <Text
          style={{
            color: colors.textSecondary,
            fontFamily: typography.fontFamilyBodyMedium,
            fontSize: typography.sizes.sm,
            marginBottom: spacing.sm,
          }}
        >
          {t("settings.language")}
        </Text>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          {(["en", "he"] as SupportedLanguage[]).map((code) => (
            <View key={code} style={{ flex: 1 }}>
              <Button
                label={code === "en" ? t("settings.languageEnglish") : t("settings.languageHebrew")}
                variant={language === code ? "primary" : "secondary"}
                onPress={() => handleSelectLanguage(code)}
              />
            </View>
          ))}
        </View>
      </Card>

      <Card style={{ gap: spacing.sm }}>
        <Text
          style={{
            color: colors.textSecondary,
            fontFamily: typography.fontFamilyBodyMedium,
            fontSize: typography.sizes.sm,
          }}
        >
          {t("settings.whatsappSection")}
        </Text>
        <Text
          style={{
            color: colors.textSecondary,
            fontFamily: typography.fontFamilyBody,
            fontSize: typography.sizes.sm,
            lineHeight: typography.sizes.sm * 1.4,
          }}
        >
          {t("settings.whatsappExplainer")}
        </Text>
        <TextField
          label={t("settings.whatsappPhoneLabel")}
          value={phoneDraft}
          onChangeText={setPhoneDraft}
          keyboardType="phone-pad"
          autoComplete="tel"
          errorMessage={phoneError}
        />
        <Button
          label={t("settings.whatsappSave")}
          onPress={handleSavePhone}
          loading={savingPhone}
          disabled={!phoneDraft.trim() || phoneDraft.trim() === user?.phone}
        />
        {WHATSAPP_NUMBER ? (
          <Button label={t("settings.whatsappOpen")} variant="secondary" onPress={handleOpenWhatsApp} />
        ) : null}
      </Card>

      {google?.configured ? (
        <Card style={{ gap: spacing.sm }}>
          <Text
            style={{
              color: colors.textSecondary,
              fontFamily: typography.fontFamilyBodyMedium,
              fontSize: typography.sizes.sm,
            }}
          >
            {t("settings.googleSection")}
          </Text>
          <Text
            style={{
              color: colors.textSecondary,
              fontFamily: typography.fontFamilyBody,
              fontSize: typography.sizes.sm,
              lineHeight: typography.sizes.sm * 1.4,
            }}
          >
            {google.connected
              ? t("settings.googleConnected", { email: google.email ?? "" })
              : t("settings.googleExplainer")}
          </Text>
          {googleError ? (
            <Text style={{ color: colors.danger, fontFamily: typography.fontFamilyBody, fontSize: typography.sizes.xs }}>
              {googleError}
            </Text>
          ) : null}
          {google.connected ? (
            <Button
              label={t("settings.googleDisconnect")}
              variant="secondary"
              onPress={handleDisconnectGoogle}
              loading={googleBusy}
            />
          ) : (
            <Button label={t("settings.googleConnect")} onPress={handleConnectGoogle} loading={googleBusy} />
          )}
        </Card>
      ) : null}

      {user ? (
        <Card style={{ borderRadius: radii.lg }}>
          <Text
            style={{
              color: colors.textSecondary,
              fontFamily: typography.fontFamilyBodyMedium,
              fontSize: typography.sizes.sm,
              marginBottom: spacing.xs,
            }}
          >
            {t("settings.account")}
          </Text>
          <Text
            style={{
              color: colors.textPrimary,
              fontFamily: typography.fontFamilyBody,
              fontSize: typography.sizes.md,
              marginBottom: spacing.md,
            }}
          >
            {[user.name, user.email].filter(Boolean).join(" · ")}
          </Text>
          <Button label={t("settings.logout")} variant="secondary" onPress={logOut} />
        </Card>
      ) : null}
    </ScreenContainer>
  );
}
