import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme";
import { Button } from "./Button";

/**
 * The one recognizable "this needs your OK" pattern reused across both
 * products (design-ux-localization-spec.md sections 1-2): booking options,
 * an ambiguous email draft, an outreach request about to go out, a
 * suggested Board follow-up. A distinct attention-colored accent bar makes
 * it visually unmistakable from a normal chat bubble or list item.
 *
 * Pass `options` for the "present 2-4 choices, wait for an explicit pick"
 * variant (pa-whatsapp-spec.md section 7, Phase 3); omit them for the
 * simple approve/dismiss form.
 */

export interface ConfirmationOption {
  id: string;
  title: string;
  summary?: string;
  price?: string;
  url?: string;
  details?: string;
}

interface ConfirmationCardProps {
  title: string;
  message?: string;
  footnote?: string;
  options?: ConfirmationOption[];
  selectedOptionId?: string;
  onSelectOption?: (optionId: string) => void;
  onOpenOptionLink?: (url: string) => void;
  openLinkLabel?: string;
  primaryActionLabel: string;
  onPrimaryAction: () => void;
  primaryDisabled?: boolean;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  busy?: boolean;
}

function OptionRow({
  option,
  index,
  selected,
  onSelect,
  onOpenLink,
  openLinkLabel,
}: {
  option: ConfirmationOption;
  index: number;
  selected: boolean;
  onSelect?: (optionId: string) => void;
  onOpenLink?: (url: string) => void;
  openLinkLabel?: string;
}) {
  const { colors, spacing, radii, typography } = useTheme();

  return (
    <Pressable
      onPress={() => onSelect?.(option.id)}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${index + 1}. ${option.title}`}
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: spacing.sm,
        padding: spacing.md,
        borderRadius: radii.md,
        borderWidth: 1,
        borderColor: selected ? colors.accentPrimary : colors.border,
        backgroundColor: selected ? colors.surfaceAlt : colors.surface,
      }}
    >
      <Ionicons
        name={selected ? "radio-button-on" : "radio-button-off"}
        size={20}
        color={selected ? colors.accentPrimary : colors.textSecondary}
      />
      <View style={{ flex: 1, gap: spacing.xs / 2 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: spacing.sm }}>
          <Text
            style={{
              flex: 1,
              color: colors.textPrimary,
              fontFamily: typography.fontFamilyBodyMedium,
              fontSize: typography.sizes.md,
            }}
          >
            {option.title}
          </Text>
          {option.price ? (
            <Text
              style={{
                color: colors.accentPrimary,
                fontFamily: typography.fontFamilyHeadingSemiBold,
                fontSize: typography.sizes.md,
              }}
            >
              {option.price}
            </Text>
          ) : null}
        </View>
        {option.summary ? (
          <Text
            style={{
              color: colors.textSecondary,
              fontFamily: typography.fontFamilyBody,
              fontSize: typography.sizes.sm,
              lineHeight: typography.sizes.sm * 1.4,
            }}
          >
            {option.summary}
          </Text>
        ) : null}
        {option.details ? (
          <Text
            style={{
              color: colors.textSecondary,
              fontFamily: typography.fontFamilyBody,
              fontSize: typography.sizes.xs,
              lineHeight: typography.sizes.xs * 1.4,
            }}
          >
            {option.details}
          </Text>
        ) : null}
        {option.url && onOpenLink && openLinkLabel ? (
          <Text
            onPress={() => onOpenLink(option.url as string)}
            accessibilityRole="link"
            style={{
              color: colors.accentSecondary,
              fontFamily: typography.fontFamilyBodyMedium,
              fontSize: typography.sizes.sm,
              marginTop: spacing.xs / 2,
            }}
          >
            {openLinkLabel}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export function ConfirmationCard({
  title,
  message,
  footnote,
  options,
  selectedOptionId,
  onSelectOption,
  onOpenOptionLink,
  openLinkLabel,
  primaryActionLabel,
  onPrimaryAction,
  primaryDisabled,
  secondaryActionLabel,
  onSecondaryAction,
  busy,
}: ConfirmationCardProps) {
  const { colors, spacing, radii, typography, shadow } = useTheme();

  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderRadius: radii.lg,
          borderColor: colors.border,
        },
        shadow.card,
      ]}
    >
      <View
        style={[
          styles.accentBar,
          { backgroundColor: colors.attention, borderTopStartRadius: radii.lg, borderBottomStartRadius: radii.lg },
        ]}
      />
      <View style={[styles.body, { padding: spacing.lg, gap: spacing.sm }]}>
        <Text
          style={{
            color: colors.textPrimary,
            fontFamily: typography.fontFamilyHeadingSemiBold,
            fontSize: typography.sizes.lg,
          }}
        >
          {title}
        </Text>
        {message ? (
          <Text
            style={{
              color: colors.textSecondary,
              fontFamily: typography.fontFamilyBody,
              fontSize: typography.sizes.md,
              lineHeight: typography.sizes.md * 1.4,
            }}
          >
            {message}
          </Text>
        ) : null}

        {options?.length ? (
          <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
            {options.map((option, index) => (
              <OptionRow
                key={option.id}
                option={option}
                index={index}
                selected={selectedOptionId === option.id}
                onSelect={onSelectOption}
                onOpenLink={onOpenOptionLink}
                openLinkLabel={openLinkLabel}
              />
            ))}
          </View>
        ) : null}

        {footnote ? (
          <Text
            style={{
              color: colors.textSecondary,
              fontFamily: typography.fontFamilyBody,
              fontSize: typography.sizes.xs,
              lineHeight: typography.sizes.xs * 1.4,
              marginTop: spacing.xs / 2,
            }}
          >
            {footnote}
          </Text>
        ) : null}

        <View style={[styles.actions, { gap: spacing.sm, marginTop: spacing.sm }]}>
          <View style={{ flex: 1 }}>
            <Button
              label={primaryActionLabel}
              onPress={onPrimaryAction}
              variant="primary"
              disabled={primaryDisabled}
              loading={busy}
            />
          </View>
          {secondaryActionLabel && onSecondaryAction ? (
            <View style={{ flex: 1 }}>
              <Button
                label={secondaryActionLabel}
                onPress={onSecondaryAction}
                variant="secondary"
                disabled={busy}
              />
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    borderWidth: 1,
    overflow: "hidden",
  },
  accentBar: {
    width: 6,
  },
  body: {
    flex: 1,
  },
  actions: {
    flexDirection: "row",
  },
});
