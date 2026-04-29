import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  StyleProp,
  ViewStyle,
} from "react-native";

type EntranceDirection = "up" | "down";

interface EntranceViewProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  direction?: EntranceDirection;
  delay?: number;
  duration?: number;
  distance?: number;
}

function getInitialOffset(direction: EntranceDirection, distance: number) {
  return direction === "up" ? distance : -distance;
}

export default function EntranceView({
  children,
  style,
  direction = "down",
  delay = 0,
  duration = 400,
  distance = 24,
}: EntranceViewProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(getInitialOffset(direction, distance))).current;

  useEffect(() => {
    const initialOffset = getInitialOffset(direction, distance);
    opacity.setValue(0);
    translateY.setValue(initialOffset);

    const animation = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);

    animation.start();

    return () => {
      animation.stop();
    };
  }, [delay, direction, distance, duration, opacity, translateY]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}