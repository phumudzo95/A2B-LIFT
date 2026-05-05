import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/query-client";

interface ChauffeurProfile {
  id: string;
  isApproved: boolean;
  vehicleType?: string | null;
  vehicleModel?: string | null;
}

interface LongDistanceAvailability {
  available: boolean;
  from: string;
  to: string;
  date: string;
  pricePerSeat: string;
  seatsAvailable: string;
}

const defaultAvailability: LongDistanceAvailability = {
  available: false,
  from: "",
  to: "",
  date: "",
  pricePerSeat: "",
  seatsAvailable: "3",
};

export default function ChauffeurLongDistanceScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [chauffeur, setChauffeur] = useState<ChauffeurProfile | null>(null);
  const [form, setForm] = useState<LongDistanceAvailability>(defaultAvailability);
  const [lastUpdatedLabel, setLastUpdatedLabel] = useState<string>("");

  const loadData = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [profileRes, availabilityRes] = await Promise.all([
        apiRequest("GET", `/api/chauffeurs/user/${user.id}`).catch(() => null),
        apiRequest("GET", "/api/long-distance/my-availability").catch(() => null),
      ]);

      if (profileRes) {
        const profile = await profileRes.json();
        setChauffeur(profile);
      } else {
        setChauffeur(null);
      }

      if (availabilityRes) {
        const availability = await availabilityRes.json();
        setForm({
          available: Boolean(availability?.available),
          from: availability?.from || "",
          to: availability?.to || "",
          date: availability?.date || "",
          pricePerSeat: availability?.pricePerSeat ? String(availability.pricePerSeat) : "",
          seatsAvailable: availability?.seatsAvailable ? String(availability.seatsAvailable) : "3",
        });
      } else {
        setForm(defaultAvailability);
      }
    } catch (error) {
      console.error("Failed to load long-distance availability", error);
      Alert.alert("Unable to load long-distance settings", "Please try again.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const canSave = useMemo(() => {
    if (!chauffeur?.isApproved || saving) return false;
    if (!form.available) return true;

    return (
      form.from.trim().length > 1 &&
      form.to.trim().length > 1 &&
      form.date.trim().length >= 10 &&
      Number(form.pricePerSeat) > 0 &&
      Number(form.seatsAvailable) >= 1
    );
  }, [chauffeur?.isApproved, form, saving]);

  function setField<K extends keyof LongDistanceAvailability>(key: K, value: LongDistanceAvailability[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function saveAvailability() {
    if (!chauffeur?.isApproved) {
      Alert.alert("Approval pending", "Your chauffeur profile must be approved before you can publish long-distance availability.");
      return;
    }

    if (!canSave) {
      Alert.alert("Complete your route", "Add the departure city, destination, date, seat price, and number of seats before going live.");
      return;
    }

    setSaving(true);
    try {
      await apiRequest("POST", "/api/long-distance/availability", {
        available: form.available,
        from: form.available ? form.from.trim() : undefined,
        to: form.available ? form.to.trim() : undefined,
        date: form.available ? form.date.trim() : undefined,
        pricePerSeat: form.available ? Number(form.pricePerSeat) : undefined,
        seatsAvailable: form.available ? Number(form.seatsAvailable) : undefined,
      });

      setLastUpdatedLabel(new Date().toLocaleString());
      Alert.alert(
        form.available ? "Long-distance route is live" : "Long-distance availability turned off",
        form.available ? "Riders can now find your long-distance route in search." : "Your route has been removed from public search results.",
      );
      await loadData();
    } catch (error: any) {
      Alert.alert("Could not save availability", error?.message || "Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={Colors.white} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}> 
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Pressable style={styles.backButton} onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={18} color={Colors.white} />
              <Text style={styles.backText}>Back</Text>
            </Pressable>
            <Pressable style={styles.refreshButton} onPress={loadData}>
              <Ionicons name="refresh-outline" size={16} color={Colors.white} />
            </Pressable>
          </View>

          <Text style={styles.eyebrow}>Driver tools</Text>
          <Text style={styles.title}>Long-distance availability</Text>
          <Text style={styles.subtitle}>Publish your next intercity route so riders can discover and book seats from the website.</Text>

          <View style={styles.statusCard}>
            <View style={styles.statusHeader}>
              <View>
                <Text style={styles.statusLabel}>Chauffeur status</Text>
                <Text style={styles.statusValue}>{chauffeur?.isApproved ? "Approved and ready" : "Approval required"}</Text>
              </View>
              <View style={[styles.statusBadge, chauffeur?.isApproved ? styles.statusBadgeLive : styles.statusBadgePending]}>
                <Text style={styles.statusBadgeText}>{chauffeur?.isApproved ? "LIVE" : "PENDING"}</Text>
              </View>
            </View>
            <Text style={styles.statusCopy}>
              {chauffeur
                ? chauffeur.isApproved
                  ? "You can publish a route, change your trip details, or turn availability off at any time."
                  : "Finish approval first. Once approved, this screen will let you publish route details to long-distance search."
                : "Create and complete your chauffeur profile first. Long-distance availability is only available to active chauffeurs."}
            </Text>
            {chauffeur?.vehicleType || chauffeur?.vehicleModel ? (
              <Text style={styles.vehicleCopy}>Vehicle: {[chauffeur?.vehicleType, chauffeur?.vehicleModel].filter(Boolean).join(" • ")}</Text>
            ) : null}
          </View>

          <View style={styles.toggleRow}>
            <Pressable
              style={[styles.toggleCard, form.available && styles.toggleCardActive]}
              onPress={() => setField("available", true)}
            >
              <Ionicons name="radio-button-on-outline" size={18} color={form.available ? Colors.white : Colors.textSecondary} />
              <View style={styles.toggleTextWrap}>
                <Text style={[styles.toggleTitle, form.available && styles.toggleTitleActive]}>Available for long distance</Text>
                <Text style={styles.toggleCopy}>Show this route to riders searching on your date.</Text>
              </View>
            </Pressable>
            <Pressable
              style={[styles.toggleCard, !form.available && styles.toggleCardActive]}
              onPress={() => setField("available", false)}
            >
              <Ionicons name="remove-circle-outline" size={18} color={!form.available ? Colors.white : Colors.textSecondary} />
              <View style={styles.toggleTextWrap}>
                <Text style={[styles.toggleTitle, !form.available && styles.toggleTitleActive]}>Not available</Text>
                <Text style={styles.toggleCopy}>Hide your route until you are ready to accept seats.</Text>
              </View>
            </Pressable>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.sectionTitle}>Route details</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Departure city</Text>
              <TextInput
                value={form.from}
                onChangeText={(value) => setField("from", value)}
                placeholder="Johannesburg"
                placeholderTextColor={Colors.textMuted}
                style={styles.input}
                editable={chauffeur?.isApproved}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Destination</Text>
              <TextInput
                value={form.to}
                onChangeText={(value) => setField("to", value)}
                placeholder="Durban"
                placeholderTextColor={Colors.textMuted}
                style={styles.input}
                editable={chauffeur?.isApproved}
              />
            </View>

            <View style={styles.row}>
              <View style={[styles.inputGroup, styles.halfWidth]}>
                <Text style={styles.label}>Travel date</Text>
                <TextInput
                  value={form.date}
                  onChangeText={(value) => setField("date", value)}
                  placeholder="2026-06-15"
                  placeholderTextColor={Colors.textMuted}
                  style={styles.input}
                  autoCapitalize="none"
                  editable={chauffeur?.isApproved}
                />
              </View>
              <View style={[styles.inputGroup, styles.halfWidth]}>
                <Text style={styles.label}>Price per seat</Text>
                <TextInput
                  value={form.pricePerSeat}
                  onChangeText={(value) => setField("pricePerSeat", value.replace(/[^0-9.]/g, ""))}
                  placeholder="850"
                  placeholderTextColor={Colors.textMuted}
                  style={styles.input}
                  keyboardType="numeric"
                  editable={chauffeur?.isApproved}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Seats available</Text>
              <TextInput
                value={form.seatsAvailable}
                onChangeText={(value) => setField("seatsAvailable", value.replace(/[^0-9]/g, ""))}
                placeholder="3"
                placeholderTextColor={Colors.textMuted}
                style={styles.input}
                keyboardType="number-pad"
                editable={chauffeur?.isApproved}
              />
            </View>

            <View style={styles.tipCard}>
              <Ionicons name="information-circle-outline" size={18} color={Colors.warning} />
              <Text style={styles.tipText}>Keep the date in YYYY-MM-DD format so your route matches public search exactly.</Text>
            </View>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.sectionTitle}>Current summary</Text>
            <Text style={styles.summaryLine}>Status: {form.available ? "Visible in search" : "Hidden from search"}</Text>
            <Text style={styles.summaryLine}>Route: {form.from || "Departure"} to {form.to || "Destination"}</Text>
            <Text style={styles.summaryLine}>Travel date: {form.date || "Not set"}</Text>
            <Text style={styles.summaryLine}>Seats: {form.seatsAvailable || "0"}</Text>
            <Text style={styles.summaryLine}>Price per seat: {form.pricePerSeat ? `R${form.pricePerSeat}` : "Not set"}</Text>
            {lastUpdatedLabel ? <Text style={styles.updatedLine}>Last saved: {lastUpdatedLabel}</Text> : null}
          </View>

          <Pressable
            style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
            onPress={saveAvailability}
            disabled={!canSave}
          >
            {saving ? (
              <ActivityIndicator color={Colors.primary} />
            ) : (
              <>
                <Ionicons name={form.available ? "rocket-outline" : "pause-circle-outline"} size={18} color={Colors.primary} />
                <Text style={styles.saveButtonText}>{form.available ? "Publish long-distance route" : "Save as unavailable"}</Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.primary,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
  },
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    gap: 18,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  backText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: "600",
  },
  refreshButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  eyebrow: {
    color: Colors.warning,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  title: {
    color: Colors.white,
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: -0.6,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 15,
    lineHeight: 23,
  },
  statusCard: {
    borderRadius: 22,
    padding: 18,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 10,
  },
  statusHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusLabel: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  statusValue: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: "700",
    marginTop: 4,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusBadgeLive: {
    backgroundColor: "rgba(76, 175, 80, 0.18)",
  },
  statusBadgePending: {
    backgroundColor: "rgba(255, 183, 77, 0.18)",
  },
  statusBadgeText: {
    color: Colors.white,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
  },
  statusCopy: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
  },
  vehicleCopy: {
    color: Colors.white,
    fontSize: 13,
    fontWeight: "600",
  },
  toggleRow: {
    gap: 12,
  },
  toggleCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 18,
    padding: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  toggleCardActive: {
    borderColor: Colors.white,
    backgroundColor: Colors.accent,
  },
  toggleTextWrap: {
    flex: 1,
    gap: 3,
  },
  toggleTitle: {
    color: Colors.textSecondary,
    fontSize: 15,
    fontWeight: "700",
  },
  toggleTitleActive: {
    color: Colors.white,
  },
  toggleCopy: {
    color: Colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  formCard: {
    borderRadius: 22,
    padding: 18,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 14,
  },
  sectionTitle: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: "700",
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  input: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.white,
    fontSize: 15,
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  halfWidth: {
    flex: 1,
  },
  tipCard: {
    marginTop: 4,
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    borderRadius: 16,
    padding: 14,
    backgroundColor: "rgba(255, 183, 77, 0.08)",
  },
  tipText: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  summaryCard: {
    borderRadius: 22,
    padding: 18,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  summaryLine: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
  },
  updatedLine: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  saveButton: {
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: Colors.white,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  saveButtonDisabled: {
    opacity: 0.45,
  },
  saveButtonText: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: "800",
  },
});