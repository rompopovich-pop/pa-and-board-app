import React, { useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../theme";
import { Card, ConfirmationCard } from "../../components";
import {
  isEmailDraft,
  isResearchOptions,
  type ConversationMessage,
  type EmailDraftMetadata,
  type ResearchOptionsMetadata,
} from "../../api/pa";

export type ResearchAction = { sessionId: string; action: "confirm"; optionId: string } | { sessionId: string; action: "dismiss" };

interface ChatBubbleProps {
  message: ConversationMessage;
  isPlaying: boolean;
  busy: boolean;
  onPlayAudio: (audioUrl: string) => void;
  onStopAudio: () => void;
  onDraftAction: (draftId: string, action: "send" | "discard") => void;
  onResearchAction: (action: ResearchAction) => void;
}

function ResolvedCard({ label, body }: { label: string; body: string }) {
  const { colors, spacing, typography } = useTheme();
  return (
    <Card style={{ gap: spacing.sm }}>
      <Text
        style={{
          color: colors.textSecondary,
          fontFamily: typography.fontFamilyBodyMedium,
          fontSize: typography.sizes.sm,
        }}
      >
        {label}
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

function DraftCard({
  draft,
  busy,
  onDraftAction,
}: {
  draft: EmailDraftMetadata;
  busy: boolean;
  onDraftAction: ChatBubbleProps["onDraftAction"];
}) {
  const { t } = useTranslation();
  const body = `${t("pa.draftTo")}: ${draft.to}\n${t("pa.draftSubject")}: ${draft.subject}\n\n${draft.body}`;

  if (draft.status !== "pending") {
    return <ResolvedCard label={draft.status === "sent" ? t("pa.draftSent") : t("pa.draftDiscarded")} body={body} />;
  }

  return (
    <ConfirmationCard
      title={t("pa.draftTitle")}
      message={body}
      primaryActionLabel={t("pa.draftSend")}
      onPrimaryAction={() => onDraftAction(draft.draftId, "send")}
      secondaryActionLabel={t("pa.draftDiscard")}
      onSecondaryAction={() => onDraftAction(draft.draftId, "discard")}
      busy={busy}
    />
  );
}

// The "present options, wait for explicit confirmation" gate
// (pa-whatsapp-spec.md section 7, Phase 3). Confirming records the user's
// choice - it never books or pays for anything, which the footnote says
// plainly so the state is never ambiguous.
function ResearchCard({
  research,
  busy,
  onResearchAction,
}: {
  research: ResearchOptionsMetadata;
  busy: boolean;
  onResearchAction: ChatBubbleProps["onResearchAction"];
}) {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string | undefined>();

  if (research.status !== "pending") {
    const chosen = research.options.find((option) => option.id === research.chosenOptionId);
    const body = chosen
      ? `${chosen.title}${chosen.price ? ` — ${chosen.price}` : ""}${chosen.url ? `\n${chosen.url}` : ""}`
      : research.request;
    return (
      <ResolvedCard label={research.status === "confirmed" ? t("pa.researchConfirmed") : t("pa.researchDismissed")} body={body} />
    );
  }

  return (
    <ConfirmationCard
      title={t("pa.researchTitle")}
      message={research.request}
      options={research.options}
      selectedOptionId={selectedId}
      onSelectOption={setSelectedId}
      onOpenOptionLink={(url) => Linking.openURL(url).catch(() => {})}
      openLinkLabel={t("pa.researchView")}
      footnote={t("pa.researchNotBooked")}
      primaryActionLabel={t("pa.researchConfirm")}
      primaryDisabled={!selectedId}
      onPrimaryAction={() =>
        selectedId && onResearchAction({ sessionId: research.sessionId, action: "confirm", optionId: selectedId })
      }
      secondaryActionLabel={t("pa.researchDismiss")}
      onSecondaryAction={() => onResearchAction({ sessionId: research.sessionId, action: "dismiss" })}
      busy={busy}
    />
  );
}

export function ChatBubble({
  message,
  isPlaying,
  busy,
  onPlayAudio,
  onStopAudio,
  onDraftAction,
  onResearchAction,
}: ChatBubbleProps) {
  const { t } = useTranslation();
  const { colors, spacing, radii, typography } = useTheme();
  const isUser = message.role === "user";
  const textColor = isUser ? colors.textOnAccent : colors.textPrimary;
  const draft = isEmailDraft(message.metadata) ? message.metadata : null;
  const research = isResearchOptions(message.metadata) ? message.metadata : null;

  return (
    <View style={[styles.column, { alignSelf: isUser ? "flex-end" : "flex-start", gap: spacing.sm }]}>
      {message.content ? (
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
      ) : null}

      {draft ? <DraftCard draft={draft} busy={busy} onDraftAction={onDraftAction} /> : null}
      {research ? <ResearchCard research={research} busy={busy} onResearchAction={onResearchAction} /> : null}
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
