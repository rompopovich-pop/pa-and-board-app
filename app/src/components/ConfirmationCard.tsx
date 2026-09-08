import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme";
import { Button } from "./Button";

/**
 * The one recognizable "this needs your OK" pattern reused across both
 * products (design-ux-localization-spec.md sections 1-2): booking options,
 * an ambiguous email draft, an outreach request about to go out, a
 * suggested Board follow-up. A distinct attention-colored accent bar makes
 * it visually unmistakable from a normal chat bubble or list item.
 */

interface ConfirmationCardProps {
  title: string;
  message: string;
  primaryActionLabel: string;
  onPrimaryAction: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
}

export function ConfirmationCard({
  title,
  message,
  primaryActionLabel,
  onPrimaryAction,
  secondaryActionLabel,
  onSecondaryAction,
}: ConfirmationCardProps) {
  const { colors, spacing, radii, typography, shadow } = useTheme();

  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderRadius: radii.lg,
          borderColor: colors.border,
        },
        shadow.card,
      ]}
    >
      <View
        style={[
          styles.accentBar,
          { backgroundColor: colors.attention, borderTopStartRadius: radii.lg, borderBottomStartRadius: radii.lg },
        ]}
      />
      <View style={[styles.body, { padding: spacing.lg, gap: spacing.sm }]}>
        <Text
          style={{
            color: colors.textPrimary,
            fontFamily: typography.fontFamilyHeadingSemiBold,
            fontSize: typography.sizes.lg,
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            color: colors.textSecondary,
            fontFamily: typography.fontFamilyBody,
            fontSize: typography.sizes.md,
            lineHeight: typography.sizes.md * 1.4,
          }}
        >
          {message}
        </Text>
        <View style={[styles.actions, { gap: spacing.sm, marginTop: spacing.sm }]}>
          <View style={{ flex: 1 }}>
            <Button label={primaryActionLabel} onPress={onPrimaryAction} variant="primary" />
          </View>
          {secondaryActionLabel && onSecondaryAction ? (
            <View style={{ flex: 1 }}>
              <Button label={secondaryActionLabel} onPress={onSecondaryAction} variant="secondary" />
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    borderWidth: 1,
    overflow: "hidden",
  },
  accentBar: {
    width: 6,
  },
  body: {
    flex: 1,
  },
  actions: {
    flexDirection: "row",
  },
});
