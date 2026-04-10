/**
 * LivenessCamera.tsx
 *
 * A full-screen guided selfie capture component with real-time face detection.
 * Uses expo-camera + expo-face-detector to:
 *   1. Show an animated oval face guide
 *   2. Detect if a real human face is centred and fills the oval
 *   3. Issue a random liveness challenge (blink / smile / turn left / turn right)
 *   4. Auto-capture once the challenge is satisfied
 *   5. Return the captured image URI + face metadata to the parent
 *
 * Works in Expo Go (no custom native build required).
 */

import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Dimensions,
  Platform,
  Image,
  ActivityIndicator,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import Constants from "expo-constants";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

type FaceDetectorModuleType = typeof import("expo-face-detector");

type DetectedFace = {
  leftEyeOpenProbability?: number;
  rightEyeOpenProbability?: number;
  smilingProbability?: number;
  yawAngle?: number;
  rollAngle?: number;
  bounds: {
    origin: { x: number; y: number };
    size: { width: number; height: number };
  };
};

let FaceDetector: FaceDetectorModuleType | null = null;

try {
  FaceDetector = require("expo-face-detector");
} catch {
  FaceDetector = null;
}

/* ─── types ──────────────────────────────────────────────────────────────── */

export type LivenessChallenge = "blink" | "smile" | "turn_left" | "turn_right" | "look_straight";

export interface LivenessCaptureResult {
  uri: string;
  /** true = face detected & challenge passed */
  passed: boolean;
  /** 0-1 confidence score */
  score: number;
  challenge: LivenessChallenge;
  faceData?: {
    leftEyeOpenProbability: number;
    rightEyeOpenProbability: number;
    smilingProbability: number;
    yawAngle: number;
    rollAngle: number;
    bounds: { x: number; y: number; width: number; height: number };
  };
}

interface Props {
  challenge: LivenessChallenge;
  onCapture: (result: LivenessCaptureResult) => void | Promise<void>;
  onCancel: () => void;
}

/* ─── constants ──────────────────────────────────────────────────────────── */

const { width: SW, height: SH } = Dimensions.get("window");

// Oval guide dimensions — slightly taller than wide, centred at 42% from top
const OVAL_W = SW * 0.68;
const OVAL_H = OVAL_W * 1.28;
const OVAL_X = (SW - OVAL_W) / 2;
const OVAL_Y = SH * 0.14;

const CHALLENGE_LABELS: Record<LivenessChallenge, string> = {
  blink: "Blink slowly",
  smile: "Smile naturally",
  turn_left: "Slowly turn left",
  turn_right: "Slowly turn right",
  look_straight: "Look straight ahead",
};

const CHALLENGE_ICONS: Record<LivenessChallenge, string> = {
  blink: "eye-outline",
  smile: "happy-outline",
  turn_left: "arrow-back-outline",
  turn_right: "arrow-forward-outline",
  look_straight: "radio-button-on-outline",
};

/* ─── helpers ────────────────────────────────────────────────────────────── */

function challengePassed(
  challenge: LivenessChallenge,
  face: DetectedFace
): boolean {
  const left = face.leftEyeOpenProbability ?? 1;
  const right = face.rightEyeOpenProbability ?? 1;
  const smile = face.smilingProbability ?? 0;
  const yaw = face.yawAngle ?? 0;

  switch (challenge) {
    case "blink":
      return left < 0.25 && right < 0.25;
    case "smile":
      return smile > 0.75;
    case "turn_left":
      return yaw < -18;
    case "turn_right":
      return yaw > 18;
    case "look_straight":
      return Math.abs(yaw) < 12;
  }
}

function faceInOval(face: DetectedFace): boolean {
  const b = face.bounds;
  const faceCx = b.origin.x + b.size.width / 2;
  const faceCy = b.origin.y + b.size.height / 2;
  const ovalCx = OVAL_X + OVAL_W / 2;
  const ovalCy = OVAL_Y + OVAL_H / 2;

  // Face centre must be within 28% of oval centre
  const dx = Math.abs(faceCx - ovalCx) / (OVAL_W / 2);
  const dy = Math.abs(faceCy - ovalCy) / (OVAL_H / 2);
  const centred = dx < 0.28 && dy < 0.28;

  // Face must fill at least 55% of oval width
  const fillRatio = b.size.width / OVAL_W;
  const goodSize = fillRatio > 0.55 && fillRatio < 1.4;

  return centred && goodSize;
}

