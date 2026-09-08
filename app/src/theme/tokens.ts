/**
 * Design tokens — single source of truth for the "Warm & Personal" visual
 * direction (design-ux-localization-spec.md section 4/6). Every screen
 * should consume these tokens rather than hardcoding colors, spacing, or
 * radii, so a future palette/shape change is a one-file edit.
 *
 * Accent color is terracotta with sage as a secondary accent — a reasonable
 * v1 default per spec section 7 ("worth a quick visual mockup pass"), easy
 * to swap here later.
 */

export const colors = {
  // Warm neutrals
  background: "#FBF3EA",
  surface: "#FFFFFF",
  surfaceAlt: "#F6E9DA",
  border: "#EAD9C4",

  // Text
  textPrimary: "#3A2E27",
  textSecondary: "#8A7768",
  textOnAccent: "#FFFFFF",

  // Accents
  accentPrimary: "#D96C4C", // terracotta — primary actions
  accentPrimaryPressed: "#C15A3C",
  accentSecondary: "#7FA684", // sage — secondary accent / positive states
  accentSecondaryPressed: "#6B9070",

  // Semantic / status (Board's "status at a glance" needs, spec section 2)
  statusNew: "#7FA684",
  statusActive: "#4E8B8B",
  statusNeedsFollowUp: "#E3A857",
  statusInactive: "#B8A99A",
  danger: "#C1544A",

  // Confirmation card ("needs your OK") accent
  attention: "#E3A857",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
} as const;

export const radii = {
  sm: 10,
  md: 16,
  lg: 24,
  pill: 999,
} as const;

export const typography = {
  fontFamilyHeading: "Nunito_800ExtraBold",
  fontFamilyHeadingSemiBold: "Nunito_700Bold",
  fontFamilyBody: "Nunito_400Regular",
  fontFamilyBodyMedium: "Nunito_600SemiBold",
  sizes: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 20,
    xl: 24,
    xxl: 30,
  },
} as const;

export const shadow = {
  card: {
    shadowColor: "#3A2E27",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
} as const;

export const theme = { colors, spacing, radii, typography, shadow };

export type Theme = typeof theme;
