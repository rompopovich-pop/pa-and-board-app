import React from "react";
import { createNativeStackNavigator, type NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTheme } from "../../theme";
import { BoardHomeScreen } from "./BoardHomeScreen";
import { BoardAboutScreen } from "./BoardAboutScreen";
import { ClientDetailScreen } from "./ClientDetailScreen";
import { ClientFormScreen } from "./ClientFormScreen";

export type BoardStackParamList = {
  BoardHome: undefined;
  BoardAbout: undefined;
  ClientDetail: { clientId: string };
  ClientForm: { clientId?: string };
};

export type BoardNav = NativeStackNavigationProp<BoardStackParamList>;

const Stack = createNativeStackNavigator<BoardStackParamList>();

// The "Business Board" tab: its own stack so a client record and the
// add/edit form push over the list while the tab bar stays put.
export function BoardNavigator() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="BoardHome" component={BoardHomeScreen} />
      <Stack.Screen name="BoardAbout" component={BoardAboutScreen} />
      <Stack.Screen name="ClientDetail" component={ClientDetailScreen} />
      <Stack.Screen name="ClientForm" component={ClientFormScreen} />
    </Stack.Navigator>
  );
}
