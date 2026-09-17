import React, { useState } from "react";
import { I18nManager, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { useTheme } from "../theme";
import { Button } from "./Button";

/**
 * A date input that never asks anyone to type a date. Tapping it opens the
 * platform's own picker - Android's calendar dialog, iOS's wheel in a sheet,
 * the browser's date control on web - and the value is shown back in the
 * reader's own long date format ("18 Sept 2026"), never as YYYY-MM-DD.
 *
 * The stored value stays the ISO calendar day the backend validates, but
 * that format is an implementation detail the owner never sees or types.
 */

interface DateFieldProps {
  label: string;
  /** ISO calendar day ("2026-09-18") or "" when unset. */
  value: string;
  onChange: (isoDate: string) => void;
  errorMessage?: string;
  disabled?: boolean;
}

/** "2026-09-18" -> a Date at local noon, so no timezone shifts the day. */
function toDate(isoDate: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    const parsed = new Date(`${isoDate}T12:00:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

function toIso(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function DateField({ label, value, onChange, errorMessage, disabled = false }: DateFieldProps) {
  const { t, i18n } = useTranslation();
  const { colors, spacing, radii, typography } = useTheme();
  const [iosPickerOpen, setIosPickerOpen] = useState(false);
  const [iosDraft, setIosDraft] = useState<Date>(() => toDate(value));

  const locale = i18n.language.startsWith("he") ? "he-IL" : "en-GB";
  const display = value
    ? toDate(value).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "long", year: "numeric" })
    : "";

  function openPicker() {
    if (disabled) return;
    if (Platform.OS === "android") {
      // Android's own calendar dialog, opened imperatively.
      DateTimePickerAndroid.open({
        value: toDate(value),
        mode: "date",
        onChange: (event, selected) => {
          if (event.type === "set" && selected) onChange(toIso(selected));
        },
      });
      return;
    }
    setIosDraft(toDate(value));
    setIosPickerOpen(true);
  }

  const fieldLabel = (
    <Text style={{ color: colors.textSecondary, fontFamily: typography.fontFamilyBodyMedium, fontSize: typography.sizes.sm }}>
      {label}
    </Text>
  );

  // On web, react-native-web renders through React DOM, so the browser's own
  // date control is available and is the right "native picker" for that
  // platform. The app targets iOS/Android; this keeps the web preview honest.
  if (Platform.OS === "web") {
    const WebInput = "input" as unknown as React.ElementType;
    return (
      <View style={{ gap: spacing.xs }}>
        {fieldLabel}
        <WebInput
          type="date"
          value={value}
          disabled={disabled}
          aria-label={label}
          onChange={(event: { target: { value: string } }) => onChange(event.target.value)}
          style={{
            borderWidth: 1,
            borderStyle: "solid",
            borderColor: errorMessage ? colors.danger : colors.border,
            borderRadius: radii.md,
            paddingInline: spacing.md,
            paddingBlock: spacing.sm + 2,
            color: value ? colors.textPrimary : colors.textSecondary,
            fontFamily: typography.fontFamilyBody,
            fontSize: typography.sizes.md,
            backgroundColor: colors.surface,
            direction: I18nManager.isRTL ? "rtl" : "ltr",
          }}
        />
        {errorMessage ? (
          <Text style={{ color: colors.danger, fontFamily: typography.fontFamilyBody, fontSize: typography.sizes.xs }}>{errorMessage}</Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.xs }}>
      {fieldLabel}
      <Pressable
        onPress={openPicker}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={value ? `${label}: ${display}` : label}
        accessibilityHint={t("board.formDateHint")}
        style={({ pressed }) => [
          styles.field,
          {
            borderColor: errorMessage ? colors.danger : colors.border,
            borderRadius: radii.md,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm + 4,
            gap: spacing.sm,
            backgroundColor: colors.surface,
            opacity: disabled ? 0.6 : pressed ? 0.85 : 1,
          },
        ]}
      >
        <Ionicons name="calendar-outline" size={20} color={colors.textSecondary} />
        <Text
          style={{
            flex: 1,
            color: value ? colors.textPrimary : colors.textSecondary,
            fontFamily: typography.fontFamilyBody,
            fontSize: typography.sizes.md,
          }}
        >
          {display || t("board.formDatePlaceholder")}
        </Text>
        {value ? (
          <Pressable
            onPress={() => onChange("")}
            accessibilityRole="button"
            accessibilityLabel={t("board.formDateClear")}
            hitSlop={10}
          >
            <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </Pressable>
      {errorMessage ? (
        <Text style={{ color: colors.danger, fontFamily: typography.fontFamilyBody, fontSize: typography.sizes.xs }}>{errorMessage}</Text>
      ) : null}

      {/* iOS: the wheel/calendar in a sheet, so the choice is confirmed
          rather than committed on every scroll tick. */}
      <Modal visible={iosPickerOpen} transparent animationType="slide" onRequestClose={() => setIosPickerOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setIosPickerOpen(false)}>
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{
              backgroundColor: colors.surface,
              borderTopStartRadius: radii.lg,
              borderTopEndRadius: radii.lg,
              padding: spacing.lg,
              gap: spacing.md,
            }}
          >
            <Text
              style={{
                color: colors.textPrimary,
                fontFamily: typography.fontFamilyHeadingSemiBold,
                fontSize: typography.sizes.lg,
                textAlign: "center",
              }}
            >
              {label}
            </Text>
            <DateTimePicker
              value={iosDraft}
              mode="date"
              display="inline"
              locale={locale}
              accentColor={colors.accentPrimary}
              themeVariant="light"
              onChange={(_event, selected) => {
                if (selected) setIosDraft(selected);
              }}
            />
            <Button
              label={t("board.formDateDone")}
              onPress={() => {
                onChange(toIso(iosDraft));
                setIosPickerOpen(false);
              }}
            />
            <Button label={t("common.cancel")} variant="ghost" onPress={() => setIosPickerOpen(false)} />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
  },
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(58, 46, 39, 0.35)",
  },
});
