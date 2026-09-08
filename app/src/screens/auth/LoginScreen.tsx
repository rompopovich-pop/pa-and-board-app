import React, { useState } from "react";
import { Text } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../theme";
import { useAuth } from "../../context/AuthContext";
import { ScreenContainer, TextField, Button } from "../../components";
import { extractErrorMessage } from "../../api/client";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "../../navigation/RootNavigator";

type Props = NativeStackScreenProps<AuthStackParamList, "Login">;

export function LoginScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { colors, typography, spacing } = useTheme();
  const { logIn } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(undefined);
    setSubmitting(true);
    try {
      await logIn(email.trim(), password);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScreenContainer>
      <Text
        style={{
          color: colors.textPrimary,
          fontFamily: typography.fontFamilyHeading,
          fontSize: typography.sizes.xxl,
        }}
      >
        {t("auth.login.title")}
      </Text>
      <Text
        style={{
          color: colors.textSecondary,
          fontFamily: typography.fontFamilyBody,
          fontSize: typography.sizes.md,
          marginBottom: spacing.md,
        }}
      >
        {t("auth.login.subtitle")}
      </Text>

      <TextField
        label={t("auth.login.emailLabel")}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
      />
      <TextField
        label={t("auth.login.passwordLabel")}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="password"
        errorMessage={error}
      />

      <Button label={t("auth.login.submit")} onPress={handleSubmit} loading={submitting} disabled={!email || !password} />

      <Text
        onPress={() => navigation.navigate("SignUp")}
        accessibilityRole="link"
        style={{
          color: colors.accentPrimary,
          fontFamily: typography.fontFamilyBodyMedium,
          fontSize: typography.sizes.sm,
          textAlign: "center",
          marginTop: spacing.sm,
        }}
      >
        {t("auth.login.switchPrompt")} {t("auth.login.switchAction")}
      </Text>
    </ScreenContainer>
  );
}
