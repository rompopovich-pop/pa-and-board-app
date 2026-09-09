import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../theme";
import type { ConversationMessage } from "../../api/pa";

export function ChatBubble({ message }: { message: ConversationMessage }) {
  const { colors, spacing, radii, typography } = useTheme();
  const isUser = message.role === "user";

  return (
    <View style={[styles.row, { alignSelf: isUser ? "flex-end" : "flex-start" }]}>
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: isUser ? colors.accentPrimary : colors.surface,
            borderColor: colors.border,
            borderWidth: isUser ? 0 : 1,
            borderRadius: radii.lg,
            paddingVertical: spacing.sm + 2,
            paddingHorizontal: spacing.md,
          },
        ]}
      >
        <Text
          style={{
            color: isUser ? colors.textOnAccent : colors.textPrimary,
            fontFamily: typography.fontFamilyBody,
            fontSize: typography.sizes.md,
            lineHeight: typography.sizes.md * 1.4,
          }}
        >
          {message.content}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    maxWidth: "82%",
  },
  bubble: {
    minWidth: 48,
  },
});
