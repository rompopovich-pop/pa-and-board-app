import React, { useCallback, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../theme";
import { Button, ScreenContainer } from "../../components";
import { fetchBoard, type Board } from "../../api/board";
import { extractErrorMessage } from "../../api/client";
import { BoardSetupScreen } from "./BoardSetupScreen";
import { ClientListScreen } from "./ClientListScreen";

// Entry point of "Business Board" mode: no board yet -> the one-text-box
// setup; otherwise the client list (business-board-spec.md section 2).
export function BoardHomeScreen() {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  // undefined = not loaded yet, null = no board yet.
  const [board, setBoard] = useState<Board | null | undefined>(undefined);
  const [error, setError] = useState<string | undefined>();

  const load = useCallback(async () => {
    try {
      setError(undefined);
      setBoard(await fetchBoard());
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (board === undefined) {
    return (
      <ScreenContainer>
        {error ? (
          <>
            <Text style={{ color: colors.danger, fontFamily: typography.fontFamilyBody, fontSize: typography.sizes.sm }}>{error}</Text>
            <Button label={t("common.retry")} variant="secondary" onPress={load} />
          </>
        ) : (
          <View style={{ flex: 1, justifyContent: "center" }}>
            <ActivityIndicator size="large" color={colors.accentPrimary} />
          </View>
        )}
      </ScreenContainer>
    );
  }

  if (board === null) {
    return <BoardSetupScreen onReady={setBoard} />;
  }

  return <ClientListScreen board={board} />;
}
