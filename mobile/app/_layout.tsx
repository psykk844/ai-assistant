import { Tabs } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Tabs
        screenOptions={{
          headerTitleAlign: "center",
          tabBarActiveTintColor: "#111827",
          tabBarInactiveTintColor: "#6b7280",
        }}
      >
        <Tabs.Screen name="(tabs)/home" options={{ title: "Home" }} />
        <Tabs.Screen name="(tabs)/backlog" options={{ title: "Backlog" }} />
        <Tabs.Screen name="item/[id]" options={{ href: null, title: "Item Detail" }} />
      </Tabs>
    </SafeAreaProvider>
  );
}
