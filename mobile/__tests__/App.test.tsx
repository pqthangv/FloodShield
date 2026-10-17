/**
 * @format
 */

import React from 'react';
import {View} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Geolocation from '@react-native-community/geolocation';
import App from '../App';

// No server in tests: every API call fails, and the app must still render its screens.
jest.mock('../services/axiosClient', () => {
  const actual = jest.requireActual('../services/axiosClient');
  const fail = jest.fn(() => Promise.reject(new Error('offline')));
  return {
    ...actual,
    __esModule: true,
    default: {get: fail, post: fail, delete: fail, defaults: {}},
    initApiBaseUrl: jest.fn(async () => 'http://test/api/v1'),
  };
});

// The notification permission and the background checker are native, and the app asks for them
// after its screens are up: leave them out, so nothing still runs once a test is over.
jest.mock('../services/alertNotifications', () => ({
  requestNotificationPermission: jest.fn(async () => false),
  syncAlertScheduler: jest.fn(),
  rememberRiver: jest.fn(),
  markAlertsSeen: jest.fn(),
  checkAlertsNow: jest.fn(),
}));

function visibleText(node: any): string {
  if (typeof node === 'string') {
    return node;
  }
  if (Array.isArray(node)) {
    return node.map(visibleText).join(' ');
  }
  return node?.children ? visibleText(node.children) : '';
}

async function open() {
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(<App />);
  });
  return tree!;
}

const shown = (tree: ReactTestRenderer.ReactTestRenderer) => visibleText(tree.toJSON());

/**
 * Jest's views have no size and never answer a measurement, so the tour would wait (GIVE_UP_MS)
 * before its first box. As on a phone: the tour's overlay gets the screen, every element a place in
 * its top half, and the tour measures the alerts card.
 */
async function layOutTour(tree: ReactTestRenderer.ReactTestRenderer) {
  const overlay = tree.root.find(node => node.type === View && node.props.accessibilityViewIsModal);
  for (const node of tree.root.findAll(n => n.type === View && n.instance)) {
    const rect = node === overlay ? [0, 0, 390, 844] : [20, 300, 350, 120];
    node.instance.measureInWindow = (done: (...r: number[]) => void) => done(...rect);
  }
  await ReactTestRenderer.act(async () => {
    overlay.props.onLayout({nativeEvent: {layout: {x: 0, y: 0, width: 390, height: 844}}});
  });
  await tourMeasured();
}

/** The tour shows a step once its button is measured, 50 ms after the step starts. */
const tourMeasured = () =>
  ReactTestRenderer.act(() => new Promise<void>(resolve => setTimeout(() => resolve(), 100)));

/** Taps the button with this label. */
async function tap(tree: ReactTestRenderer.ReactTestRenderer, label: string) {
  const [button] = tree.root.findAll(
    node =>
      typeof node.props.onPress === 'function' &&
      node.findAll(child => child.children.includes(label)).length > 0,
  );
  await ReactTestRenderer.act(async () => button.props.onPress());
}

const gps = Geolocation.watchPosition as jest.Mock;

beforeEach(async () => {
  await AsyncStorage.clear();
  gps.mockClear();
});

test('first launch: a tour over the home screen, and the location only after it explains why', async () => {
  const tree = await open();
  await layOutTour(tree);
  expect(shown(tree)).toContain('Cảnh báo mưa lớn, lũ và bão cho nơi bạn ở hiện ở đây.');
  await tap(tree, 'Tiếp');
  await tourMeasured();
  expect(shown(tree)).toContain('Bấm vào đây để tìm nơi sơ tán gần nhất, kể cả khi mất mạng.');
  await tap(tree, 'Tiếp');
  await tourMeasured();
  expect(shown(tree)).toContain('Bấm vào đây để gọi cấp cứu, cứu hỏa hoặc công an.');
  await tap(tree, 'Tiếp');
  expect(shown(tree)).toContain('Ứng dụng cần vị trí của bạn');
  expect(shown(tree)).not.toContain('Bỏ qua');
  expect(gps).not.toHaveBeenCalled();

  await tap(tree, 'Tiếp tục');
  expect(shown(tree)).not.toContain('Ứng dụng cần vị trí của bạn');
  expect(gps).toHaveBeenCalled();
  await ReactTestRenderer.act(async () => tree.unmount());

  // Only once.
  const again = await open();
  expect(shown(again)).not.toContain('Bỏ qua');
  await ReactTestRenderer.act(async () => again.unmount());
});

test('Skip still explains the location before it is asked for', async () => {
  const tree = await open();
  await layOutTour(tree);
  await tap(tree, 'Bỏ qua');
  expect(shown(tree)).toContain('Ứng dụng cần vị trí của bạn');
  expect(gps).not.toHaveBeenCalled();
  await tap(tree, 'Tiếp tục');
  expect(gps).toHaveBeenCalled();
  await ReactTestRenderer.act(async () => tree.unmount());
});

test('people who used the app before the tour existed see no tour', async () => {
  await AsyncStorage.setItem('location', JSON.stringify({latitude: 16.46, longitude: 107.59, mode: 'gps'}));
  const tree = await open();
  expect(shown(tree)).toContain('Hỗ trợ');
  expect(shown(tree)).not.toContain('Bỏ qua');
  expect(gps).toHaveBeenCalled();
  await ReactTestRenderer.act(async () => tree.unmount());
});

test('renders the home screen without a server or GPS', async () => {
  await AsyncStorage.setItem('welcomeSeen', 'true');
  const tree = await open();
  expect(shown(tree)).toContain('Hỗ trợ');
  expect(shown(tree)).toContain('Liên lạc khẩn cấp');
  await ReactTestRenderer.act(async () => tree.unmount());
});
