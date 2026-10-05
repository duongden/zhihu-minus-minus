import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { type StyleProp, StyleSheet, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { useRuntimeThemeColors } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';

export const CONTENT_ACTION_BAR_HEIGHT = 44;

interface ContentActionBarProps {
  bottomInset: number;
  bottomOffset?: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  visible?: boolean;
}

/** Preserve larger safe-area distances; keep small insets visibly floating. */
export function getContentActionBarBottom(
  bottomInset: number,
  bottomOffset = 0,
): number {
  return Math.max(bottomInset + bottomOffset, 12);
}

/** Common floating surface; each content screen owns its action row layout. */
export function ContentActionBar({
  bottomInset,
  bottomOffset = 0,
  children,
  style,
  visible = true,
}: ContentActionBarProps) {
  const colors = useRuntimeThemeColors();
  const colorScheme = useColorScheme();
  const bottom = getContentActionBarBottom(bottomInset, bottomOffset);
  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      style={[
        styles.container,
        {
          bottom,
          height: CONTENT_ACTION_BAR_HEIGHT,
          borderRadius: CONTENT_ACTION_BAR_HEIGHT / 2,
          opacity: visible ? 1 : 0,
        },
        colorScheme === 'light' && {
          shadowColor: colors.shadow,
          ...styles.shadow,
        },
        style,
      ]}
    >
      <BlurView
        intensity={130}
        tint={colorScheme}
        style={[
          styles.surface,
          {
            height: CONTENT_ACTION_BAR_HEIGHT,
            borderRadius: CONTENT_ACTION_BAR_HEIGHT / 2,
            backgroundColor: colors.contentOverlayStrong,
            borderColor: colors.contentBorder,
          },
        ]}
      >
        {children}
      </BlurView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', left: 20, right: 20, zIndex: 1000 },
  surface: { overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  shadow: {
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
});
