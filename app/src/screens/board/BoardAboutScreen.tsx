import React, { useEffect, useState } from "react";
import { ActivityIndicator, Text } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../theme";
import { Button, ScreenContainer } from "../../components";
import { fetchBoard, type Board } from "../../api/board";
import { extractErrorMessage } from "../../api/client";
import { BoardHeader } from "./BoardHeader";
import { BoardOverview } from "./BoardOverview";
import type { BoardNav } from "./BoardNavigator";

export function BoardAboutScreen() {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const navigation = useNavigation<BoardNav>();
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    fetchBoard()
      .then(setBoard)
      .catch((err) => setError(extractErrorMessage(err)));
  }, []);

  return (
    <ScreenContainer>
      <BoardHeader title={t("board.aboutTitle")} onBack={() => navigation.goBack()} />
      {error ? (
        <>
          <Text style={{ color: colors.danger, fontFamily: typography.fontFamilyBody, fontSize: typography.sizes.sm }}>{error}</Text>
          <Button label={t("common.retry")} variant="secondary" onPress={() => navigation.goBack()} />
        </>
      ) : board ? (
        <BoardOverview board={board} showDescription />
      ) : (
        <ActivityIndicator color={colors.accentPrimary} />
      )}
    </ScreenContainer>
  );
}
