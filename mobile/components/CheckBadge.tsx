import React from 'react';
import {StyleProp, ViewStyle} from 'react-native';
import Svg, {Circle, Path} from 'react-native-svg';

/**
 * "All clear": a white circle with a green tick, on the green "No alerts" card and the empty
 * Alerts tab. Drawn instead of the ✅ emoji, which is a green square on the green card and
 * looks different on every phone.
 */
const CheckBadge = ({size, style}: {size: number; style?: StyleProp<ViewStyle>}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" style={style}>
    <Circle cx={12} cy={12} r={12} fill="#FFFFFF" />
    <Path
      d="M6.5 12.5L10.5 16.5L17.5 8.5"
      stroke="#2E7D32"
      strokeWidth={2.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </Svg>
);

export default CheckBadge;
