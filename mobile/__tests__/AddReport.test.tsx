import React from 'react';
import {Image, Modal, Text} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {launchImageLibrary} from 'react-native-image-picker';
import AddReport from '../views/report/AddReport';
import {translate} from '../i18n';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({goBack: jest.fn()}),
  useIsFocused: () => true,
}));

jest.mock('../context/AppContext', () => ({
  useApp: () => ({location: null, weather: null}),
  locationLabel: () => '',
}));

type Tree = ReactTestRenderer.ReactTestRenderer;
type Node = ReactTestRenderer.ReactTestInstance;

const PHOTO = 'file:///photo.jpg';

/** The button around the text, or with this accessibility role. */
const button = (tree: Tree, match: (node: Node) => boolean) =>
  tree.root.findAll(node => typeof node.props.onPress === 'function' && match(node))[0];
const withText = (text: string) => (node: Node) =>
  node.findAll(child => child.type === Text && child.props.children === text).length > 0;

const press = async (node: Node) => {
  await act(async () => {
    node.props.onPress();
  });
};

// The preview in the post (the viewer shows the same photo, but without the ✕ label).
const previewShown = (tree: Tree) =>
  tree.root.findAll(node => node.type === Image && node.props.source?.uri === PHOTO).length > 0 &&
  tree.root.findAll(withText(translate('removePhoto'))).length > 0;
const viewerOpen = (tree: Tree) => tree.root.findByType(Modal).props.visible;

test('tapping the chosen photo shows it full screen; only ✕ removes it', async () => {
  (launchImageLibrary as jest.Mock).mockResolvedValueOnce({
    assets: [{uri: PHOTO, type: 'image/jpeg', fileName: 'photo.jpg'}],
  });
  let tree!: Tree;
  await act(async () => {
    tree = ReactTestRenderer.create(<AddReport />);
  });
  await press(button(tree, withText(translate('choosePhoto'))));
  expect(previewShown(tree)).toBe(true);
  expect(viewerOpen(tree)).toBe(false);

  // Tapping the photo opens the viewer, and the photo stays in the post.
  await press(button(tree, node => node.props.accessibilityRole === 'imagebutton'));
  expect(viewerOpen(tree)).toBe(true);
  expect(previewShown(tree)).toBe(true);

  // Closing the viewer keeps the photo too.
  await act(async () => {
    tree.root.findByType(Modal).props.onRequestClose();
  });
  expect(viewerOpen(tree)).toBe(false);
  expect(previewShown(tree)).toBe(true);

  // ✕ removes it, and the camera / gallery buttons are back.
  await press(button(tree, withText(translate('removePhoto'))));
  expect(previewShown(tree)).toBe(false);
  expect(button(tree, withText(translate('choosePhoto')))).toBeDefined();
});
