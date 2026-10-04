import React from 'react';
import {StatusBar, StatusBarProps} from 'react-native';
import {useIsFocused} from '@react-navigation/native';

interface CustomStatusBarProps extends StatusBarProps {
  // Kept for the screens' color intent. Android 15+ always draws the app edge-to-edge, so the
  // color behind the status bar comes from each screen's SafeAreaView background instead.
  backgroundColor?: string;
}

const CustomStatusBar: React.FC<CustomStatusBarProps> = props => {
  const isFocused = useIsFocused();

  return isFocused ? <StatusBar barStyle={props.barStyle} /> : null;
};

export default CustomStatusBar;
