import React from "react";
import { Text } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../theme";
import { ScreenContainer, ConfirmationCard } from "../../components";

export function BoardHomeScreen() {
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
        {t("board.placeholderTitle")}
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
        {t("board.placeholderBody")}
      </Text>

      <ConfirmationCard
        title={t("board.demoCardTitle")}
        message={t("board.demoCardBody")}
        primaryActionLabel={t("board.demoCardApprove")}
        onPrimaryAction={() => {}}
        secondaryActionLabel={t("board.demoCardDismiss")}
        onSecondaryAction={() => {}}
      />
    </ScreenContainer>
  );
}
