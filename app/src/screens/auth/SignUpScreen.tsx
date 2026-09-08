import React, { useState } from "react";
import { Text } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../theme";
import { useAuth } from "../../context/AuthContext";
import { ScreenContainer, TextField, Button } from "../../components";
import { extractErrorMessage } from "../../api/client";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "../../navigation/RootNavigator";

type Props = NativeStackScreenProps<AuthStackParamList, "SignUp">;

export function SignUpScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { colors, typography, spacing } = useTheme();
  const { signUp } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(undefined);
    setSubmitting(true);
    try {
      await signUp(name.trim(), email.trim(), password);
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
        {t("auth.signup.title")}
      </Text>
      <Text
        style={{
          color: colors.textSecondary,
          fontFamily: typography.fontFamilyBody,
          fontSize: typography.sizes.md,
          marginBottom: spacing.md,
        }}
      >
        {t("auth.signup.subtitle")}
      </Text>

      <TextField label={t("auth.signup.nameLabel")} value={name} onChangeText={setName} autoComplete="name" />
      <TextField
        label={t("auth.signup.emailLabel")}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
      />
      <TextField
        label={t("auth.signup.passwordLabel")}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="password-new"
        errorMessage={error}
      />
      <Text
        style={{
          color: colors.textSecondary,
          fontFamily: typography.fontFamilyBody,
          fontSize: typography.sizes.xs,
        }}
      >
        {t("auth.signup.passwordHint")}
      </Text>

      <Button
        label={t("auth.signup.submit")}
        onPress={handleSubmit}
        loading={submitting}
        disabled={!name || !email || password.length < 8}
      />

      <Text
        onPress={() => navigation.navigate("Login")}
        accessibilityRole="link"
        style={{
          color: colors.accentPrimary,
          fontFamily: typography.fontFamilyBodyMedium,
          fontSize: typography.sizes.sm,
          textAlign: "center",
          marginTop: spacing.sm,
        }}
      >
        {t("auth.signup.switchPrompt")} {t("auth.signup.switchAction")}
      </Text>
    </ScreenContainer>
  );
}
