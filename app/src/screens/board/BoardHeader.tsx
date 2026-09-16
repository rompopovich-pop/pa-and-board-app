import React from "react";
import { I18nManager, Pressable, Text, TextStyle, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../theme";

// Screen header for Board mode: back chevron (flipped under RTL), a title
// that may be generated text in another language, and an optional action.
interface BoardHeaderProps {
  title: string;
  subtitle?: string;
  titleStyle?: TextStyle;
  onBack?: () => void;
  right?: React.ReactNode;
}

export function BoardHeader({ title, subtitle, titleStyle, onBack, right }: BoardHeaderProps) {
  const { t } = useTranslation();
  const { colors, spacing, typography } = useTheme();

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={t("board.back")}
          hitSlop={8}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, padding: spacing.xs })}
        >
          <Ionicons name={I18nManager.isRTL ? "chevron-forward" : "chevron-back"} size={26} color={colors.textPrimary} />
        </Pressable>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          numberOfLines={1}
          style={[
            {
              color: colors.textPrimary,
              fontFamily: typography.fontFamilyHeading,
              fontSize: typography.sizes.xl,
            },
            titleStyle,
          ]}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={{
              color: colors.textSecondary,
              fontFamily: typography.fontFamilyBody,
              fontSize: typography.sizes.sm,
            }}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}
