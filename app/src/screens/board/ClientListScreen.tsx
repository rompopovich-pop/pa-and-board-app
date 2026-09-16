import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../theme";
import { Button, Chip, ScreenContainer } from "../../components";
import { fetchClients, type Board, type BoardClient } from "../../api/board";
import { extractErrorMessage } from "../../api/client";
import { BoardHeader } from "./BoardHeader";
import type { BoardNav } from "./BoardNavigator";
import { findStatus, formatFieldValue, generatedTextStyle, highlightFields, statusColor } from "./boardText";

// The basic list view (business-board-spec.md section 6, Phase 1): every
// client on the board with a colour-coded status, filterable by status and
// searchable by name. Calmer, tighter spacing than the PA's chat
// (design spec section 4) but the same palette and roundedness.
interface ClientListScreenProps {
  board: Board;
}

export function ClientListScreen({ board }: ClientListScreenProps) {
  const { t, i18n } = useTranslation();
  const { colors, spacing, radii, typography } = useTheme();
  const navigation = useNavigation<BoardNav>();
  const generated = generatedTextStyle(board.business.language);

  const [clients, setClients] = useState<BoardClient[] | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(undefined);
      setClients(await fetchClients());
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const visible = useMemo(() => {
    if (!clients) return [];
    const needle = query.trim().toLowerCase();
    return clients.filter(
      (client) => (!statusFilter || client.status === statusFilter) && (!needle || client.name.toLowerCase().includes(needle)),
    );
  }, [clients, query, statusFilter]);

  const count = clients?.length ?? board.clientCount;
  const countLabel = t("board.listCount", { count, noun: count === 1 ? board.clientNoun : board.clientNounPlural });

  function renderRow({ item }: { item: BoardClient }) {
    const status = findStatus(board, item.status);
    const highlights = highlightFields(board, item.fields);
    return (
      <Pressable
        onPress={() => navigation.navigate("ClientDetail", { clientId: item.id })}
        accessibilityRole="button"
        accessibilityLabel={item.name}
        style={({ pressed }) => ({
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: radii.md,
          paddingVertical: spacing.sm + 4,
          paddingHorizontal: spacing.md,
          gap: spacing.xs,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <Text
            numberOfLines={1}
            style={[
              { flex: 1, color: colors.textPrimary, fontFamily: typography.fontFamilyBodyMedium, fontSize: typography.sizes.md },
              generated,
            ]}
          >
            {item.name}
          </Text>
          {status ? <Chip small label={status.label} color={statusColor(colors, status.tone)} /> : null}
        </View>
        {highlights.length > 0 ? (
          <Text
            numberOfLines={1}
            style={[{ color: colors.textSecondary, fontFamily: typography.fontFamilyBody, fontSize: typography.sizes.sm }, generated]}
          >
            {highlights.map((field) => `${field.label}: ${formatFieldValue(field, item.fields[field.key], t, i18n.language)}`).join("  ·  ")}
          </Text>
        ) : null}
      </Pressable>
    );
  }

  return (
    <ScreenContainer scroll={false} style={{ flex: 1, gap: spacing.sm }}>
      <BoardHeader
        title={board.name}
        subtitle={countLabel}
        titleStyle={generated}
        right={
          <Pressable
            onPress={() => navigation.navigate("BoardAbout")}
            accessibilityRole="button"
            accessibilityLabel={t("board.aboutLink")}
            hitSlop={8}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, padding: spacing.xs })}
          >
            <Ionicons name="information-circle-outline" size={26} color={colors.textSecondary} />
          </Pressable>
        }
      />

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.sm,
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: radii.pill,
          paddingHorizontal: spacing.md,
        }}
      >
        <Ionicons name="search" size={18} color={colors.textSecondary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t("board.listSearch")}
          placeholderTextColor={colors.textSecondary}
          accessibilityLabel={t("board.listSearch")}
          style={{
            flex: 1,
            paddingVertical: spacing.sm + 2,
            color: colors.textPrimary,
            fontFamily: typography.fontFamilyBody,
            fontSize: typography.sizes.md,
          }}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ gap: spacing.sm, paddingVertical: 2 }}
      >
        <Chip label={t("board.listAll")} selected={statusFilter === null} onPress={() => setStatusFilter(null)} />
        {board.statuses.map((status) => (
          <Chip
            key={status.key}
            label={status.label}
            color={statusColor(colors, status.tone)}
            selected={statusFilter === status.key}
            onPress={() => setStatusFilter(statusFilter === status.key ? null : status.key)}
          />
        ))}
      </ScrollView>

      {error ? (
        <Text style={{ color: colors.danger, fontFamily: typography.fontFamilyBody, fontSize: typography.sizes.sm }}>{error}</Text>
      ) : null}

      {clients === null ? (
        <ActivityIndicator color={colors.accentPrimary} style={{ marginTop: spacing.lg }} />
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={visible}
          keyExtractor={(item) => item.id}
          renderItem={renderRow}
          contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.md }}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text
              style={{
                color: colors.textSecondary,
                fontFamily: typography.fontFamilyBody,
                fontSize: typography.sizes.md,
                lineHeight: typography.sizes.md * 1.4,
                textAlign: "center",
                paddingVertical: spacing.xl,
              }}
            >
              {clients.length === 0 ? t("board.listEmpty", { noun: board.clientNounPlural }) : t("board.listEmptyFiltered")}
            </Text>
          }
        />
      )}

      <Button label={t("board.addClient", { noun: board.clientNoun })} onPress={() => navigation.navigate("ClientForm", {})} />
    </ScreenContainer>
  );
}
