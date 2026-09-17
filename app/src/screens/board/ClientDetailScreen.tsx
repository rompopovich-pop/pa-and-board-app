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
  type BoardField,
  type ClientActivity,
} from "../../api/board";
import { extractErrorMessage } from "../../api/client";
import { callNumber, openWhatsApp } from "../../utils/phone";
import { BoardHeader } from "./BoardHeader";
import type { BoardNav, BoardStackParamList } from "./BoardNavigator";
import { formatDateTime, formatFieldValue, generatedTextStyle, statusColor } from "./boardText";

// The full client record on one screen (business-board-spec.md section 6,
// Phase 1): status, the structured fields, the owner's free notes, and the
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
  const [busy, setBusy] = useState<"status" | "note" | "session" | "delete" | "notes" | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");

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

  // The notes field is edited straight from the record - it's the thing an
  // owner adds to most often, and making them open the whole edit form for
  // one sentence is the kind of friction that stops them bothering.
  async function saveNotes() {
    if (!client || busy) return;
    setBusy("notes");
    setError(undefined);
    try {
      setClient(await updateClient(client.id, { fields: { general_info: notesDraft } }));
      setEditingNotes(false);
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
  const secondary = { color: colors.textSecondary, fontFamily: typography.fontFamilyBody, fontSize: typography.sizes.sm } as const;

  const notesField = board.fields.find((field) => field.key === "general_info");
  const notesValue = typeof client.fields.general_info === "string" ? client.fields.general_info : "";
  const detailFields = board.fields.filter((field) => !field.isSystem);
  const filledFields = detailFields.filter((field) => formatFieldValue(field, client.fields[field.key], t, i18n.language) !== "");
  const sessionLabel = board.sessionNoun || t("board.sessionNounFallback");

  function activityLabel(activity: ClientActivity): string {
    switch (activity.kind) {
      case "created":
        return t("board.historyCreated");
      case "status_change":
        return t("board.historyStatusChanged");
      case "session":
        // "groom" reads as "Groom" in the log, next to "Note"; Hebrew and
        // other non-cased scripts are unaffected by this.
        return sessionLabel.charAt(0).toUpperCase() + sessionLabel.slice(1);
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

  /** A phone number the owner can act on: one tap to ring, one to open WhatsApp. */
  function PhoneRow({ field, raw }: { field: BoardField; raw: string }) {
    const action = {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: spacing.xs + 2,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.pill,
      paddingVertical: spacing.xs + 2,
      paddingHorizontal: spacing.md,
      backgroundColor: colors.surfaceAlt,
    };
    return (
      <View style={{ gap: spacing.xs }}>
        <Text style={[label, generated]}>{field.label}</Text>
        <Text style={value}>{raw}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: 2 }}>
          <Pressable
            onPress={() => callNumber(raw)}
            accessibilityRole="button"
            accessibilityLabel={t("board.phoneCallLabel", { name: client?.name ?? "" })}
            style={({ pressed }) => [action, { opacity: pressed ? 0.8 : 1 }]}
          >
            <Ionicons name="call-outline" size={16} color={colors.accentPrimary} />
            <Text style={{ color: colors.textPrimary, fontFamily: typography.fontFamilyBodyMedium, fontSize: typography.sizes.sm }}>
              {t("board.phoneCall")}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => openWhatsApp(raw)}
            accessibilityRole="button"
            accessibilityLabel={t("board.phoneWhatsAppLabel", { name: client?.name ?? "" })}
            style={({ pressed }) => [action, { opacity: pressed ? 0.8 : 1 }]}
          >
            <Ionicons name="logo-whatsapp" size={16} color={colors.accentSecondary} />
            <Text style={{ color: colors.textPrimary, fontFamily: typography.fontFamilyBodyMedium, fontSize: typography.sizes.sm }}>
              {t("board.phoneWhatsApp")}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

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

      <Card style={{ gap: spacing.md }}>
        <Text style={heading}>{t("board.detailDetails")}</Text>
        {filledFields.length === 0 ? (
          <Text style={{ ...value, color: colors.textSecondary }}>{t("board.detailNoDetails")}</Text>
        ) : (
          filledFields.map((field) => {
            const shown = formatFieldValue(field, client.fields[field.key], t, i18n.language);
            if (field.type === "phone") return <PhoneRow key={field.key} field={field} raw={shown} />;
            return (
              <View key={field.key} style={{ gap: 2 }}>
                <Text style={[label, generated]}>{field.label}</Text>
                <Text style={[value, generated]}>{shown}</Text>
              </View>
            );
          })
        )}
      </Card>

      {/* One free-text area per client, edited in place. The history log
          below is for things that happened on a day; this is for what stays
          true about the person. */}
      {notesField ? (
        <Card style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <Text style={[{ ...heading, flex: 1 }, generated]}>{notesField.label}</Text>
            {!editingNotes ? (
              <Pressable
                onPress={() => {
                  setNotesDraft(notesValue);
                  setEditingNotes(true);
                }}
                accessibilityRole="button"
                accessibilityLabel={t("board.notesEdit")}
                hitSlop={8}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
              >
                <Text style={{ color: colors.accentPrimary, fontFamily: typography.fontFamilyBodyMedium, fontSize: typography.sizes.sm }}>
                  {notesValue ? t("board.notesEdit") : t("board.notesAdd")}
                </Text>
              </Pressable>
            ) : null}
          </View>
          <Text style={secondary}>{t("board.notesExplainer")}</Text>

          {editingNotes ? (
            <>
              <TextInput
                value={notesDraft}
                onChangeText={setNotesDraft}
                placeholder={t("board.notesPlaceholder")}
                placeholderTextColor={colors.textSecondary}
                accessibilityLabel={notesField.label}
                multiline
                textAlignVertical="top"
                editable={busy !== "notes"}
                autoFocus
                style={{
                  minHeight: 110,
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
                    label={t("common.cancel")}
                    variant="secondary"
                    onPress={() => setEditingNotes(false)}
                    disabled={busy === "notes"}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button label={t("board.notesSave")} onPress={saveNotes} loading={busy === "notes"} />
                </View>
              </View>
            </>
          ) : notesValue ? (
            <Text style={[value, generated]}>{notesValue}</Text>
          ) : (
            <Text style={{ ...value, color: colors.textSecondary }}>{t("board.notesEmpty")}</Text>
          )}
        </Card>
      ) : null}

      <Card style={{ gap: spacing.sm }}>
        <Text style={heading}>{t("board.historyTitle")}</Text>
        <Text style={secondary}>{t("board.historyExplainer", { session: sessionLabel })}</Text>
        <TextInput
          value={entry}
          onChangeText={setEntry}
          placeholder={t("board.historyPlaceholder", { session: sessionLabel })}
          placeholderTextColor={colors.textSecondary}
          accessibilityLabel={t("board.historyPlaceholder", { session: sessionLabel })}
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
        {/* Stacked rather than side by side: "Log a callout" has to fit on
            one line whatever the business calls its work. */}
        <View style={{ gap: spacing.sm }}>
          <Button
            label={t("board.historyLogSession", { session: sessionLabel })}
            onPress={() => log("session")}
            loading={busy === "session"}
            disabled={Boolean(busy)}
          />
          <Button
            label={t("board.historyAddNote")}
            variant="secondary"
            onPress={() => log("note")}
            loading={busy === "note"}
            disabled={!entry.trim() || Boolean(busy)}
          />
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
                  <Text style={{ ...value, color: colors.textSecondary }}>{t("board.historySessionNoText", { session: sessionLabel })}</Text>
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
