import React from 'react';
import {Dimensions, StyleSheet, View} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';
import Svg from 'react-native-svg';
import SunPath from '../components/home/SunPath';
import {LayoutProvider, MAX_WIDTH} from '../services/layout';

function setWindow(width: number, height: number) {
  act(() => {
    Dimensions.set({
      window: {width, height, scale: 3, fontScale: 1},
      screen: {width, height, scale: 3, fontScale: 1},
    });
  });
}

afterEach(() => setWindow(390, 844));

/** The sun path's width and the width of its row of times. */
function sizes(tree: ReactTestRenderer.ReactTestRenderer) {
  const svg = tree.root.findByType(Svg);
  const labels = tree.root.findAllByType(View)[1];
  return [svg.props.width, StyleSheet.flatten(labels.props.style).width];
}

test("Home's sun path follows the app's size while it runs (fold, open, fold)", () => {
  setWindow(402, 874);
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    tree = ReactTestRenderer.create(
      <LayoutProvider>
        <SunPath sunrise="2026-11-01T05:44" sunset="2026-11-01T17:28" />
      </LayoutProvider>,
    );
  });
  expect(sizes(tree)).toEqual([402 * 0.84, 402 * 0.84]);
  // Opened: the biggest iPhone's size, not 84 % of the whole wide screen.
  setWindow(701, 841);
  expect(sizes(tree)).toEqual([MAX_WIDTH * 0.84, MAX_WIDTH * 0.84]);
  setWindow(360, 780);
  expect(sizes(tree)).toEqual([360 * 0.84, 360 * 0.84]);
  act(() => tree.unmount());
});
