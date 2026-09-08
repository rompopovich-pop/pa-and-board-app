import React from "react";
import { ActivityIndicator, GestureResponderEvent, Pressable, StyleSheet, Text } from "react-native";
import { useTheme } from "../theme";

type ButtonVariant = "primary" | "secondary" | "ghost";

interface ButtonProps {
  label: string;
  onPress: (event: GestureResponderEvent) => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
}

export function Button({
  label,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
  accessibilityLabel,
}: ButtonProps) {
  const { colors, spacing, radii, typography } = useTheme();
  const isDisabled = disabled || loading;

  const backgroundColor =
    variant === "primary"
      ? colors.accentPrimary
      : variant === "secondary"
        ? colors.surfaceAlt
        : "transparent";
  const textColor = variant === "primary" ? colors.textOnAccent : colors.textPrimary;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor,
          borderRadius: radii.pill,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.lg,
          opacity: isDisabled ? 0.6 : pressed ? 0.85 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text
          style={{
            color: textColor,
            fontFamily: typography.fontFamilyBodyMedium,
            fontSize: typography.sizes.md,
          }}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
  },
});
