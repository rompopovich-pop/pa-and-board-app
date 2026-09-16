import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../theme";
import { Button, Card, Chip, ConfirmationCard, ScreenContainer } from "../../components";
import {
  addActivity,
  deleteClient,
  fetchBoard,
  fetchClient,
  updateClient,
  type Board,
  type BoardClient,
  type ClientActivity,
} from "../../api/board";
import { extractErrorMessage } from "../../api/client";
import { BoardHeader } from "./BoardHeader";
import type { BoardNav, BoardStackParamList } from "./BoardNavigator";
import { formatDateTime, formatFieldValue, generatedTextStyle, statusColor } from "./boardText";

// The full client record on one screen (business-board-spec.md section 6,
// Phase 1): status, the structured fields, general info, and the
// chronological history log where sessions and notes get logged.
export function ClientDetailScreen() {
  const { t, i18n } = useTranslation();
  const { colors, spacing, radii, typography } = useTheme();
  const navigation = useNavigation<BoardNav>();
  const route = useRoute<RouteProp<BoardStackParamList, "ClientDetail">>();
  const { clientId } = route.params;

  const [board, setBoard] = useState<Board | null>(null);
  const [client, setClient] = useState<BoardClient | null>(null);
  const [activities, setActivities] = useState<ClientActivity[]>([]);
  const [error, setError] = useState<string | undefined>();
  const [entry, setEntry] = useState("");
  const [busy, setBusy] = useState<"status" | "note" | "session" | "delete" | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(undefined);
      const [fetchedBoard, detail] = await Promise.all([fetchBoard(), fetchClient(clientId)]);
      setBoard(fetchedBoard);
      setClient(detail.client);
      setActivities(detail.activities);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }, [clientId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function changeStatus(statusKey: string) {
    if (!client || busy || statusKey === client.status) return;
    setBusy("status");
    setError(undefined);
    try {
      setClient(await updateClient(client.id, { status: statusKey }));
      const detail = await fetchClient(client.id);
      setActivities(detail.activities);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function log(kind: "note" | "session") {
    if (!client || busy) return;
    if (kind === "note" && !entry.trim()) return;
    setBusy(kind);
    setError(undefined);
    try {
      const result = await addActivity(client.id, kind, entry.trim());
      setClient(result.client);
      setActivities((current) => [result.activity, ...current]);
      setEntry("");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!client || busy) return;
    setBusy("delete");
    try {
      await deleteClient(client.id);
      navigation.goBack();
    } catch (err) {
      setError(extractErrorMessage(err));
      setBusy(null);
    }
  }

  if (!board || !client) {
    return (
      <ScreenContainer>
        <BoardHeader title="" onBack={() => navigation.goBack()} />
        {error ? (
          <Text style={{ color: colors.danger, fontFamily: typography.fontFamilyBody, fontSize: typography.sizes.sm }}>{error}</Text>
        ) : (
          <ActivityIndicator color={colors.accentPrimary} />
        )}
      </ScreenContainer>
    );
  }

  const generated = generatedTextStyle(board.business.language);
  const heading = { color: colors.textPrimary, fontFamily: typography.fontFamilyHeadingSemiBold, fontSize: typography.sizes.md } as const;
  const label = { color: colors.textSecondary, fontFamily: typography.fontFamilyBodyMedium, fontSize: typography.sizes.sm } as const;
  const value = {
    color: colors.textPrimary,
    fontFamily: typography.fontFamilyBody,
    fontSize: typography.sizes.md,
    lineHeight: typography.sizes.md * 1.4,
  } as const;

  const generalInfoField = board.fields.find((field) => field.key === "general_info");
  const detailFields = board.fields.filter((field) => !field.isSystem);
  const filledFields = detailFields.filter((field) => formatFieldValue(field, client.fields[field.key], t, i18n.language) !== "");

  function activityLabel(activity: ClientActivity): string {
    switch (activity.kind) {
      case "created":
        return t("board.historyCreated");
      case "status_change":
        return t("board.historyStatusChanged");
      case "session":
        return t("board.historySession");
      case "note":
        return t("board.historyNote");
      default:
        return "";
    }
  }
  const activityIcon: Record<ClientActivity["kind"], React.ComponentProps<typeof Ionicons>["name"]> = {
    created: "person-add-outline",
    status_change: "swap-horizontal-outline",
    session: "calendar-outline",
    note: "create-outline",
    updated: "pencil-outline",
  };

  return (
    <ScreenContainer>
      <BoardHeader
        title={client.name}
        titleStyle={generated}
        onBack={() => navigation.goBack()}
        right={
          <Pressable
            onPress={() => navigation.navigate("ClientForm", { clientId: client.id })}
            accessibilityRole="button"
            accessibilityLabel={t("board.detailEdit")}
            hitSlop={8}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, padding: spacing.xs })}
          >
            <Ionicons name="create-outline" size={24} color={colors.accentPrimary} />
          </Pressable>
        }
      />

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        {board.statuses.map((status) => (
          <Chip
            key={status.key}
            label={status.label}
            color={statusColor(colors, status.tone)}
            selected={client.status === status.key}
            onPress={() => changeStatus(status.key)}
          />
        ))}
      </View>

      {error ? (
        <Text style={{ color: colors.danger, fontFamily: typography.fontFamilyBody, fontSize: typography.sizes.sm }}>{error}</Text>
      ) : null}

      <Card style={{ gap: spacing.sm }}>
        <Text style={heading}>{t("board.detailDetails")}</Text>
        {filledFields.length === 0 ? (
          <Text style={{ ...value, color: colors.textSecondary }}>{t("board.detailNoDetails")}</Text>
        ) : (
          filledFields.map((field) => (
            <View key={field.key} style={{ gap: 2 }}>
              <Text style={[label, generated]}>{field.label}</Text>
              <Text style={[value, generated]}>
                {formatFieldValue(field, client.fields[field.key], t, i18n.language)}
              </Text>
            </View>
          ))
        )}
      </Card>

      {generalInfoField ? (
        <Card style={{ gap: spacing.xs }}>
          <Text style={[heading, generated]}>{generalInfoField.label}</Text>
          {client.fields.general_info ? (
            <Text style={[value, generated]}>{String(client.fields.general_info)}</Text>
          ) : (
            <Text style={{ ...value, color: colors.textSecondary }}>{t("board.detailGeneralInfoEmpty")}</Text>
          )}
        </Card>
      ) : null}

      <Card style={{ gap: spacing.sm }}>
        <Text style={heading}>{t("board.historyTitle")}</Text>
        <TextInput
          value={entry}
          onChangeText={setEntry}
          placeholder={t("board.historyPlaceholder")}
          placeholderTextColor={colors.textSecondary}
          accessibilityLabel={t("board.historyPlaceholder")}
          multiline
          textAlignVertical="top"
          editable={!busy}
          style={{
            minHeight: 72,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radii.md,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm + 2,
            color: colors.textPrimary,
            fontFamily: typography.fontFamilyBody,
            fontSize: typography.sizes.md,
            backgroundColor: colors.background,
          }}
        />
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Button
              label={t("board.historyAddNote")}
              variant="secondary"
              onPress={() => log("note")}
              loading={busy === "note"}
              disabled={!entry.trim() || Boolean(busy)}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button label={t("board.historyLogSession")} onPress={() => log("session")} loading={busy === "session"} disabled={Boolean(busy)} />
          </View>
        </View>

        {activities.length === 0 ? (
          <Text style={{ ...value, color: colors.textSecondary }}>{t("board.historyEmpty")}</Text>
        ) : (
          activities.map((activity) => (
            <View key={activity.id} style={{ flexDirection: "row", gap: spacing.sm, paddingTop: spacing.xs }}>
              <Ionicons name={activityIcon[activity.kind]} size={18} color={colors.textSecondary} style={{ marginTop: 2 }} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={label}>
                  {activityLabel(activity)} · {formatDateTime(activity.createdAt, i18n.language)}
                </Text>
                {activity.text ? (
                  <Text style={value}>{activity.text}</Text>
                ) : activity.kind === "session" ? (
                  <Text style={{ ...value, color: colors.textSecondary }}>{t("board.historySessionNoText")}</Text>
                ) : null}
              </View>
            </View>
          ))
        )}
      </Card>

      {confirmingDelete ? (
        <ConfirmationCard
          title={t("board.deleteConfirmTitle", { name: client.name })}
          message={t("board.deleteConfirmBody")}
          primaryActionLabel={t("board.deleteConfirm")}
          onPrimaryAction={remove}
          secondaryActionLabel={t("common.cancel")}
          onSecondaryAction={() => setConfirmingDelete(false)}
          busy={busy === "delete"}
        />
      ) : (
        <Button label={t("board.deleteClient")} variant="ghost" onPress={() => setConfirmingDelete(true)} disabled={Boolean(busy)} />
      )}
    </ScreenContainer>
  );
}
