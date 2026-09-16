import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme";

/**
 * Small rounded pill used for the Board's statuses ("status at a glance",
 * design-ux-localization-spec.md section 2 - colour-coded, not just a text
 * label) and for pick-one choices in forms. Selectable when `onPress` is
 * given; `color` adds a dot so the colour reads even at small sizes.
 */
interface ChipProps {
  label: string;
  color?: string;
  selected?: boolean;
  onPress?: () => void;
  small?: boolean;
  accessibilityLabel?: string;
}

export function Chip({ label, color, selected = false, onPress, small = false, accessibilityLabel }: ChipProps) {
  const { colors, spacing, radii, typography } = useTheme();
  const accent = color ?? colors.accentPrimary;
  const interactive = Boolean(onPress);

  const content = (
    <View
      style={[
        styles.row,
        {
          borderRadius: radii.pill,
          paddingVertical: small ? spacing.xs : spacing.sm,
          paddingHorizontal: small ? spacing.sm : spacing.md,
          gap: spacing.xs + 2,
          backgroundColor: selected ? accent : colors.surfaceAlt,
          borderColor: selected ? accent : colors.border,
        },
      ]}
    >
      {color ? (
        <View
          style={{
            width: small ? 6 : 8,
            height: small ? 6 : 8,
            borderRadius: 4,
            backgroundColor: selected ? colors.textOnAccent : color,
          }}
        />
      ) : null}
      <Text
        numberOfLines={1}
        style={{
          color: selected ? colors.textOnAccent : colors.textPrimary,
          fontFamily: typography.fontFamilyBodyMedium,
          fontSize: small ? typography.sizes.xs : typography.sizes.sm,
        }}
      >
        {label}
      </Text>
    </View>
  );

  if (!interactive) return content;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected }}
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    alignSelf: "flex-start",
  },
});
