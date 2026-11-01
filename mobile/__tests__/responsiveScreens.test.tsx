import React from 'react';
import {Animated, Dimensions, StyleSheet} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';
import EmergencyContactsScreen from '../components/home/EmergencyContactsScreen';
import {LayoutProvider, MAX_WIDTH} from '../services/layout';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({goBack: jest.fn()}),
  useIsFocused: () => true,
}));

function setWindow(width: number, height: number) {
  act(() => {
    Dimensions.set({
      window: {width, height, scale: 3, fontScale: 1},
      screen: {width, height, scale: 3, fontScale: 1},
    });
  });
}

afterEach(() => setWindow(390, 844));

function render(element: React.ReactElement) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    tree = ReactTestRenderer.create(<LayoutProvider>{element}</LayoutProvider>);
  });
  return tree;
}

test('the slide-to-call buttons follow the screen while it is open (fold, open)', () => {
  setWindow(402, 874);
  const tree = render(<EmergencyContactsScreen />);
  // The five round buttons that slide: the Animated.Views with touch handlers and a size (the
  // list's own scroll view has handlers too).
  const widths = () =>
    tree.root
      .findAllByType(Animated.View)
      .filter(v => v.props.onResponderMove)
      .map(v => StyleSheet.flatten(v.props.style)?.width)
      .filter(width => width !== undefined);
  expect(widths()).toEqual(Array(5).fill(402 * 0.13));
  setWindow(701, 841);
  expect(widths()).toEqual(Array(5).fill(MAX_WIDTH * 0.13));
  setWindow(382, 678);
  expect(widths()).toEqual(Array(5).fill(382 * 0.13));
  act(() => tree.unmount());
});
