import React from 'react';
import {Animated, Dimensions, StyleSheet} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';
import EmergencyContactsScreen from '../components/home/EmergencyContactsScreen';
import ThoiTietTab from '../components/predict/ThoiTietTab';
import WeatherIcon from '../components/WeatherIcon';
import {LayoutProvider, MAX_WIDTH} from '../services/layout';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({goBack: jest.fn()}),
  useIsFocused: () => true,
}));

// A small forecast: two hours and two days.
jest.mock('../context/AppContext', () => {
  const hour = (time: string) => ({time, icon: 'rain', temperature: 27, precipitation_probability: 60});
  const day = (date: string) => ({
    date, icon: 'rain', temperature_max: 31, temperature_min: 25, condition: 'Rain',
    precipitation_sum: 12, precipitation_probability_max: 80,
    sunrise: `${date}T05:44`, sunset: `${date}T17:28`,
  });
  const app = {
    weather: {
      current: {time: '2026-11-01T10:00'},
      hourly: [hour('2026-11-01T10:00'), hour('2026-11-01T11:00')],
      daily: [day('2026-11-01'), day('2026-11-02')],
    },
    weatherError: null,
    loading: false,
    refresh: jest.fn(),
  };
  return {useApp: () => app};
});

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

test("the Forecast tab's weather pictures follow the screen while it is open", () => {
  setWindow(402, 874);
  const tree = render(<ThoiTietTab />);
  // Two hours (8 % of the width) and two days (11 %).
  const sizes = () => tree.root.findAllByType(WeatherIcon).map(icon => icon.props.size);
  expect(sizes()).toEqual([402 * 0.08, 402 * 0.08, 402 * 0.11, 402 * 0.11]);
  setWindow(701, 841);
  expect(sizes()).toEqual([MAX_WIDTH * 0.08, MAX_WIDTH * 0.08, MAX_WIDTH * 0.11, MAX_WIDTH * 0.11]);
  act(() => tree.unmount());
});
