import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {Path} from 'react-native-svg';
import {GIVE_UP_MS, TourProvider, useTourScroll, useTourTarget} from '../components/tour/Tour';
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
const sentence = (tree: Tree) =>
  tree.root.find(node => node.type === Text && styleOf(node).fontWeight === '600' && styleOf(node).lineHeight)
    .props.children;
/** Where the yellow ring around the lit element is. */
const ring = (tree: Tree) => {
  const {top, left, width, height} = styleOf(
    view(tree, node => styleOf(node).borderColor === '#FFD54F'),
  ) as {top: number; left: number; width: number; height: number};
  return {top, left, width, height};
};
const captionShown = (tree: Tree) =>
  tree.root.findAll(node => node.type === View && styleOf(node).backgroundColor === 'white').length > 0;

/** The button with this label. */
function button(tree: Tree, label: string) {
  let node = tree.root.find(n => n.type === Text && n.props.children === label);
  while (!node.props.onPress) {
    node = node.parent!;
  }
  return node;
}

/** The tour on the targets; `answer`: the views answer measurements (Jest's measure nothing). */
async function openTour(answer: boolean) {
  let tree!: Tree;
  await act(async () => {
    tree = ReactTestRenderer.create(
      <TourProvider active onFinish={() => {}}>
        <Targets />
      </TourProvider>,
    );
  });
  const place = (node: Node, rect: Rect) => {
    node.instance.measureInWindow = (done: (...r: Rect) => void) => done(...rect);
  };
  const overlay = view(tree, node => node.props.accessibilityViewIsModal);
  if (answer) {
    for (const id of Object.keys(RECTS)) {
      place(view(tree, node => node.props.testID === id), RECTS[id]);
    }
    place(overlay, [0, 0, 390, 844]);
  }
  return {tree, overlay};
}

const layOut = (overlay: Node) =>
  act(async () => {
    overlay.props.onLayout({nativeEvent: {layout: {x: 0, y: 0, width: 390, height: 844}}});
  });

const wait = (ms: number) =>
  act(async () => {
    jest.advanceTimersByTime(ms);
  });

test('at the first step, no box until the alerts card is found, then the box by it', async () => {
  const {tree, overlay} = await openTour(true);
  await layOut(overlay);
  // Measured 50 ms after the layout: until then nothing, not even the dimming (the box used to sit
  // in the middle, and then the screen went dark before the card was lit).
  const dimmed = () => tree.root.findAll(node => node.type === Path).length > 0;
  expect(captionShown(tree)).toBe(false);
  expect(dimmed()).toBe(false);
  await wait(40);
  expect(captionShown(tree)).toBe(false);
  expect(dimmed()).toBe(false);
  await wait(20);
  // Then all together.
  expect(captionShown(tree)).toBe(true);
  expect(dimmed()).toBe(true);
  expect(caption(tree).top).toBeGreaterThan(420);
  expect(ringShown(tree)).toBe(true);
  await act(async () => tree.unmount());
});

test('an element never measured: the box still comes, in the middle, and Skip works', async () => {
  const {tree, overlay} = await openTour(false);
  await layOut(overlay);
  await wait(GIVE_UP_MS - 10);
  expect(captionShown(tree)).toBe(false);
  await wait(10);
  expect(captionShown(tree)).toBe(true);
  expect(caption(tree).top).toBe('22%');
  expect(ringShown(tree)).toBe(false);
  await act(async () => button(tree, translate('tourSkip')).props.onPress());
  expect(tree.root.findAll(n => n.type === Text && n.props.children === translate('tourLocationTitle'))).toHaveLength(1);
  await act(async () => tree.unmount());
});

test('no layout at all: the box still comes after GIVE_UP_MS (never a dimmed screen without buttons)', async () => {
  const {tree} = await openTour(false);
  await wait(GIVE_UP_MS);
  expect(captionShown(tree)).toBe(true);
  // Next works and the next step's box shows at once (in the middle, as the last one).
  await act(async () => button(tree, translate('tourNext')).props.onPress());
  expect(captionShown(tree)).toBe(true);
  expect(tree.root.findAll(n => n.type === Text && n.props.children === translate('tourShelters'))).toHaveLength(1);
  await act(async () => tree.unmount());
});

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

  // Right after "Next": step 1 exactly as it was (same place, same sentence, the alerts card still
  // lit), never the middle; changing the sentence and dimming the card first looked like a flash.
  const ringBefore = ring(tree);
  expect(caption(tree).top).toBe(first.top);
  expect(sentence(tree)).toBe(translate('tourAlerts'));
  expect(ring(tree)).toEqual(ringBefore);

  await act(async () => {
    jest.advanceTimersByTime(100);
  });

  // Step 2, all at once: the shelters button is in the bottom half, so the box moves above it.
  const second = caption(tree);
  expect(second.top).toBeUndefined();
  expect(second.bottom).toBeGreaterThan(0);
  expect(sentence(tree)).toBe(translate('tourShelters'));
  expect(ring(tree).top).toBeGreaterThan(ringBefore.top);
  await act(async () => tree.unmount());
});

test('when the next button is below the screen, the lit card moves with the scroll, then all changes at once', async () => {
  // The shelters button starts below the visible part (more than 82 % down): the tour scrolls.
  const rects: Record<string, Rect> = {...RECTS, shelters: [20, 760, 170, 80]};
  let scrolled = 0;
  const Scrolling = () => {
    const scroll = useTourScroll();
    React.useEffect(() => {
      // The home screen's ScrollView: scrolling moves every element up and reports the new offset.
      scroll.ref({
        scrollTo: ({y}: {y: number}) => {
          scrolled = y;
          scroll.onScroll({nativeEvent: {contentOffset: {y}}} as never);
        },
      } as never);
    }, [scroll]);
    return <Targets />;
  };
  let tree!: Tree;
  await act(async () => {
    tree = ReactTestRenderer.create(
      <TourProvider active onFinish={() => {}}>
        <Scrolling />
      </TourProvider>,
    );
  });
  for (const id of Object.keys(rects)) {
    view(tree, node => node.props.testID === id).instance.measureInWindow = (done: (...r: Rect) => void) => {
      const [x, y, w, h] = rects[id];
      done(x, y - scrolled, w, h);
    };
  }
  const overlay = view(tree, node => node.props.accessibilityViewIsModal);
  overlay.instance.measureInWindow = (done: (...r: Rect) => void) => done(0, 0, 390, 844);
  await layOut(overlay);
  await wait(100);
  const before = ring(tree);

  await act(async () => button(tree, translate('tourNext')).props.onPress());
  await wait(60);
  // Scrolled: the alerts card, still lit with step 1's sentence, moved up with the screen.
  expect(scrolled).toBeGreaterThan(0);
  expect(sentence(tree)).toBe(translate('tourAlerts'));
  expect(ring(tree).top).toBeCloseTo(before.top - scrolled, 5);

  // Measured again after the scroll (350 ms, a smooth scroll): step 2 at the shelters button.
  await wait(250);
  expect(sentence(tree)).toBe(translate('tourAlerts'));
  await wait(100);
  expect(sentence(tree)).toBe(translate('tourShelters'));
  // (The ring sits PAD outside the element: before.top = 300 - PAD.)
  expect(ring(tree).top).toBeCloseTo(760 - scrolled - (300 - before.top), 5);
  await act(async () => tree.unmount());
});
