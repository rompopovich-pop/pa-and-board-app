import React from "react";
import { Text } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../theme";
import { ScreenContainer, ConfirmationCard } from "../../components";

export function PAHomeScreen() {
  const { t } = useTranslation();
  const { colors, typography, spacing } = useTheme();

  return (
    <ScreenContainer>
      <Text
        style={{
          color: colors.textPrimary,
          fontFamily: typography.fontFamilyHeading,
          fontSize: typography.sizes.xxl,
        }}
      >
        {t("pa.placeholderTitle")}
      </Text>
      <Text
        style={{
          color: colors.textSecondary,
          fontFamily: typography.fontFamilyBody,
          fontSize: typography.sizes.md,
          lineHeight: typography.sizes.md * 1.4,
          marginBottom: spacing.md,
        }}
      >
        {t("pa.placeholderBody")}
      </Text>

      <ConfirmationCard
        title={t("pa.demoCardTitle")}
        message={t("pa.demoCardBody")}
        primaryActionLabel={t("pa.demoCardApprove")}
        onPrimaryAction={() => {}}
        secondaryActionLabel={t("pa.demoCardDismiss")}
        onSecondaryAction={() => {}}
      />
    </ScreenContainer>
  );
}
