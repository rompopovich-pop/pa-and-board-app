import React from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../theme";
import { Card, Chip } from "../../components";
import type { Board } from "../../api/board";
import { generatedTextStyle, statusColor } from "./boardText";

// What the engine built, in plain words: shown right after generation and
// again under "About this board". Everything generated (labels, statuses,
// summary) is rendered in the description's own language/direction.
interface BoardOverviewProps {
  board: Board;
  showDescription?: boolean;
}

export function BoardOverview({ board, showDescription = false }: BoardOverviewProps) {
  const { t } = useTranslation();
  const { colors, spacing, typography } = useTheme();
  const generated = generatedTextStyle(board.business.language);

  const heading = {
    color: colors.textPrimary,
    fontFamily: typography.fontFamilyHeadingSemiBold,
    fontSize: typography.sizes.md,
  } as const;
  const body = {
    color: colors.textPrimary,
    fontFamily: typography.fontFamilyBody,
    fontSize: typography.sizes.md,
    lineHeight: typography.sizes.md * 1.45,
  } as const;
  const secondary = {
    color: colors.textSecondary,
    fontFamily: typography.fontFamilyBody,
    fontSize: typography.sizes.sm,
    lineHeight: typography.sizes.sm * 1.4,
  } as const;

  return (
    <View style={{ gap: spacing.md }}>
      <Card style={{ gap: spacing.sm }}>
        <Text style={[heading, generated]}>{board.business.name}</Text>
        <Text style={[body, generated]}>{board.summary}</Text>
        {board.assumptions ? (
          <View style={{ gap: spacing.xs, marginTop: spacing.xs }}>
            <Text style={{ ...secondary, fontFamily: typography.fontFamilyBodyMedium }}>{t("board.overviewAssumptions")}</Text>
            <Text style={[secondary, generated]}>{board.assumptions}</Text>
          </View>
        ) : null}
      </Card>

      <Card style={{ gap: spacing.sm }}>
        <Text style={heading}>{t("board.overviewFields", { noun: board.clientNoun })}</Text>
        {/* What each field is for, in the engine's own words - an owner
            reading their new board wants a reason, not a data type. */}
        {board.fields.map((field) => (
          <View key={field.key} style={{ gap: 2 }}>
            <Text style={[{ ...body, fontFamily: typography.fontFamilyBodyMedium }, generated]}>{field.label}</Text>
            {field.hint ? <Text style={[secondary, generated]}>{field.hint}</Text> : null}
            {field.type === "select" ? <Text style={[secondary, generated]}>{field.options.join(" · ")}</Text> : null}
          </View>
        ))}
      </Card>

      <Card style={{ gap: spacing.sm }}>
        <Text style={heading}>{t("board.overviewStatuses")}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {board.statuses.map((status) => (
            <Chip key={status.key} label={status.label} color={statusColor(colors, status.tone)} />
          ))}
        </View>
      </Card>

      {board.followUpRule ? (
        <Card style={{ gap: spacing.sm }}>
          <Text style={heading}>{t("board.overviewFollowUp")}</Text>
          <Text style={[body, generated]}>{board.followUpRule.description}</Text>
          <Text style={secondary}>{t("board.overviewFollowUpNote")}</Text>
        </Card>
      ) : null}

      {showDescription ? (
        <Card style={{ gap: spacing.sm }}>
          <Text style={heading}>{t("board.overviewDescription")}</Text>
          <Text style={[body, generated]}>{board.business.description}</Text>
        </Card>
      ) : null}
    </View>
  );
}
