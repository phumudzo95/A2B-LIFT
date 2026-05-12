import Constants from "expo-constants";

export type AppVariant = "mixed" | "driver" | "client";

export function getAppVariant(): AppVariant {
  const rawVariant = String(Constants.expoConfig?.extra?.appVariant || "").toLowerCase();

  if (rawVariant === "client") return "client";
  if (rawVariant === "driver") return "driver";
  return "mixed";
}

export function usesRoleSelect(variant = getAppVariant()): boolean {
  return variant === "mixed";
}

export function getAuthenticatedHomeRoute(variant = getAppVariant()): "/role-select" | "/client" | "/chauffeur" {
  if (variant === "client") return "/client";
  if (variant === "driver") return "/chauffeur";
  return "/role-select";
}