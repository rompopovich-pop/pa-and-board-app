import React from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import { useTheme } from "../theme";

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

export function Card({ children, style }: CardProps) {
  const { colors, spacing, radii, shadow } = useTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderRadius: radii.lg,
          padding: spacing.lg,
          borderColor: colors.border,
        },
        shadow.card,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
  },
});
