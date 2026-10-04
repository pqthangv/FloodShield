/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
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

function visibleText(node: any): string {
  if (typeof node === 'string') {
    return node;
  }
  if (Array.isArray(node)) {
    return node.map(visibleText).join(' ');
  }
  return node?.children ? visibleText(node.children) : '';
}

test('renders the home screen without a server or GPS', async () => {
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(<App />);
  });
  const text = visibleText(tree!.toJSON());
  expect(text).toContain('Hỗ trợ');
  expect(text).toContain('Liên lạc khẩn cấp');
  await ReactTestRenderer.act(async () => tree!.unmount());
});