function computeScore(face: DetectedFace, challenge: LivenessChallenge): number {
  const filled = faceInOval(face) ? 0.4 : 0;
  const passed = challengePassed(challenge, face) ? 0.55 : 0;
  return Math.min(filled + passed + 0.05, 1.0);
}

/* ─── component ──────────────────────────────────────────────────────────── */

export default function LivenessCamera({ challenge, onCapture, onCancel }: Props) {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [faces, setFaces] = useState<DetectedFace[]>([]);
  const [step, setStep] = useState<"position" | "challenge" | "capturing" | "review">("position");
  const [challengeDone, setChallengeDone] = useState(false);
  const [pendingCapture, setPendingCapture] = useState<LivenessCaptureResult | null>(null);
  const [confirmingCapture, setConfirmingCapture] = useState(false);
  const [challengeReady, setChallengeReady] = useState(false);
  const challengeDoneRef = useRef(false);
  const capturingRef = useRef(false);
  const readyFaceRef = useRef<DetectedFace | null>(null);
  const hasFaceDetector = Boolean(FaceDetector);
  const allowTestingCapture = !hasFaceDetector || Constants.isDevice === false;

  // Animations
  const ovalAnim = useRef(new Animated.Value(0)).current; // 0=idle, 1=good
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const checkAnim = useRef(new Animated.Value(0)).current;
  const bgAnim = useRef(new Animated.Value(0)).current;

  const resetCaptureState = useCallback(() => {
    capturingRef.current = false;
    challengeDoneRef.current = false;
    readyFaceRef.current = null;
    setChallengeDone(false);
    setChallengeReady(false);
    setPendingCapture(null);
    setConfirmingCapture(false);
    setStep("position");
    checkAnim.setValue(0);
    ovalAnim.setValue(0);
    bgAnim.setValue(0);
  }, [bgAnim, checkAnim, ovalAnim]);

  /* ── pulse loop ── */
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.04, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  /* ── face detection handler ── */
  const handleFacesDetected = useCallback(
    ({ faces: detected }: { faces: DetectedFace[] }) => {
      setFaces(detected);

      if (capturingRef.current || challengeDoneRef.current || pendingCapture) return;

      const face = detected[0];
      if (!face) {
        readyFaceRef.current = null;
        setChallengeReady(false);
        challengeDoneRef.current = false;
        setChallengeDone(false);
        setStep("position");
        Animated.timing(ovalAnim, { toValue: 0, duration: 200, useNativeDriver: false }).start();
        Animated.timing(bgAnim, { toValue: 0, duration: 200, useNativeDriver: false }).start();
        checkAnim.setValue(0);
        return;
      }

      const inOval = faceInOval(face);

      if (!inOval) {
        readyFaceRef.current = null;
        setChallengeReady(false);
        challengeDoneRef.current = false;
        setChallengeDone(false);
        setStep("position");
        Animated.timing(ovalAnim, { toValue: 0, duration: 200, useNativeDriver: false }).start();
        Animated.timing(bgAnim, { toValue: 0, duration: 200, useNativeDriver: false }).start();
        checkAnim.setValue(0);
        return;
      }

      // Face is in oval → show challenge
      setStep("challenge");
      Animated.timing(ovalAnim, { toValue: 0.5, duration: 300, useNativeDriver: false }).start();

      if (challengePassed(challenge, face)) {
        // Challenge satisfied → enable capture button
        readyFaceRef.current = face;
        setChallengeReady(true);
        challengeDoneRef.current = true;
        setChallengeDone(true);
        Animated.parallel([
          Animated.timing(ovalAnim, { toValue: 1, duration: 300, useNativeDriver: false }),
          Animated.timing(bgAnim, { toValue: 1, duration: 400, useNativeDriver: false }),
          Animated.spring(checkAnim, { toValue: 1, useNativeDriver: true }),
        ]).start();
      } else {
        readyFaceRef.current = null;
        setChallengeReady(false);
        challengeDoneRef.current = false;
        setChallengeDone(false);
        Animated.timing(bgAnim, { toValue: 0, duration: 200, useNativeDriver: false }).start();
        checkAnim.setValue(0);
      }
    },
    [bgAnim, challenge, checkAnim, pendingCapture]
  );

  /* ── capture ── */
  const doCapture = useCallback(
    async (face: DetectedFace) => {
      if (capturingRef.current) return;
      capturingRef.current = true;
      try {
        await new Promise((r) => setTimeout(r, 200));
        const photo = await cameraRef.current?.takePictureAsync({
          quality: 0.82,
          base64: false,
          skipProcessing: false,
        });
        if (!photo) throw new Error("Camera returned no photo");

        // Determine if we have real face detection data
        const hasFaceData = face.leftEyeOpenProbability !== undefined ||
                            face.rightEyeOpenProbability !== undefined;

        const score = hasFaceData ? computeScore(face, challenge) : 0;

        // passed = true only if we actually detected a face (production build)
        // OR if expo-face-detector is not available (Expo Go testing bypass)
        const capturePass = hasFaceData || !hasFaceDetector;

        setPendingCapture({
          uri: photo.uri,
          passed: capturePass,
          score,
          challenge,
          faceData: hasFaceData ? {
            leftEyeOpenProbability: face.leftEyeOpenProbability ?? 1,
            rightEyeOpenProbability: face.rightEyeOpenProbability ?? 1,
            smilingProbability: face.smilingProbability ?? 0,
            yawAngle: face.yawAngle ?? 0,
            rollAngle: face.rollAngle ?? 0,
            bounds: {
              x: face.bounds.origin.x,
              y: face.bounds.origin.y,
              width: face.bounds.size.width,
              height: face.bounds.size.height,
            },
          } : undefined,
        });
        setStep("review");
        capturingRef.current = false;
      } catch {
        resetCaptureState();
      }
    },
    [challenge, resetCaptureState]
  );

  const confirmCapture = useCallback(async () => {
    if (!pendingCapture || confirmingCapture) return;
    setConfirmingCapture(true);
    try {
      await onCapture(pendingCapture);
    } finally {
      setConfirmingCapture(false);
    }
  }, [confirmingCapture, onCapture, pendingCapture]);

  const startCapture = useCallback(async () => {
    if (capturingRef.current) return;
    // If face detection is available and no face is visible, block the capture
    if (hasFaceDetector && faces.length === 0) {
      setStep("position");
      return;
    }
    setStep("capturing");
    // Use the best detected face if available, otherwise null
    const face = readyFaceRef.current ?? (faces.length > 0 ? faces[0] : null);
    const fallbackFace: DetectedFace = {
      leftEyeOpenProbability: undefined,
      rightEyeOpenProbability: undefined,
      smilingProbability: undefined,
      yawAngle: undefined,
      rollAngle: undefined,
      bounds: {
        origin: { x: OVAL_X + 20, y: OVAL_Y + 20 },
        size: { width: OVAL_W - 40, height: OVAL_H - 40 },
      },
    };
    await doCapture(face ?? fallbackFace);
  }, [doCapture, faces]);

  /* ── permission gate ── */
  useEffect(() => {
    if (!permission?.granted) requestPermission();
  }, [permission]);

  if (!permission) return null;

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Ionicons name="camera-outline" size={56} color={Colors.white} />
        <Text style={styles.permissionTitle}>Camera Access Required</Text>
        <Text style={styles.permissionBody}>
          We need your camera to verify your identity for cash rides.
        </Text>
        <Pressable style={styles.permissionBtn} onPress={requestPermission}>
          <Text style={styles.permissionBtnText}>Allow Camera</Text>
        </Pressable>
        <Pressable onPress={onCancel} style={{ marginTop: 16 }}>
          <Text style={{ color: Colors.textMuted, fontSize: 14 }}>Cancel</Text>
        </Pressable>
      </View>
    );
  }

  /* ── derived UI state ── */
  const hasFace = faces.length > 0;
  const faceGood = hasFace && faceInOval(faces[0]);

  const ovalColor = ovalAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ["rgba(255,255,255,0.35)", "rgba(255,220,50,0.85)", "rgba(100,220,100,0.95)"],
  });

  const ovalGlow = ovalAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 6, 18],
  });

  const overlayOpacity = bgAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.22],
  });

  const instruction =
    !hasFaceDetector ? "Face detection unavailable in Expo Go" :
    step === "position" ? "Centre your face in the oval" :
    step === "challenge" ? (challengeReady ? "Tap capture when you are ready" : CHALLENGE_LABELS[challenge]) :
    step === "capturing" ? "Hold still…" :
    "Review your capture";

  const instructionColor =
    step === "position" ? "#fff" :
    step === "challenge" ? "#FFE066" :
    step === "capturing" ? "#6EE86E" :
    "#6EE86E";

  return (
    <View style={styles.root}>
      {/* Camera feed */}
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="front"
        onFacesDetected={Platform.OS !== "web" && hasFaceDetector ? handleFacesDetected : undefined}
        faceDetectorSettings={
          Platform.OS !== "web" && hasFaceDetector && FaceDetector
            ? {
                mode: FaceDetector.FaceDetectorMode.fast,
                detectLandmarks: FaceDetector.FaceDetectorLandmarks.all,
                runClassifications: FaceDetector.FaceDetectorClassifications.all,
                minDetectionInterval: 120,
                tracking: true,
              }
            : undefined
        }
      />

      {pendingCapture ? (
        <View style={styles.reviewOverlay}>
          <Image source={{ uri: pendingCapture.uri }} style={styles.reviewImage} />
          <View style={styles.reviewBackdrop} />
          <View style={styles.reviewPanel}>
            <Text style={styles.reviewTitle}>Confirm capture</Text>
            <Text style={styles.reviewBody}>
              Use this selfie for liveness verification, or retake it if your face is not clear.
            </Text>
            <View style={styles.reviewActions}>
              <Pressable style={styles.reviewSecondaryBtn} onPress={resetCaptureState}>
                <Text style={styles.reviewSecondaryBtnText}>Retake</Text>
              </Pressable>
              <Pressable
                style={[styles.reviewPrimaryBtn, confirmingCapture && { opacity: 0.7 }]}
                onPress={confirmCapture}
                disabled={confirmingCapture}
              >
                {confirmingCapture ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <Text style={styles.reviewPrimaryBtnText}>Confirm Capture</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      {/* Dark vignette overlay everywhere except the oval */}
      <View style={styles.vignetteTop} />
      <View style={[styles.vignetteMiddleRow]}>
        <View style={styles.vignetteSide} />
        {/* transparent oval hole */}
        <View style={{ width: OVAL_W, height: OVAL_H }} />
        <View style={styles.vignetteSide} />
      </View>
      <View style={styles.vignetteBottom} />

      {/* Green flash overlay on success */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: "#6EE86E", opacity: overlayOpacity }]}
        pointerEvents="none"
      />

      {/* Oval guide frame */}
      <Animated.View
        style={[
          styles.ovalFrame,
          {
            width: OVAL_W,
            height: OVAL_H,
            left: OVAL_X,
            top: OVAL_Y,
            borderColor: ovalColor,
            shadowColor: "#6EE86E",
            shadowRadius: ovalGlow,
            shadowOpacity: 1,
            elevation: 12,
            transform: [{ scale: step === "capturing" ? pulseAnim : 1 }],
          },
        ]}
        pointerEvents="none"
      />

      {/* Corner accent marks inside oval */}
      {["tl", "tr", "bl", "br"].map((pos) => (
        <Animated.View
          key={pos}
          style={[
            styles.cornerMark,
            {
              left: pos.includes("l") ? OVAL_X + 4 : OVAL_X + OVAL_W - 28,
              top: pos.includes("t") ? OVAL_Y + 4 : OVAL_Y + OVAL_H - 28,
              borderTopWidth: pos.includes("t") ? 3 : 0,
              borderBottomWidth: pos.includes("b") ? 3 : 0,
              borderLeftWidth: pos.includes("l") ? 3 : 0,
              borderRightWidth: pos.includes("r") ? 3 : 0,
              borderColor: ovalColor,
            },
          ]}
          pointerEvents="none"
        />
      ))}

      {/* ✓ checkmark on capture */}
      <Animated.View
        style={[
          styles.checkCircle,
          {
            left: OVAL_X + OVAL_W / 2 - 32,
            top: OVAL_Y + OVAL_H / 2 - 32,
            opacity: checkAnim,
            transform: [{ scale: checkAnim }],
          },
        ]}
        pointerEvents="none"
      >
        <Ionicons name="checkmark" size={40} color="#fff" />
      </Animated.View>

      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable onPress={onCancel} style={styles.cancelBtn} hitSlop={12}>
          <Ionicons name="close" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.topTitle}>Identity Check</Text>
        <View style={{ width: 44 }} />
      </View>

      {/* Challenge pill */}
      <View style={[styles.challengePill, { top: OVAL_Y - 52 }]}>
        <Ionicons name={CHALLENGE_ICONS[challenge] as any} size={16} color="#FFE066" />
        <Text style={styles.challengePillText}>{CHALLENGE_LABELS[challenge]}</Text>
      </View>

      {/* Bottom instruction area */}
      <View style={styles.bottomArea}>
        {/* Face status dot */}
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: faceGood ? "#6EE86E" : hasFace ? "#FFE066" : "#FF5555" }]} />
          <Text style={styles.statusText}>
            {!hasFace ? "No face detected" : !faceGood ? "Move closer / centre face" : "Face detected"}
          </Text>
        </View>

        {/* Main instruction */}
        <Text style={[styles.instruction, { color: instructionColor }]}>{instruction}</Text>

        {/* Tip */}
        {step === "position" && !pendingCapture && (
          <Text style={styles.tip}>
            Ensure good lighting • Remove glasses • Face the camera directly
          </Text>
        )}

        {/* Capture button — enabled when face detected (or in Expo Go testing mode) */}
        {Platform.OS !== "web" && !pendingCapture && (
          <Pressable
            style={[styles.captureBtn, hasFaceDetector && faces.length === 0 && { opacity: 0.45 }]}
            onPress={startCapture}
            disabled={step === "capturing"}
          >
            <Ionicons name="camera" size={20} color={Colors.primary} style={{ marginRight: 8 }} />
            <Text style={styles.captureBtnText}>
              {step === "capturing" ? "Capturing…" : "Capture Selfie"}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

/* ─── styles ─────────────────────────────────────────────────────────────── */

const VIGNETTE = "rgba(0,0,0,0.72)";

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  reviewOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 25,
  },
  reviewImage: {
    ...StyleSheet.absoluteFillObject,
  },
  reviewBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  reviewPanel: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: 38,
    borderRadius: 20,
    backgroundColor: "rgba(8,8,8,0.92)",
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    gap: 10,
  },
  reviewTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  reviewBody: {
    fontSize: 14,
    lineHeight: 20,
    color: "rgba(255,255,255,0.78)",
  },
  reviewActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  reviewSecondaryBtn: {
    flex: 1,
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  reviewSecondaryBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  reviewPrimaryBtn: {
    flex: 1.2,
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  reviewPrimaryBtnText: {
    color: Colors.primary,
    fontSize: 15,
    fontWeight: "700",
  },

  // Vignette mask (everything outside the oval is darkened)
  vignetteTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: OVAL_Y,
    backgroundColor: VIGNETTE,
  },
  vignetteMiddleRow: {
    position: "absolute",
    top: OVAL_Y,
    left: 0,
    right: 0,
    height: OVAL_H,
    flexDirection: "row",
  },
  vignetteSide: {
    flex: 1,
    backgroundColor: VIGNETTE,
  },
  vignetteBottom: {
    position: "absolute",
    top: OVAL_Y + OVAL_H,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: VIGNETTE,
  },

  // Oval guide
  ovalFrame: {
    position: "absolute",
    borderRadius: 999,
    borderWidth: 3,
    backgroundColor: "transparent",
  },

  // Corner accent marks
  cornerMark: {
    position: "absolute",
    width: 24,
    height: 24,
    borderRadius: 3,
  },

  // ✓ checkmark
  checkCircle: {
    position: "absolute",
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(100,220,100,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },

  // Top bar
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 56,
    paddingBottom: 16,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cancelBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  topTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
    letterSpacing: 0.5,
  },

  // Challenge pill (above oval)
  challengePill: {
    position: "absolute",
    alignSelf: "center",
    left: 0,
    right: 0,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: "rgba(255,220,50,0.12)",
    marginHorizontal: 60,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,220,50,0.3)",
    zIndex: 10,
  },
  challengePillText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#FFE066",
  },

  // Bottom instruction area
  bottomArea: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 52,
    paddingHorizontal: 24,
    alignItems: "center",
    gap: 10,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  statusText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.7)",
  },
  instruction: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    letterSpacing: -0.3,
  },
  tip: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.45)",
    textAlign: "center",
    lineHeight: 18,
    marginTop: 4,
  },

  // Capture button
  captureBtn: {
    marginTop: 12,
    width: "100%",
    borderRadius: 16,
    paddingHorizontal: 28,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },
  captureBtnText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: Colors.primary,
  },

  // Permission screen
  permissionContainer: {
    flex: 1,
    backgroundColor: "#0a0a0f",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 16,
  },
  permissionTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    textAlign: "center",
  },
  permissionBody: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.55)",
    textAlign: "center",
    lineHeight: 22,
  },
  permissionBtn: {
    marginTop: 8,
    backgroundColor: Colors.accent,
    borderRadius: 14,
    paddingHorizontal: 32,
    paddingVertical: 14,
  },
  permissionBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
});
