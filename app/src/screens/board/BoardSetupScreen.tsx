import React, { useState } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../theme";
import { Button, ScreenContainer, TextField } from "../../components";
import { generateBoard, type Board } from "../../api/board";
import { extractErrorMessage } from "../../api/client";
import { BoardOverview } from "./BoardOverview";

// The Board's whole onboarding: one text box (design spec section 2, "the
// Board's setup is one text box"). Describe the business, get a board.
// The generated board is shown once in plain words before the owner
// starts adding people, so they can see what was understood.
interface BoardSetupScreenProps {
  onReady: (board: Board) => void;
}

export function BoardSetupScreen({ onReady }: BoardSetupScreenProps) {
  const { t } = useTranslation();
  const { colors, spacing, typography } = useTheme();
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [result, setResult] = useState<Board | null>(null);

  async function submit() {
    if (!description.trim() || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      setResult(await generateBoard(description));
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <ScreenContainer>
        <Text style={{ color: colors.textPrimary, fontFamily: typography.fontFamilyHeading, fontSize: typography.sizes.xxl }}>
          {result.name}
        </Text>
        <BoardOverview board={result} />
        <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
          <Button label={t("board.overviewStart", { noun: result.clientNounPlural })} onPress={() => onReady(result)} />
          <Button
            label={t("board.overviewStartOver")}
            variant="ghost"
            onPress={() => {
              setResult(null);
            }}
          />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <Text style={{ color: colors.textPrimary, fontFamily: typography.fontFamilyHeading, fontSize: typography.sizes.xxl }}>
        {t("board.setupTitle")}
      </Text>
      <Text
        style={{
          color: colors.textSecondary,
          fontFamily: typography.fontFamilyBody,
          fontSize: typography.sizes.md,
          lineHeight: typography.sizes.md * 1.4,
        }}
      >
        {t("board.setupBody")}
      </Text>
      <TextField
        label={t("board.setupLabel")}
        placeholder={t("board.setupPlaceholder")}
        value={description}
        onChangeText={setDescription}
        multiline
        textAlignVertical="top"
        editable={!busy}
        style={{ minHeight: 160 }}
        errorMessage={error}
      />
      {busy ? (
        <Text style={{ color: colors.textSecondary, fontFamily: typography.fontFamilyBody, fontSize: typography.sizes.sm }}>
          {t("board.setupWorking")}
        </Text>
      ) : null}
      <Button label={t("board.setupSubmit")} onPress={submit} loading={busy} disabled={description.trim().length < 10} />
    </ScreenContainer>
  );
}
