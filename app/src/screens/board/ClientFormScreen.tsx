import React, { useEffect, useState } from "react";
import { ActivityIndicator, Switch, Text, View } from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../theme";
import { Button, Chip, DateField, ScreenContainer, TextField } from "../../components";
import {
  createClient,
  extractFieldKey,
  fetchBoard,
  fetchClient,
  updateClient,
  type Board,
  type BoardField,
} from "../../api/board";
import { extractErrorMessage } from "../../api/client";
import { BoardHeader } from "./BoardHeader";
import type { BoardNav, BoardStackParamList } from "./BoardNavigator";
import { generatedTextStyle, statusColor } from "./boardText";

// Add / edit a client. The form is generated from the board's fields, so
// a therapist sees "Sessions paid for" and a hairdresser sees "Colour
// formula" without either being hardcoded here. Values are sent as typed
// and the backend coerces/validates them against the field types; a
// field-level error comes back with its key and lands under that input.
type FormValues = Record<string, string | boolean>;

function initialValues(board: Board, fields?: Record<string, unknown>): FormValues {
  const values: FormValues = {};
  for (const field of board.fields) {
    const raw = fields?.[field.key];
    if (field.type === "checkbox") values[field.key] = raw === true;
    else values[field.key] = raw === null || raw === undefined ? "" : String(raw);
  }
  return values;
}

export function ClientFormScreen() {
  const { t } = useTranslation();
  const { colors, spacing, typography } = useTheme();
  const navigation = useNavigation<BoardNav>();
  const route = useRoute<RouteProp<BoardStackParamList, "ClientForm">>();
  const clientId = route.params?.clientId;

  const [board, setBoard] = useState<Board | null>(null);
  const [values, setValues] = useState<FormValues>({});
  const [status, setStatus] = useState<string>("");
  const [clientName, setClientName] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const fetchedBoard = await fetchBoard();
        if (!fetchedBoard) throw new Error("No board yet");
        const existing = clientId ? (await fetchClient(clientId)).client : null;
        setBoard(fetchedBoard);
        setValues(initialValues(fetchedBoard, existing?.fields));
        setClientName(existing?.name ?? "");
        setStatus(existing?.status ?? (fetchedBoard.statuses.find((s) => s.tone === "new") ?? fetchedBoard.statuses[0])?.key ?? "");
      } catch (err) {
        setError(extractErrorMessage(err));
      }
    })();
  }, [clientId]);

  function setValue(key: string, value: string | boolean) {
    setValues((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  async function save() {
    if (!board || saving) return;
    setSaving(true);
    setError(undefined);
    setFieldErrors({});
    try {
      if (clientId) {
        await updateClient(clientId, { status, fields: values });
        navigation.goBack();
      } else {
        const created = await createClient({ status, fields: values });
        navigation.replace("ClientDetail", { clientId: created.id });
      }
    } catch (err) {
      const key = extractFieldKey(err);
      const message = extractErrorMessage(err);
      if (key) setFieldErrors({ [key]: message });
      else setError(message);
      setSaving(false);
    }
  }

  if (!board) {
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
  const labelStyle = { color: colors.textSecondary, fontFamily: typography.fontFamilyBodyMedium, fontSize: typography.sizes.sm } as const;

  function renderField(field: BoardField) {
    const label = field.required ? `${field.label} (${t("board.formRequired")})` : field.label;
    const errorMessage = fieldErrors[field.key];
    const current = values[field.key];

    switch (field.type) {
      case "checkbox":
        return (
          <View key={field.key} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md }}>
            <Text style={[{ ...labelStyle, flex: 1 }, generated]}>{label}</Text>
            <Switch
              value={current === true}
              onValueChange={(next) => setValue(field.key, next)}
              trackColor={{ true: colors.accentSecondary, false: colors.border }}
              thumbColor={colors.surface}
              accessibilityLabel={field.label}
            />
          </View>
        );
      case "date":
        return (
          <DateField
            key={field.key}
            label={label}
            value={typeof current === "string" ? current : ""}
            onChange={(iso) => setValue(field.key, iso)}
            errorMessage={errorMessage}
            disabled={saving}
          />
        );
      case "select":
        return (
          <View key={field.key} style={{ gap: spacing.xs }}>
            <Text style={[labelStyle, generated]}>{label}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
              {field.options.map((option) => (
                <Chip
                  key={option}
                  label={option}
                  selected={current === option}
                  onPress={() => setValue(field.key, current === option ? "" : option)}
                />
              ))}
            </View>
            {errorMessage ? (
              <Text style={{ color: colors.danger, fontFamily: typography.fontFamilyBody, fontSize: typography.sizes.xs }}>{errorMessage}</Text>
            ) : null}
          </View>
        );
      default:
        return (
          <TextField
            key={field.key}
            label={label}
            value={typeof current === "string" ? current : ""}
            onChangeText={(text) => setValue(field.key, text)}
            errorMessage={errorMessage}
            keyboardType={
              field.type === "number"
                ? "decimal-pad"
                : field.type === "phone"
                  ? "phone-pad"
                  : field.type === "email"
                    ? "email-address"
                    : "default"
            }
            autoCapitalize={field.type === "email" ? "none" : "sentences"}
            multiline={field.type === "long_text"}
            textAlignVertical={field.type === "long_text" ? "top" : undefined}
            style={field.type === "long_text" ? { minHeight: 110 } : undefined}
            editable={!saving}
          />
        );
    }
  }

  const nameField = board.fields.find((field) => field.key === "name");
  const generalInfoField = board.fields.find((field) => field.key === "general_info");
  const otherFields = board.fields.filter((field) => !field.isSystem);

  return (
    <ScreenContainer>
      <BoardHeader
        title={clientId ? t("board.formTitleEdit", { name: clientName }) : t("board.formTitleNew", { noun: board.clientNoun })}
        onBack={() => navigation.goBack()}
      />

      {nameField ? renderField(nameField) : null}

      <View style={{ gap: spacing.xs }}>
        <Text style={labelStyle}>{t("board.formStatus")}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {board.statuses.map((option) => (
            <Chip
              key={option.key}
              label={option.label}
              color={statusColor(colors, option.tone)}
              selected={status === option.key}
              onPress={() => setStatus(option.key)}
            />
          ))}
        </View>
      </View>

      {otherFields.map(renderField)}
      {generalInfoField ? renderField(generalInfoField) : null}

      {error ? (
        <Text style={{ color: colors.danger, fontFamily: typography.fontFamilyBody, fontSize: typography.sizes.sm }}>{error}</Text>
      ) : null}

      <Button label={t("board.formSave")} onPress={save} loading={saving} />
    </ScreenContainer>
  );
}
