/**
 * First-launch tour over the real home screen: the screen is dimmed, the button being explained
 * stays lit, and a pointer and one sentence show what it does. It ends with why the app needs
 * the location, before Android or iOS asks for it (the app's startup waits: AppProvider's
 * holdStartup).
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  ScrollViewInstance,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewInstance,
} from 'react-native';
import Svg, {Path} from 'react-native-svg';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {MessageKey, useI18n} from '../../i18n';
import storage from '../../services/storage';
import {Layout, useLayout, useStyles} from '../../services/layout';

type TargetId = 'alerts' | 'shelters' | 'emergency';

const STEPS: {target: TargetId; text: MessageKey}[] = [
  {target: 'alerts', text: 'tourAlerts'},
  {target: 'shelters', text: 'tourShelters'},
  {target: 'emergency', text: 'tourEmergency'},
];

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ScrollState {
  view: ScrollViewInstance | null;
  offset: number;
  // The overlay, told each new offset: the lit element moves with the screen.
  listener: ((offset: number) => void) | null;
}

interface TourApi {
  targets: React.MutableRefObject<Partial<Record<TargetId, ViewInstance | null>>>;
  scroll: React.MutableRefObject<ScrollState>;
}

const TourContext = createContext<TourApi | null>(null);

/** Ref for an element the tour points at. */
export function useTourTarget(id: TargetId) {
  const tour = useContext(TourContext);
  return useCallback(
    (node: ViewInstance | null) => {
      if (tour) {
        tour.targets.current[id] = node;
      }
    },
    [tour, id],
  );
}

/** For the home screen's ScrollView: the tour scrolls to buttons below the fold. */
export function useTourScroll() {
  const tour = useContext(TourContext);
  const ref = useCallback(
    (node: ScrollViewInstance | null) => {
      if (tour) {
        tour.scroll.current.view = node;
      }
    },
    [tour],
  );
  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (tour) {
        tour.scroll.current.offset = event.nativeEvent.contentOffset.y;
        tour.scroll.current.listener?.(event.nativeEvent.contentOffset.y);
      }
    },
    [tour],
  );
  return {ref, onScroll};
}

/** 'checking' while the phone storage is read, then 'show' on the first launch, else 'done'. */
export function useFirstLaunchTour() {
  const [state, setState] = useState<'checking' | 'show' | 'done'>('checking');
  useEffect(() => {
    storage.getWelcomeSeen().then(
      seen => setState(seen ? 'done' : 'show'),
      () => setState('done'),
    );
  }, []);
  const finish = useCallback(() => {
    storage.setWelcomeSeen().catch(() => {});
    setState('done');
  }, []);
  return {state, finish};
}

export const TourProvider = ({
  active,
  onFinish,
  children,
}: {
  active: boolean;
  onFinish: () => void;
  children: React.ReactNode;
}) => {
  const targets = useRef<Partial<Record<TargetId, ViewInstance | null>>>({});
  const scroll = useRef<ScrollState>({view: null, offset: 0, listener: null});
  const api = useMemo(() => ({targets, scroll}), []);
  return (
    <TourContext.Provider value={api}>
      <View style={fixed.fill}>
        {children}
        {active && <TourOverlay api={api} onFinish={onFinish} />}
      </View>
    </TourContext.Provider>
  );
};

// Around the lit element: the gap, the corners and the pointing hand.
const sizes = ({vw}: Layout) => ({pad: vw(2), radius: vw(4), pointer: vw(12)});
// An element not found in this time (still loading, or a phone that never answers the
// measurement) gets the box in the middle of the screen: never a dimmed screen without buttons.
// The measuring itself gives up after 20 tries, about 2 s.
export const GIVE_UP_MS = 2500;

/** The whole screen, minus a rounded hole around `hole`. */
function dimPath(width: number, height: number, hole: Rect | null, pad: number, radius: number) {
  const outer = `M0 0H${width}V${height}H0Z`;
  if (!hole) {
    return outer;
  }
  const x = hole.x - pad;
  const y = hole.y - pad;
  const w = hole.width + 2 * pad;
  const h = hole.height + 2 * pad;
  const r = Math.min(radius, w / 2, h / 2);
  return (
    outer +
    `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}` +
    `A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}` +
    `V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`
  );
}

