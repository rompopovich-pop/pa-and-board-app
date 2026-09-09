import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../theme";

interface ChatInputBarProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  sending: boolean;
  recording: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
}

// Voice is a first-class input (design-ux-localization-spec.md section 2):
// the mic sits where the send button is, with the same weight, and swaps to
// "send" only once there's typed text - the WhatsApp convention.
export function ChatInputBar({
  value,
  onChangeText,
  onSend,
  sending,
  recording,
  onStartRecording,
  onStopRecording,
}: ChatInputBarProps) {
  const { t } = useTranslation();
  const { colors, spacing, radii, typography } = useTheme();
  const hasText = value.trim().length > 0;
  const canSend = hasText && !sending;

  if (recording) {
    return (
      <View style={[styles.row, { gap: spacing.sm }]}>
        <View
          style={[
            styles.recordingPill,
            {
              backgroundColor: colors.surfaceAlt,
              borderColor: colors.attention,
              borderRadius: radii.lg,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm + 4,
              gap: spacing.sm,
            },
          ]}
        >
          <Ionicons name="radio-button-on" size={18} color={colors.danger} />
          <Text
            style={{
              color: colors.textPrimary,
              fontFamily: typography.fontFamilyBodyMedium,
              fontSize: typography.sizes.md,
            }}
          >
            {t("pa.recordHint")}
          </Text>
        </View>
        <Pressable
          onPress={onStopRecording}
          accessibilityRole="button"
          accessibilityLabel={t("pa.stopRecording")}
          style={[styles.actionButton, { backgroundColor: colors.accentPrimary, borderRadius: radii.pill }]}
        >
          <Ionicons name="arrow-up" size={20} color={colors.textOnAccent} />
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.row, { gap: spacing.sm }]}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={t("pa.inputPlaceholder")}
        placeholderTextColor={colors.textSecondary}
        multiline
        editable={!sending}
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
      {hasText ? (
        <Pressable
          onPress={onSend}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel={t("pa.send")}
          style={[
            styles.actionButton,
            { backgroundColor: canSend ? colors.accentPrimary : colors.surfaceAlt, borderRadius: radii.pill },
          ]}
        >
          {sending ? (
            <ActivityIndicator color={colors.textOnAccent} size="small" />
          ) : (
            <Ionicons name="arrow-up" size={20} color={canSend ? colors.textOnAccent : colors.textSecondary} />
          )}
        </Pressable>
      ) : (
        <Pressable
          onPress={onStartRecording}
          disabled={sending}
          accessibilityRole="button"
          accessibilityLabel={t("pa.record")}
          style={[
            styles.actionButton,
            { backgroundColor: sending ? colors.surfaceAlt : colors.accentPrimary, borderRadius: radii.pill },
          ]}
        >
          {sending ? (
            <ActivityIndicator color={colors.textSecondary} size="small" />
          ) : (
            <Ionicons name="mic" size={22} color={colors.textOnAccent} />
          )}
        </Pressable>
      )}
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
  recordingPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
  },
  actionButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
});
