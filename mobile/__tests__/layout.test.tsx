import React from 'react';
import {Dimensions, StyleSheet, View} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {SafeAreaProvider, useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  Layout,
  LayoutColumn,
  LayoutProvider,
  MAX_WIDTH,
  layoutFor,
  useLayout,
  useStyles,
} from '../services/layout';

// Like the real library: the insets come from the nearest provider, so the column's own (left and
// right 0) reach what's inside it. The window's insets can be changed by a test.
let mockWindowInsets = {top: 0, right: 0, bottom: 0, left: 0};
jest.mock('react-native-safe-area-context', () => {
  const {createContext, useContext} = require('react');
  const Context = createContext(null);
  return {
    SafeAreaProvider: ({children}: {children: React.ReactNode}) => children,
    SafeAreaInsetsContext: Context,
    useSafeAreaInsets: () => useContext(Context) ?? mockWindowInsets,
  };
});

const none = {left: 0, right: 0};

test('a phone in portrait: the whole window, as before', () => {
  for (const width of [360, 393, 402, 412, 440]) {
    const layout = layoutFor({width, height: 874}, none);
    expect([layout.width, layout.left, layout.height]).toEqual([width, 0, 874]);
    // The same numbers as the old vw() / vh() from the window.
    expect(layout.vw(4.5)).toBe(width * 0.045);
    expect(layout.vh(7)).toBe(874 * 0.07);
  }
});

test("the folded iPhone Duo: the window less the status bar's strip on the right", () => {
  const layout = layoutFor({width: 466, height: 678}, {left: 0, right: 84});
  expect([layout.width, layout.left]).toEqual([382, 0]);
  expect(layout.vw(100)).toBe(382);
});

test('wider screens keep the biggest iPhone size, in the middle of the space', () => {
  // The Duo open, with its status bar on the right.
  const duo = layoutFor({width: 669, height: 951}, {left: 0, right: 59});
  expect([duo.width, duo.left]).toEqual([MAX_WIDTH, Math.round((669 - 59 - MAX_WIDTH) / 2)]);
  // An Android tablet on its side.
  const tablet = layoutFor({width: 1280, height: 800}, none);
  expect([tablet.width, tablet.left]).toEqual([MAX_WIDTH, 420]);
  // A wide screen with insets on both sides: centred between them.
  const both = layoutFor({width: 932, height: 430}, {left: 59, right: 59});
  expect([both.width, both.left]).toEqual([MAX_WIDTH, 59 + 187]);
  expect(both.vw(50)).toBe(MAX_WIDTH / 2);
});

test('a window narrower than its insets gives 0, not a negative width', () => {
  expect(layoutFor({width: 100, height: 200}, {left: 60, right: 60}).width).toBe(0);
});

function render(element: React.ReactElement) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    tree = ReactTestRenderer.create(element);
  });
  return tree;
}

function setWindow(width: number, height: number) {
  act(() => {
    Dimensions.set({
      window: {width, height, scale: 3, fontScale: 1},
      screen: {width, height, scale: 3, fontScale: 1},
    });
  });
}

afterEach(() => {
  mockWindowInsets = {top: 0, right: 0, bottom: 0, left: 0};
  setWindow(390, 844);
});

test('the size follows the window: folding and opening change it while the app runs', () => {
  const seen: Layout[] = [];
  const Probe = () => {
    seen.push(useLayout());
    return null;
  };
  setWindow(402, 874);
  const tree = render(
    <LayoutProvider>
      <Probe />
    </LayoutProvider>,
  );
  expect(seen[seen.length - 1].width).toBe(402);
  // Opened: wider than the biggest iPhone.
  setWindow(669, 951);
  expect(seen[seen.length - 1].width).toBe(MAX_WIDTH);
  // Folded again, and the status bar's strip comes back on the right.
  mockWindowInsets = {top: 0, right: 84, bottom: 0, left: 0};
  setWindow(466, 678);
  expect(seen[seen.length - 1].width).toBe(382);
  act(() => tree.unmount());
});

test("styles are made again only when the app's size changes", () => {
  const make = jest.fn(({vw}: Layout) => StyleSheet.create({box: {width: vw(50)}}));
  const made: {box: {width: number}}[] = [];
  // A new prop each time: the component draws again although the size stays the same.
  const Probe = ({n}: {n: number}) => {
    made.push(useStyles(make) as {box: {width: number}});
    return <View testID={`probe-${n}`} />;
  };
  setWindow(400, 800);
  const tree = render(
    <LayoutProvider>
      <Probe n={1} />
    </LayoutProvider>,
  );
  act(() =>
    tree.update(
      <LayoutProvider>
        <Probe n={2} />
      </LayoutProvider>,
    ),
  );
  expect(make).toHaveBeenCalledTimes(1);
  expect(made[1]).toBe(made[0]);
  setWindow(300, 800);
  expect(make).toHaveBeenCalledTimes(2);
  expect(made[made.length - 1].box.width).toBe(150);
  act(() => tree.unmount());
});

test('the column: its width and place, and no side insets inside it', () => {
  mockWindowInsets = {top: 47, right: 84, bottom: 34, left: 0};
  let inside = {top: -1, right: -1, bottom: -1, left: -1};
  const Probe = () => {
    inside = useSafeAreaInsets();
    return null;
  };
  setWindow(466, 678);
  const tree = render(
    <LayoutProvider>
      <LayoutColumn>
        <Probe />
      </LayoutColumn>
    </LayoutProvider>,
  );
  const column = tree.root.findAllByType(View)[1];
  expect(StyleSheet.flatten(column.props.style)).toMatchObject({width: 382, marginLeft: 0});
  // Top and bottom stay (the screens still keep clear of the status bar and the home bar).
  expect(inside).toEqual({top: 47, right: 0, bottom: 34, left: 0});
  act(() => tree.unmount());
});

test("the screens' SafeAreaViews measure the column, not the whole window", () => {
  // A native SafeAreaView takes its insets from the nearest native SafeAreaProvider. The app's
  // root one covers the whole window (the folded Duo: right 84), so the column holds its own,
  // which measures the column: nothing at the sides, the same top and bottom.
  mockWindowInsets = {top: 47, right: 84, bottom: 34, left: 0};
  setWindow(466, 678);
  const tree = render(
    <LayoutProvider>
      <LayoutColumn>
        <View testID="screen" />
      </LayoutColumn>
    </LayoutProvider>,
  );
  const column = tree.root.findAllByType(View)[1];
  const provider = column.findByType(SafeAreaProvider);
  expect(provider.findByProps({testID: 'screen'})).toBeTruthy();
  act(() => tree.unmount());
});
