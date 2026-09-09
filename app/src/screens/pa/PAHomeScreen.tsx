import React, { useCallback, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../theme";
import { ScreenContainer } from "../../components";
import { ChatBubble } from "./ChatBubble";
import { ChatInputBar } from "./ChatInputBar";
import { fetchMessages, sendMessage, type ConversationMessage } from "../../api/pa";
import { extractErrorMessage } from "../../api/client";

const POLL_INTERVAL_MS = 5000;

export function PAHomeScreen() {
  const { t } = useTranslation();
  const { colors, spacing, typography } = useTheme();

  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const listRef = useRef<FlatList<ConversationMessage>>(null);
  const sendingRef = useRef(false);

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

  async function handleSend() {
    const text = draft.trim();
    if (!text || sending) return;

    setDraft("");
    setSending(true);
    sendingRef.current = true;
    setError(undefined);

    const optimisticMessage: ConversationMessage = {
      id: `pending-${Date.now()}`,
      role: "user",
      channel: "app",
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimisticMessage]);

    try {
      const { userMessage, assistantMessage } = await sendMessage(text);
      setMessages((current) => [
        ...current.filter((m) => m.id !== optimisticMessage.id),
        userMessage,
        assistantMessage,
      ]);
    } catch (err) {
      setMessages((current) => current.filter((m) => m.id !== optimisticMessage.id));
      setDraft(text);
      setError(extractErrorMessage(err));
    } finally {
      setSending(false);
      sendingRef.current = false;
    }
  }

  return (
    <ScreenContainer scroll={false}>
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
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => <ChatBubble message={item} />}
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

        <ChatInputBar value={draft} onChangeText={setDraft} onSend={handleSend} sending={sending} />
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
