import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../theme";

interface ChatInputBarProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  sending: boolean;
}

export function ChatInputBar({ value, onChangeText, onSend, sending }: ChatInputBarProps) {
  const { t } = useTranslation();
  const { colors, spacing, radii, typography } = useTheme();
  const canSend = value.trim().length > 0 && !sending;

  return (
    <View style={[styles.row, { gap: spacing.sm }]}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={t("pa.inputPlaceholder")}
        placeholderTextColor={colors.textSecondary}
        multiline
        accessibilityLabel={t("pa.inputPlaceholder")}
        style={[
          styles.input,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: radii.lg,
            color: colors.textPrimary,
            fontFamily: typography.fontFamilyBody,
            fontSize: typography.sizes.md,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
          },
        ]}
      />
      <Pressable
        onPress={onSend}
        disabled={!canSend}
        accessibilityRole="button"
        accessibilityLabel={t("pa.send")}
        style={[
          styles.sendButton,
          {
            backgroundColor: canSend ? colors.accentPrimary : colors.surfaceAlt,
            borderRadius: radii.pill,
          },
        ]}
      >
        {sending ? (
          <ActivityIndicator color={colors.textOnAccent} size="small" />
        ) : (
          <Ionicons
            name="arrow-up"
            size={20}
            color={canSend ? colors.textOnAccent : colors.textSecondary}
          />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
  },
  input: {
    flex: 1,
    borderWidth: 1,
    maxHeight: 120,
  },
  sendButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
});
