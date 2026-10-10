/* eslint-env jest */
// Native modules are not available in Jest; replace them with simple fakes.

jest.mock('@react-native-async-storage/async-storage', () => {
  let store = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async key => (key in store ? store[key] : null)),
      setItem: jest.fn(async (key, value) => {
        store[key] = value;
      }),
      removeItem: jest.fn(async key => {
        delete store[key];
      }),
      clear: jest.fn(async () => {
        store = {};
      }),
    },
  };
});

jest.mock('@react-native-community/geolocation', () => ({
  getCurrentPosition: jest.fn((success, error) =>
    error({code: 2, message: 'No GPS in tests'}),
  ),
  watchPosition: jest.fn(),
  clearWatch: jest.fn(),
  setRNConfiguration: jest.fn(),
}));

jest.mock('react-native-image-picker', () => ({
  launchCamera: jest.fn(async () => ({didCancel: true})),
  launchImageLibrary: jest.fn(async () => ({didCancel: true})),
}));

jest.mock('./specs/NativeAlertScheduler', () => ({
  __esModule: true,
  default: {configure: jest.fn(), markSeen: jest.fn(), checkNow: jest.fn()},
}));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const {View} = require('react-native');
  const insets = {top: 0, right: 0, bottom: 0, left: 0};
  const frame = {x: 0, y: 0, width: 390, height: 844};
  return {
    SafeAreaProvider: ({children}) => children,
    SafeAreaView: ({children, ...props}) => React.createElement(View, props, children),
    SafeAreaInsetsContext: React.createContext(insets),
    SafeAreaFrameContext: React.createContext(frame),
    useSafeAreaInsets: () => insets,
    useSafeAreaFrame: () => frame,
    initialWindowMetrics: {insets, frame},
  };
});

// Tests run in Node, whose locale is usually en-US. Pin Vietnamese (the app's default for its
// main audience); English is tested explicitly where needed.
require('./i18n').setLanguageForTests('vi');
