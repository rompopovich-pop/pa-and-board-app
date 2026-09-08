import React from "react";
import { StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";
import { useTheme } from "../theme";

interface TextFieldProps extends TextInputProps {
  label: string;
  errorMessage?: string;
}

export function TextField({ label, errorMessage, style, ...inputProps }: TextFieldProps) {
  const { colors, spacing, radii, typography } = useTheme();

  return (
    <View style={{ gap: spacing.xs }}>
      <Text
        style={{
          color: colors.textSecondary,
          fontFamily: typography.fontFamilyBodyMedium,
          fontSize: typography.sizes.sm,
        }}
      >
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.textSecondary}
        style={[
          styles.input,
          {
            borderColor: errorMessage ? colors.danger : colors.border,
            borderRadius: radii.md,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm + 2,
            color: colors.textPrimary,
            fontFamily: typography.fontFamilyBody,
            fontSize: typography.sizes.md,
            backgroundColor: colors.surface,
          },
          style,
        ]}
        {...inputProps}
      />
      {errorMessage ? (
        <Text
          style={{
            color: colors.danger,
            fontFamily: typography.fontFamilyBody,
            fontSize: typography.sizes.xs,
          }}
        >
          {errorMessage}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
  },
});
