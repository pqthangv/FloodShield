import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {TourProvider, useTourTarget} from '../components/tour/Tour';
import {translate} from '../i18n';

type Rect = [x: number, y: number, width: number, height: number];

// Where the elements the tour points at sit on a 390 x 844 screen: the alerts card in the top
// half, the shelters button in the bottom half.
const RECTS: Record<string, Rect> = {
  alerts: [20, 300, 350, 120],
  shelters: [20, 600, 170, 80],
  emergency: [200, 600, 170, 80],
};

const Targets = () => {
  const alerts = useTourTarget('alerts');
  const shelters = useTourTarget('shelters');
  const emergency = useTourTarget('emergency');
  return (
    <>
      <View ref={alerts} testID="alerts" />
      <View ref={shelters} testID="shelters" />
      <View ref={emergency} testID="emergency" />
    </>
  );
};

type Tree = ReactTestRenderer.ReactTestRenderer;
type Node = ReactTestRenderer.ReactTestInstance;

const view = (tree: Tree, match: (node: Node) => boolean) =>
  tree.root.find(node => node.type === View && match(node));

const styleOf = (node: Node) => StyleSheet.flatten(node.props.style) ?? {};

/** The white box with the sentence and the Skip / Next buttons. */
const caption = (tree: Tree) => styleOf(view(tree, node => styleOf(node).backgroundColor === 'white'));

const ringShown = (tree: Tree) =>
  tree.root.findAll(node => node.type === View && styleOf(node).borderColor === '#FFD54F').length > 0;

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('on "Next" the box stays by the previous button until the next one is found', async () => {
  let tree!: Tree;
  await act(async () => {
    tree = ReactTestRenderer.create(
      <TourProvider active onFinish={() => {}}>
        <Targets />
      </TourProvider>,
    );
  });
  // Jest's Views measure nothing: answer from RECTS (the overlay covers the screen from 0, 0).
  const place = (node: Node, rect: Rect) => {
    node.instance.measureInWindow = (done: (...r: Rect) => void) => done(...rect);
  };
  for (const id of Object.keys(RECTS)) {
    place(view(tree, node => node.props.testID === id), RECTS[id]);
  }
  const overlay = view(tree, node => node.props.accessibilityViewIsModal);
  place(overlay, [0, 0, 390, 844]);
  await act(async () => {
    overlay.props.onLayout({nativeEvent: {layout: {x: 0, y: 0, width: 390, height: 844}}});
  });
  await act(async () => {
    jest.advanceTimersByTime(100);
  });

  // Step 1: the alerts card is in the top half, so the box is below it.
  const first = caption(tree);
  expect(first.top).toBeGreaterThan(420);
  expect(ringShown(tree)).toBe(true);

  let next = tree.root.find(node => node.type === Text && node.props.children === translate('tourNext'));
  while (!next.props.onPress) {
    next = next.parent!;
  }
  await act(async () => {
    next.props.onPress();
  });

  // Right after "Next": the same place, never the middle of the screen; the ring waits.
  expect(caption(tree).top).toBe(first.top);
  expect(ringShown(tree)).toBe(false);

  await act(async () => {
    jest.advanceTimersByTime(100);
  });

  // Step 2: the shelters button is in the bottom half, so the box moves above it.
  const second = caption(tree);
  expect(second.top).toBeUndefined();
  expect(second.bottom).toBeGreaterThan(0);
  expect(ringShown(tree)).toBe(true);
  tree.unmount();
});
