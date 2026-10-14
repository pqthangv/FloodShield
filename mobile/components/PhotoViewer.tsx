import React, {useEffect, useRef} from 'react';
import {
  ActivityIndicator,
  Animated,
  GestureResponderEvent,
  Image,
  Modal,
  PanResponder,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Svg, {Line} from 'react-native-svg';
import {useI18n} from '../i18n';

interface Props {
  // The photo to show; null keeps the viewer closed.
  uri: string | null;
  onClose: () => void;
}

const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
const DOUBLE_TAP_MS = 300;

type Zoom = {s: number; x: number; y: number};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
// Finger positions on the screen. Page coordinates, so the photo's own zoom doesn't change them.
const fingers = (e: GestureResponderEvent) => e.nativeEvent.touches.map(t => ({x: t.pageX, y: t.pageY}));

/**
 * A community photo on a black full screen, whole rather than cropped. Pinch or double-tap to zoom,
 * drag to look around while zoomed. The ✕ or Android's back button closes it.
 */
const PhotoViewer = ({uri, onClose}: Props) => {
  const {t} = useI18n();
  const insets = useSafeAreaInsets();

  const scale = useRef(new Animated.Value(1)).current;
  const moveX = useRef(new Animated.Value(0)).current;
  const moveY = useRef(new Animated.Value(0)).current;
  const screen = useRef({w: 0, h: 0});
  const photo = useRef<{w: number; h: number} | null>(null);
  const zoom = useRef<Zoom>({s: 1, x: 0, y: 0});
  // Where the current one- or two-finger movement started.
  const start = useRef({...zoom.current, fingers: 0, dist: 0, fx: 0, fy: 0, px: 0, py: 0});
  const tap = useRef({time: 0, x: 0, y: 0, moved: false});
  const lastTap = useRef({time: 0, x: 0, y: 0});

  // Zoom to scale s with the photo's centre moved by (x, y), keeping the photo's edges from
  // coming inside the screen's edges.
  const show = (s: number, x: number, y: number, animate = false) => {
    const {w, h} = screen.current;
    const p = photo.current;
    const fit = p ? Math.min(w / p.w, h / p.h) : 1;
    const [pw, ph] = p ? [p.w * fit, p.h * fit] : [w, h];
    const maxX = Math.max(0, (pw * s - w) / 2);
    const maxY = Math.max(0, (ph * s - h) / 2);
    const next = {s, x: clamp(x, -maxX, maxX), y: clamp(y, -maxY, maxY)};
    zoom.current = next;
    if (animate) {
      const to = (value: Animated.Value, toValue: number) =>
        Animated.timing(value, {toValue, duration: 200, useNativeDriver: false});
      Animated.parallel([to(scale, next.s), to(moveX, next.x), to(moveY, next.y)]).start();
    } else {
      scale.setValue(next.s);
      moveX.setValue(next.x);
      moveY.setValue(next.y);
    }
  };

  // A new starting point whenever the number of fingers changes (a second finger comes or goes).
  const restart = (points: {x: number; y: number}[]) => {
    const {w, h} = screen.current;
    const [a, b] = points;
    start.current = b
      ? {
          ...zoom.current,
          fingers: 2,
          dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
          fx: (a.x + b.x) / 2 - w / 2,
          fy: (a.y + b.y) / 2 - h / 2,
          px: 0,
          py: 0,
        }
      : {...zoom.current, fingers: 1, dist: 0, fx: 0, fy: 0, px: a.x, py: a.y};
  };

  const gestures = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: e => {
        const points = fingers(e);
        if (points.length) {
          restart(points);
          tap.current = {time: Date.now(), x: points[0].x, y: points[0].y, moved: points.length > 1};
        }
      },
      onPanResponderMove: e => {
        const points = fingers(e);
        if (!points.length) {
          return;
        }
        if (Math.min(points.length, 2) !== start.current.fingers) {
          restart(points);
        }
        const st = start.current;
        const [a, b] = points;
        if (b) {
          tap.current.moved = true;
          const {w, h} = screen.current;
          const s = clamp((st.s * Math.hypot(a.x - b.x, a.y - b.y)) / st.dist, 1, MAX_SCALE);
          const fx = (a.x + b.x) / 2 - w / 2;
          const fy = (a.y + b.y) / 2 - h / 2;
          // The spot that was between the fingers stays between them.
          show(s, fx - (s / st.s) * (st.fx - st.x), fy - (s / st.s) * (st.fy - st.y));
        } else {
          if (Math.hypot(a.x - tap.current.x, a.y - tap.current.y) > 10) {
            tap.current.moved = true;
          }
          if (zoom.current.s > 1) {
            show(st.s, st.x + a.x - st.px, st.y + a.y - st.py);
          }
        }
      },
      onPanResponderRelease: () => {
        const now = Date.now();
        const tp = tap.current;
        if (tp.moved || now - tp.time > 250) {
          return;
        }
        const last = lastTap.current;
        if (now - last.time < DOUBLE_TAP_MS && Math.hypot(tp.x - last.x, tp.y - last.y) < 40) {
          lastTap.current = {time: 0, x: 0, y: 0};
          if (zoom.current.s > 1.01) {
            show(1, 0, 0, true);
          } else {
            // Zoom in on the tapped spot.
            const fx = tp.x - screen.current.w / 2;
            const fy = tp.y - screen.current.h / 2;
            show(DOUBLE_TAP_SCALE, fx * (1 - DOUBLE_TAP_SCALE), fy * (1 - DOUBLE_TAP_SCALE), true);
          }
        } else {
          lastTap.current = {time: now, x: tp.x, y: tp.y};
        }
      },
    }),
  ).current;

  // Each photo opens at its normal size.
  useEffect(() => {
    if (uri) {
      photo.current = null;
      lastTap.current = {time: 0, x: 0, y: 0};
      zoom.current = {s: 1, x: 0, y: 0};
      scale.setValue(1);
      moveX.setValue(0);
      moveY.setValue(0);
    }
  }, [uri, scale, moveX, moveY]);

  return (
    <Modal
      visible={uri !== null}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent>
      <StatusBar barStyle="light-content" />
      <View
        style={styles.container}
        onLayout={e => {
          screen.current = {w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height};
        }}>
        <ActivityIndicator size="large" color="#FFFFFF" style={StyleSheet.absoluteFill} />
        <View style={StyleSheet.absoluteFill} {...gestures.panHandlers}>
          <Animated.View
            style={[styles.fill, {transform: [{translateX: moveX}, {translateY: moveY}, {scale}]}]}>
            {uri && (
              <Image
                source={{uri}}
                style={styles.fill}
                resizeMode="contain"
                onLoad={e => {
                  photo.current = {w: e.nativeEvent.source.width, h: e.nativeEvent.source.height};
                }}
              />
            )}
          </Animated.View>
        </View>
        <TouchableOpacity
          style={[styles.close, {top: insets.top + 12, right: insets.right + 12}]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('close')}
          hitSlop={12}>
          <Svg width={24} height={24} viewBox="0 0 24 24">
            <Line x1={5} y1={5} x2={19} y2={19} stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" />
            <Line x1={19} y1={5} x2={5} y2={19} stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" />
          </Svg>
        </TouchableOpacity>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  fill: {
    width: '100%',
    height: '100%',
  },
  // Large and dark with a white edge, so it shows on both dark and bright photos.
  close: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.8)',
  },
});

export default PhotoViewer;
