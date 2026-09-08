import React from "react";
import { Alert, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../theme";
import { useLanguage } from "../../context/LanguageContext";
import { useAuth } from "../../context/AuthContext";
import { ScreenContainer, Button, Card } from "../../components";
import type { SupportedLanguage } from "../../i18n";

export function SettingsScreen() {
  const { t } = useTranslation();
  const { colors, typography, spacing, radii } = useTheme();
  const { language, setLanguage } = useLanguage();
  const { user, logOut } = useAuth();

  async function handleSelectLanguage(next: SupportedLanguage) {
    if (next === language) return;
    Alert.alert(t("settings.language"), t("settings.restartNotice"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.confirm"), onPress: () => setLanguage(next) },
    ]);
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
            {user.name} · {user.email}
          </Text>
          <Button label={t("settings.logout")} variant="secondary" onPress={logOut} />
        </Card>
      ) : null}
    </ScreenContainer>
  );
}
