import React, { useState, useCallback, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, FlatList, Platform, KeyboardAvoidingView, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/query-client";
import { useSocket } from "@/lib/socket-context";
import Colors from "@/constants/colors";

export default function ChauffeurChatScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { rideId, riderName } = useLocalSearchParams<{ rideId: string; riderName: string }>();
  const { on, off } = useSocket();
  const [messageText, setMessageText] = useState("");

  const { data: messages, isLoading } = useQuery({
    queryKey: ["/api/messages/ride", rideId || ""],
    enabled: !!rideId,
    refetchInterval: 3000,
  });

  useEffect(() => {
    const handleNewMessage = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages/ride", rideId || ""] });
    };
    on("chat:newMessage", handleNewMessage);
    return () => { off("chat:newMessage", handleNewMessage); };
  }, [rideId]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/messages", {
        rideId,
        senderId: user?.id,
        messageText: messageText.trim(),
      });
    },
    onSuccess: () => {
      setMessageText("");
      queryClient.invalidateQueries({ queryKey: ["/api/messages/ride", rideId || ""] });
    },
  });

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
  };

  const renderMessage = useCallback(({ item }: { item: any }) => {
    const isMe = item.senderId === user?.id;
    return (
      <View style={[styles.messageBubble, isMe ? styles.myMessage : styles.theirMessage]}>
        <Text style={[styles.messageText, isMe ? styles.myText : styles.theirText]}>{item.messageText}</Text>
        <Text style={[styles.messageTime, isMe ? styles.myTime : styles.theirTime]}>{formatTime(item.createdAt)}</Text>
      </View>
    );
  }, [user?.id]);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={Colors.white} />
        </Pressable>
        <View style={styles.headerInfo}>
          <View style={styles.headerAvatar}>
            <Ionicons name="person" size={16} color={Colors.white} />
          </View>
          <View>
            <Text style={styles.headerName}>{riderName || "Rider"}</Text>
            <Text style={styles.headerStatus}>Active ride</Text>
          </View>
        </View>
        <View style={{ width: 24 }} />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.white} />
        </View>
      ) : (
        <FlatList
          data={Array.isArray(messages) ? messages : []}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
          inverted={false}
        />
      )}

      <View style={[styles.inputBar, { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 8) }]}>
        <TextInput
          style={styles.textInput}
          placeholder="Type a message..."
          placeholderTextColor={Colors.textMuted}
          value={messageText}
          onChangeText={setMessageText}
          multiline
        />
        <Pressable
          style={[styles.sendBtn, !messageText.trim() && { opacity: 0.4 }]}
          onPress={() => { if (messageText.trim()) sendMutation.mutate(); }}
          disabled={!messageText.trim() || sendMutation.isPending}
        >
          <Ionicons name="send" size={18} color={Colors.primary} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerInfo: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  headerAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center" },
  headerName: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.white },
  headerStatus: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.success },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  messagesList: { padding: 16, gap: 8, flexGrow: 1, justifyContent: "flex-end" },
  messageBubble: { maxWidth: "80%", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16, gap: 4 },
  myMessage: { alignSelf: "flex-end", backgroundColor: Colors.white, borderBottomRightRadius: 4 },
  theirMessage: { alignSelf: "flex-start", backgroundColor: Colors.surface, borderBottomLeftRadius: 4 },
  messageText: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 20 },
  myText: { color: Colors.primary },
  theirText: { color: Colors.white },
  messageTime: { fontSize: 10, fontFamily: "Inter_400Regular", alignSelf: "flex-end" },
  myTime: { color: Colors.textMuted },
  theirTime: { color: Colors.textMuted },
  inputBar: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 16, paddingTop: 8, gap: 8, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.card },
  textInput: { flex: 1, backgroundColor: Colors.surface, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.white, maxHeight: 100 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.white, alignItems: "center", justifyContent: "center" },
});
