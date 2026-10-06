import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import Svg, {Circle, Line, Path} from 'react-native-svg';
import {timeOf} from '../../services/format';
import {useI18n} from '../../i18n';
import {vw} from '../../services/styleProps';

interface Props {
  sunrise?: string;
  sunset?: string;
  // UTC offset of the location (from the API), so the sun is right whatever the phone's time zone.
  utcOffsetSeconds?: number;
}

/** "2026-10-04T05:41" in the location's local time -> epoch milliseconds. */
function toEpoch(local: string, utcOffsetSeconds: number) {
  const [date, time = '00:00'] = local.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return Date.UTC(y, m - 1, d, hh, mm) - utcOffsetSeconds * 1000;
}

/** Arc from sunrise to sunset with the sun at its current position. */
const SunPath = ({sunrise, sunset, utcOffsetSeconds = 7 * 3600}: Props) => {
  const {t} = useI18n();
  const width = vw(84);
  const height = vw(24);
  const baseY = height - 8;
  const left = 16;
  const right = width - 16;

  let progress: number | null = null;
  if (sunrise && sunset) {
    const start = toEpoch(sunrise, utcOffsetSeconds);
    const end = toEpoch(sunset, utcOffsetSeconds);
    const now = Date.now();
    if (now >= start && now <= end) {
      progress = (now - start) / (end - start);
    }
  }

  // Quadratic curve; its highest point is halfway between baseY and controlY.
  const controlY = -height * 0.55;
  const path = `M ${left} ${baseY} Q ${width / 2} ${controlY} ${right} ${baseY}`;
  // Point on the curve at fraction f (0 = sunrise, 1 = sunset).
  const point = (f: number) => ({
    x: (1 - f) ** 2 * left + 2 * (1 - f) * f * (width / 2) + f ** 2 * right,
    y: (1 - f) ** 2 * baseY + 2 * (1 - f) * f * controlY + f ** 2 * baseY,
  });
  const sun = progress !== null ? point(progress) : null;

  return (
    <View style={styles.container}>
      <View style={styles.labels}>
        <View>
          <Text style={styles.label}>{t('sunrise')}</Text>
          <Text style={styles.time}>{sunrise ? timeOf(sunrise) : '--:--'}</Text>
        </View>
        <View style={styles.right}>
          <Text style={styles.label}>{t('sunset')}</Text>
          <Text style={styles.time}>{sunset ? timeOf(sunset) : '--:--'}</Text>
        </View>
      </View>
      <Svg width={width} height={height}>
        <Line
          x1={0}
          y1={baseY}
          x2={width}
          y2={baseY}
          stroke="#C4C4C4"
          strokeDasharray="3 3"
        />
        <Path d={path} stroke="#A0D2FA" strokeWidth={3} fill="none" />
        {sun && <Circle cx={sun.x} cy={sun.y} r={9} fill="#FFB300" />}
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  labels: {
    width: vw(84),
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  right: {
    alignItems: 'flex-end',
  },
  label: {
    fontSize: vw(3.2),
    color: '#808080',
  },
  time: {
    fontSize: vw(4),
    color: '#404040',
    fontWeight: '600',
  },
});

export default SunPath;
