import React, {createContext, useContext, useMemo} from 'react';
import {Dimensions, StyleSheet, useWindowDimensions, View} from 'react-native';
import {
  EdgeInsets,
  SafeAreaInsetsContext,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

/**
 * The widest the app gets: the biggest iPhones (Pro Max). On wider screens (the iPhone Duo open,
 * Android foldables and tablets) the app keeps this size and sits in the middle.
 */
export const MAX_WIDTH = 440;

export interface Layout {
  /** The app's width: the window less what the sides keep (the Duo's status bar), at most MAX_WIDTH. */
  width: number;
  height: number;
  /** Where the app starts from the window's left edge. */
  left: number;
  /** Percent of the app's width and height, for sizes that follow the screen. */
  vw: (percent: number) => number;
  vh: (percent: number) => number;
}

export function layoutFor(
  window: {width: number; height: number},
  insets: Pick<EdgeInsets, 'left' | 'right'>,
): Layout {
  const available = Math.max(0, window.width - insets.left - insets.right);
  const width = Math.min(available, MAX_WIDTH);
  const left = Math.round(insets.left + (available - width) / 2);
  const height = window.height;
  return {
    width,
    height,
    left,
    vw: percent => width * (percent / 100),
    vh: percent => height * (percent / 100),
  };
}

const LayoutContext = createContext<Layout>(
  layoutFor(Dimensions.get('window'), {left: 0, right: 0}),
);

/** The app's size now: it changes when the phone folds or opens, or the screen turns. */
export function LayoutProvider({children}: {children: React.ReactNode}) {
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const layout = useMemo(() => layoutFor(window, insets), [window, insets]);
  return <LayoutContext.Provider value={layout}>{children}</LayoutContext.Provider>;
}

export const useLayout = () => useContext(LayoutContext);

/** Styles made for the app's size now, made again only when it changes. */
export function useStyles<T>(make: (layout: Layout) => T): T {
  const layout = useLayout();
  return useMemo(() => make(layout), [make, layout]);
}

/**
 * The screens' column: the app's width, in the middle of a wider screen. It already keeps clear
 * of the sides, so inside it the left and right insets are 0 (the tab bar would add them again).
 */
export function LayoutColumn({children}: {children: React.ReactNode}) {
  const layout = useLayout();
  const insets = useSafeAreaInsets();
  const inner = useMemo(() => ({...insets, left: 0, right: 0}), [insets]);
  return (
    <View style={styles.margins}>
      <View style={[styles.column, {width: layout.width, marginLeft: layout.left}]}>
        <SafeAreaInsetsContext.Provider value={inner}>{children}</SafeAreaInsetsContext.Provider>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  margins: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  column: {
    flex: 1,
  },
});