const TourOverlay = ({api, onFinish}: {api: TourApi; onFinish: () => void}) => {
  const {t} = useI18n();
  const insets = useSafeAreaInsets();
  const layout = useLayout();
  const {vh} = layout;
  const {pad, radius, pointer} = sizes(layout);
  const styles = useStyles(makeStyles);
  const root = useRef<ViewInstance>(null);
  const [size, setSize] = useState({width: 0, height: 0});
  const [step, setStep] = useState(0);
  // The last measured element: its step, where it was, and the screen's scroll offset then. On
  // "Next" the previous step stays as it was (sentence, lit element, ring, pointer) until the new
  // element is measured, then all of it changes in one frame: changing the sentence and dimming the
  // element first, and moving the box a moment later, looked like a flash.
  const [found, setFound] = useState<{step: number; rect: Rect | null; offset: number} | null>(null);
  // When the tour scrolls the screen to the next element, the lit one moves with the screen.
  const [offset, setOffset] = useState(api.scroll.current.offset);
  useEffect(() => {
    api.scroll.current.listener = setOffset;
    return () => {
      api.scroll.current.listener = null;
    };
  }, [api]);
  const hole = found?.rect ? {...found.rect, y: found.rect.y + found.offset - offset} : null;
  // The step whose sentence is shown: the new one once its element is found, or at once when the
  // previous one had none to light (its box was in the middle: nothing to keep).
  const shownStep = found?.rect && found.step < step ? found.step : step;
  const bounce = useRef(new Animated.Value(0)).current;
  const atLocation = step >= STEPS.length;
  // Nothing at all until the first element is found (or given up), then the dimming, the lit
  // element and the box fade in together: dimming first and lighting the element a moment later
  // looked like a flash.
  const started = found !== null;
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (started) {
      Animated.timing(fade, {toValue: 1, duration: 200, useNativeDriver: true}).start();
    }
  }, [started, fade]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bounce, {toValue: -vh(1.2), duration: 450, useNativeDriver: true}),
        Animated.timing(bounce, {toValue: 0, duration: 450, useNativeDriver: true}),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bounce, vh]);

  // Find the element: scroll it into view if needed, then measure it relative to this overlay.
  // When it can't be measured, the caption is shown in the middle.
  useEffect(() => {
    if (atLocation || !size.height) {
      return;
    }
    let cancelled = false;
    let tries = 0;
    let scrolled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (fn: () => void, ms: number) => timers.push(setTimeout(fn, ms));
    const retry = () => {
      if (tries++ < 20) {
        later(measure, 100);
      } else {
        setFound({step, rect: null, offset: api.scroll.current.offset});
      }
    };
    const measure = () => {
      const node = api.targets.current[STEPS[step].target];
      if (!node || !root.current) {
        retry();
        return;
      }
      root.current.measureInWindow((rootX, rootY) => {
        node.measureInWindow((x, y, width, height) => {
          if (cancelled) {
            return;
          }
          if (!width || !height) {
            retry();
            return;
          }
          const rect = {x: x - rootX, y: y - rootY, width, height};
          const scrollView = api.scroll.current.view;
          const offScreen =
            rect.y < insets.top + pad || rect.y + rect.height > size.height * 0.82;
          if (offScreen && !scrolled && scrollView) {
            scrolled = true;
            const target = api.scroll.current.offset + rect.y - size.height * 0.35;
            // Smoothly: the lit element follows the screen (onScroll) a frame late, which only
            // shows when the screen jumps. Measured again once it has mostly moved; if it still
            // moves after that, the new element follows it the same way.
            scrollView.scrollTo({y: Math.max(0, target), animated: true});
            later(measure, 350);
            return;
          }
          setFound({step, rect, offset: api.scroll.current.offset});
        });
      });
    };
    later(measure, 50);
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [api, step, atLocation, size.height, insets.top, pad]);

  // Even without a layout or an answer to the measurement (see GIVE_UP_MS).
  useEffect(() => {
    if (atLocation) {
      return;
    }
    const timer = setTimeout(() => {
      const now = api.scroll.current.offset;
      setFound(last => (last?.step === step ? last : {step, rect: null, offset: now}));
    }, GIVE_UP_MS);
    return () => clearTimeout(timer);
  }, [api, step, atLocation]);

  const next = () => setStep(step + 1);
  // Skip still shows why the app needs the location: the permission request follows it.
  const skip = () => setStep(STEPS.length);

  const captionBelow = hole ? hole.y + hole.height / 2 < size.height / 2 : true;
  const captionPosition = !hole
    ? styles.captionCenter
    : captionBelow
      ? {top: hole.y + hole.height + pad + pointer + vh(1)}
      : {bottom: size.height - hole.y + pad + pointer + vh(1)};

  return (
    <View
      ref={root}
      style={StyleSheet.absoluteFill}
      onLayout={e => setSize(e.nativeEvent.layout)}
      accessibilityViewIsModal>
      {started && (
        <Animated.View style={[StyleSheet.absoluteFill, {opacity: fade}]}>
          {size.width > 0 && (
            <Svg width={size.width} height={size.height} style={StyleSheet.absoluteFill}>
              <Path
                d={dimPath(size.width, size.height, atLocation ? null : hole, pad, radius)}
                fill="rgba(9,19,40,0.78)"
                fillRule="evenodd"
              />
            </Svg>
          )}

          {!atLocation && hole && (
            <>
              <View
                pointerEvents="none"
                style={[
                  styles.ring,
                  {
                    left: hole.x - pad,
                    top: hole.y - pad,
                    width: hole.width + 2 * pad,
                    height: hole.height + 2 * pad,
                  },
                ]}
              />
              <Animated.Text
                style={[
                  styles.pointer,
                  {left: hole.x + hole.width / 2 - pointer / 2, transform: [{translateY: bounce}]},
                  captionBelow
                    ? {top: hole.y + hole.height + pad}
                    : {top: hole.y - pad - pointer * 1.25},
                ]}>
                {captionBelow ? '👆' : '👇'}
              </Animated.Text>
            </>
          )}

          {!atLocation ? (
            <View style={[styles.caption, captionPosition]}>
              <Text style={styles.captionText}>{t(STEPS[shownStep].text)}</Text>
              <View style={styles.row}>
                <TouchableOpacity onPress={skip} style={styles.skip} accessibilityRole="button">
                  <Text style={styles.skipText}>{t('tourSkip')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={next} style={styles.next} accessibilityRole="button">
                  <Text style={styles.nextText}>{t('tourNext')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={[styles.caption, styles.locationCard, {top: insets.top + vh(6)}]}>
              {/* Scrolls when the phone's text size is very large. */}
              <ScrollView>
                <Text style={styles.locationIcon}>📍</Text>
                <Text style={styles.locationTitle}>{t('tourLocationTitle')}</Text>
                <Text style={styles.locationText}>{t('tourLocationText')}</Text>
              </ScrollView>
              <TouchableOpacity onPress={onFinish} style={styles.continue} accessibilityRole="button">
                <Text style={styles.nextText}>{t('tourContinue')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>
      )}
    </View>
  );
};

const fixed = StyleSheet.create({
  fill: {
    flex: 1,
  },
});

// The dimming covers the whole window, the boxes stay over the app's column (its middle on a
// wide screen).
const makeStyles = (layout: Layout) => {
  const {vw, vh} = layout;
  const {radius, pointer} = sizes(layout);
  return StyleSheet.create({
    ring: {
      position: 'absolute',
      borderWidth: 3,
      borderColor: '#FFD54F',
      borderRadius: radius,
    },
    pointer: {
      position: 'absolute',
      width: pointer,
      fontSize: pointer * 0.8,
      textAlign: 'center',
    },
    caption: {
      position: 'absolute',
      left: layout.left + vw(6),
      width: layout.width - vw(12),
      backgroundColor: 'white',
      borderRadius: radius,
      padding: vw(5),
    },
    captionCenter: {
      top: '22%',
    },
    locationCard: {
      maxHeight: '80%',
    },
    captionText: {
      fontSize: vw(5),
      lineHeight: vw(7.2),
      color: '#1F2D54',
      fontWeight: '600',
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: vh(2),
    },
    skip: {
      paddingVertical: vh(1.5),
      paddingRight: vw(4),
    },
    skipText: {
      fontSize: vw(4.5),
      color: '#5A6E8C',
      fontWeight: '600',
    },
    next: {
      backgroundColor: '#1F2D54',
      borderRadius: vw(3),
      paddingVertical: vh(1.6),
      paddingHorizontal: vw(9),
    },
    nextText: {
      color: 'white',
      fontSize: vw(5),
      fontWeight: 'bold',
      textAlign: 'center',
    },
    locationIcon: {
      fontSize: vw(14),
      textAlign: 'center',
      marginBottom: vh(1),
    },
    locationTitle: {
      fontSize: vw(6),
      fontWeight: 'bold',
      color: '#1F2D54',
      textAlign: 'center',
      marginBottom: vh(1.5),
    },
    locationText: {
      fontSize: vw(4.6),
      lineHeight: vw(6.8),
      color: '#1F2D54',
      textAlign: 'center',
    },
    continue: {
      backgroundColor: '#1F2D54',
      borderRadius: vw(3),
      paddingVertical: vh(1.8),
      marginTop: vh(2.5),
    },
  });
};
