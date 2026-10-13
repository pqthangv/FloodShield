import React from 'react';
import {ActivityIndicator, Image, Modal, StatusBar, StyleSheet, TouchableOpacity, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Svg, {Line} from 'react-native-svg';
import {useI18n} from '../i18n';

interface Props {
  // The photo to show; null keeps the viewer closed.
  uri: string | null;
  onClose: () => void;
}

/** A community photo on a black full screen, whole rather than cropped. The ✕ or Android's back button closes it. */
const PhotoViewer = ({uri, onClose}: Props) => {
  const {t} = useI18n();
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={uri !== null}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent>
      <StatusBar barStyle="light-content" />
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#FFFFFF" style={StyleSheet.absoluteFill} />
        {uri && <Image source={{uri}} style={styles.photo} resizeMode="contain" />}
        <TouchableOpacity
          style={[styles.close, {top: insets.top + 12, right: insets.right + 12}]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('close')}
          hitSlop={12}>
          <Svg width={24} height={24} viewBox="0 0 24 24">
            <Line x1={5} y1={5} x2={19} y2={19} stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" />
            <Line x1={19} y1={5} x2={5} y2={19} stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" />
          </Svg>
        </TouchableOpacity>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  // Large and dark with a white edge, so it shows on both dark and bright photos.
  close: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.8)',
  },
});

export default PhotoViewer;
