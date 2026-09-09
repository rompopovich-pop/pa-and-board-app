import React, { useCallback, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Text, View } from "react-native";
import { Audio } from "expo-av";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../theme";
import { ScreenContainer } from "../../components";
import { ChatBubble } from "./ChatBubble";
import { ChatInputBar } from "./ChatInputBar";
import { useAudioPlayer } from "./useAudioPlayer";
import {
  discardDraft,
  fetchMessages,
  sendDraft,
  sendMessage,
  sendVoiceMessage,
  type ConversationMessage,
  type TurnResponse,
} from "../../api/pa";
import { extractErrorMessage } from "../../api/client";

const POLL_INTERVAL_MS = 5000;

export function PAHomeScreen() {
  const { t } = useTranslation();
  const { colors, spacing, typography } = useTheme();
  const player = useAudioPlayer();

  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const listRef = useRef<FlatList<ConversationMessage>>(null);
  const sendingRef = useRef(false);
  const recordingRef = useRef<Audio.Recording | null>(null);

  const refresh = useCallback(async () => {
    if (sendingRef.current) return; // avoid clobbering an in-flight send
    try {
      const fetched = await fetchMessages();
      setMessages((current) =>
        fetched.length !== current.length || fetched.at(-1)?.id !== current.at(-1)?.id ? fetched : current,
      );
    } catch {
      // Silent - polling failures shouldn't interrupt the chat; the next
      // successful poll (or manual send) will catch the conversation up.
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        setLoading(true);
        await refresh();
        if (!cancelled) setLoading(false);
      })();

      const interval = setInterval(refresh, POLL_INTERVAL_MS);
      return () => {
        cancelled = true;
        clearInterval(interval);
      };
    }, [refresh]),
  );

  async function runTurn(optimistic: ConversationMessage, request: () => Promise<TurnResponse>) {
    setSending(true);
    sendingRef.current = true;
    setError(undefined);
    setMessages((current) => [...current, optimistic]);

    try {
      const { userMessage, assistantMessage } = await request();
      setMessages((current) => [...current.filter((m) => m.id !== optimistic.id), userMessage, assistantMessage]);
      return assistantMessage;
    } catch (err) {
      setMessages((current) => current.filter((m) => m.id !== optimistic.id));
      setError(extractErrorMessage(err));
      return null;
    } finally {
      setSending(false);
      sendingRef.current = false;
    }
  }

  function optimisticUserMessage(content: string, modality: ConversationMessage["modality"]): ConversationMessage {
    return {
      id: `pending-${Date.now()}`,
      role: "user",
      channel: "app",
      modality,
      content,
      audioUrl: null,
      metadata: null,
      createdAt: new Date().toISOString(),
    };
  }

  async function handleSend() {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft("");
    const reply = await runTurn(optimisticUserMessage(text, "text"), () => sendMessage(text));
    if (!reply) setDraft(text);
  }

  async function handleStartRecording() {
    if (sending || recording) return;
    setError(undefined);
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        setError(t("pa.micPermission"));
        return;
      }
      await player.stop();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording: newRecording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recordingRef.current = newRecording;
      setRecording(true);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  async function handleStopRecording() {
    const current = recordingRef.current;
    recordingRef.current = null;
    setRecording(false);
    if (!current) return;

    let uri: string | null = null;
    try {
      await current.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      uri = current.getURI();
    } catch (err) {
      setError(extractErrorMessage(err));
      return;
    }
    if (!uri) return;

    const fileUri = uri;
    const reply = await runTurn(optimisticUserMessage(t("pa.voiceNote"), "voice"), () => sendVoiceMessage(fileUri));
    // Reply in kind: a voice note gets a spoken answer, played straight away.
    if (reply?.audioUrl) {
      player.play(reply.audioUrl).catch(() => {});
    }
  }

  async function handleDraftAction(draftId: string, action: "send" | "discard") {
    if (sending) return;
    setSending(true);
    sendingRef.current = true;
    setError(undefined);
    try {
      await (action === "send" ? sendDraft(draftId) : discardDraft(draftId));
      sendingRef.current = false;
      await refresh(); // picks up the card's new status and the confirmation message
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSending(false);
      sendingRef.current = false;
    }
  }

  return (
    <ScreenContainer scroll={false} style={{ flex: 1 }}>
      <KeyboardAvoidingView
        style={{ flex: 1, gap: spacing.md }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        {messages.length === 0 && !loading ? (
          <View style={{ flex: 1, justifyContent: "center", gap: spacing.sm }}>
            <Text
              style={{
                color: colors.textPrimary,
                fontFamily: typography.fontFamilyHeading,
                fontSize: typography.sizes.xxl,
              }}
            >
              {t("pa.placeholderTitle")}
            </Text>
            <Text
              style={{
                color: colors.textSecondary,
                fontFamily: typography.fontFamilyBody,
                fontSize: typography.sizes.md,
                lineHeight: typography.sizes.md * 1.4,
              }}
            >
              {t("pa.placeholderBody")}
            </Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            style={{ flex: 1 }}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => (
              <ChatBubble
                message={item}
                isPlaying={item.audioUrl !== null && player.playingUrl === item.audioUrl}
                onPlayAudio={(url) => player.play(url).catch((err) => setError(extractErrorMessage(err)))}
                onStopAudio={player.stop}
                onDraftAction={handleDraftAction}
              />
            )}
            contentContainerStyle={{ gap: spacing.sm, flexGrow: 1, justifyContent: "flex-end" }}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          />
        )}

        {error ? (
          <Text
            style={{
              color: colors.danger,
              fontFamily: typography.fontFamilyBody,
              fontSize: typography.sizes.xs,
            }}
          >
            {error}
          </Text>
        ) : null}

        <ChatInputBar
          value={draft}
          onChangeText={setDraft}
          onSend={handleSend}
          sending={sending}
          recording={recording}
          onStartRecording={handleStartRecording}
          onStopRecording={handleStopRecording}
        />
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
