import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../theme";
import { Card, ConfirmationCard } from "../../components";
import { isEmailDraft, type ConversationMessage, type EmailDraftMetadata } from "../../api/pa";

interface ChatBubbleProps {
  message: ConversationMessage;
  isPlaying: boolean;
  onPlayAudio: (audioUrl: string) => void;
  onStopAudio: () => void;
  onDraftAction: (draftId: string, action: "send" | "discard") => void;
}

function DraftCard({ draft, onDraftAction }: { draft: EmailDraftMetadata; onDraftAction: ChatBubbleProps["onDraftAction"] }) {
  const { t } = useTranslation();
  const { colors, spacing, typography } = useTheme();
  const body = `${t("pa.draftTo")}: ${draft.to}\n${t("pa.draftSubject")}: ${draft.subject}\n\n${draft.body}`;

  if (draft.status === "pending") {
    return (
      <ConfirmationCard
        title={t("pa.draftTitle")}
        message={body}
        primaryActionLabel={t("pa.draftSend")}
        onPrimaryAction={() => onDraftAction(draft.draftId, "send")}
        secondaryActionLabel={t("pa.draftDiscard")}
        onSecondaryAction={() => onDraftAction(draft.draftId, "discard")}
      />
    );
  }

  return (
    <Card style={{ gap: spacing.sm }}>
      <Text
        style={{
          color: colors.textSecondary,
          fontFamily: typography.fontFamilyBodyMedium,
          fontSize: typography.sizes.sm,
        }}
      >
        {draft.status === "sent" ? t("pa.draftSent") : t("pa.draftDiscarded")}
      </Text>
      <Text
        style={{
          color: colors.textSecondary,
          fontFamily: typography.fontFamilyBody,
          fontSize: typography.sizes.sm,
          lineHeight: typography.sizes.sm * 1.4,
        }}
      >
        {body}
      </Text>
    </Card>
  );
}

export function ChatBubble({ message, isPlaying, onPlayAudio, onStopAudio, onDraftAction }: ChatBubbleProps) {
  const { t } = useTranslation();
  const { colors, spacing, radii, typography } = useTheme();
  const isUser = message.role === "user";
  const textColor = isUser ? colors.textOnAccent : colors.textPrimary;
  const draft = isEmailDraft(message.metadata) ? message.metadata : null;

  return (
    <View style={[styles.column, { alignSelf: isUser ? "flex-end" : "flex-start", gap: spacing.sm }]}>
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
            gap: spacing.xs,
          },
        ]}
      >
        {message.modality === "voice" ? (
          <View style={[styles.voiceRow, { gap: spacing.xs }]}>
            {message.audioUrl ? (
              <Pressable
                onPress={() => (isPlaying ? onStopAudio() : onPlayAudio(message.audioUrl as string))}
                accessibilityRole="button"
                accessibilityLabel={isPlaying ? t("pa.stopVoice") : t("pa.playVoice")}
                hitSlop={8}
              >
                <Ionicons name={isPlaying ? "stop-circle" : "play-circle"} size={28} color={textColor} />
              </Pressable>
            ) : (
              <Ionicons name="mic" size={16} color={textColor} />
            )}
            <Text
              style={{
                color: textColor,
                fontFamily: typography.fontFamilyBodyMedium,
                fontSize: typography.sizes.xs,
                opacity: 0.85,
              }}
            >
              {t("pa.voiceNote")}
            </Text>
          </View>
        ) : null}
        <Text
          style={{
            color: textColor,
            fontFamily: typography.fontFamilyBody,
            fontSize: typography.sizes.md,
            lineHeight: typography.sizes.md * 1.4,
          }}
        >
          {message.content}
        </Text>
      </View>

      {draft ? <DraftCard draft={draft} onDraftAction={onDraftAction} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  column: {
    maxWidth: "88%",
  },
  bubble: {
    minWidth: 48,
  },
  voiceRow: {
    flexDirection: "row",
    alignItems: "center",
  },
});
