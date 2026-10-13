import React from 'react';
import {StyleProp, ViewStyle} from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  Line,
  LinearGradient,
  Path,
  Polygon,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import {WeatherIcon as Condition} from '../services/model';

// Weather pictures drawn on a 128 x 128 grid, so they stay sharp at any size.

const CLOUD_TONES = {
  light: ['#FFFFFF', '#F2F6FB', '#D3DEEC', '#B2C4DB'],
  rain: ['#F2F5FA', '#D9E2EE', '#AFC0D6', '#8499B8'],
  storm: ['#D9E0EA', '#B3C1D3', '#8597B0', '#64789A'],
};

type Point = [number, number];
type Part =
  | {kind: 'sun' | 'moon'; cx: number; cy: number; r: number}
  | {kind: 'stars'; stars: [number, number, number][]}
  | {kind: 'cloud'; x: number; y: number; s: number; tone: keyof typeof CLOUD_TONES}
  | {kind: 'drops'; points: Point[]; s: number}
  | {kind: 'bolt'; x: number; y: number; s: number}
  | {kind: 'flakes'; points: Point[]; r: number}
  | {kind: 'zzz'; zeds: [number, number, number][]};

export function partsFor(icon: Condition, night: boolean): Part[] {
  const sky = (sun: Part, ...atNight: Part[]): Part[] => (night ? atNight : [sun]);
  switch (icon) {
    case 'clear':
      return sky(
        {kind: 'sun', cx: 64, cy: 64, r: 30},
        {kind: 'moon', cx: 66, cy: 64, r: 40},
        {kind: 'zzz', zeds: [[70, 55, 6], [79, 42, 8.8], [93, 25, 12]]},
        {kind: 'stars', stars: [[112, 86, 4], [34, 22, 3.5]]},
      );
    case 'drizzle':
      return [
        ...sky({kind: 'sun', cx: 84, cy: 38, r: 20}, {kind: 'moon', cx: 88, cy: 38, r: 24}),
        {kind: 'cloud', x: 4, y: 36, s: 1.05, tone: 'light'},
        {kind: 'drops', points: [[44, 113], [70, 113]], s: 10},
      ];
    case 'rain':
      return [
        {kind: 'cloud', x: 46, y: 8, s: 0.72, tone: 'rain'},
        {kind: 'cloud', x: 2, y: 26, s: 1.12, tone: 'rain'},
        {kind: 'drops', points: [[36, 107], [62, 113], [88, 107]], s: 11},
      ];
    case 'thunderstorm':
      return [
        ...sky({kind: 'sun', cx: 86, cy: 36, r: 20}, {kind: 'moon', cx: 90, cy: 36, r: 23}),
        {kind: 'cloud', x: 4, y: 34, s: 1.05, tone: 'storm'},
        {kind: 'bolt', x: 47, y: 80, s: 1},
      ];
    case 'snow':
      return [
        {kind: 'cloud', x: 2, y: 24, s: 1.12, tone: 'light'},
        {kind: 'flakes', points: [[36, 106], [64, 114], [92, 106]], r: 9},
      ];
    default:
      return [
        ...sky(
          {kind: 'sun', cx: 82, cy: 46, r: 22},
          {kind: 'moon', cx: 84, cy: 44, r: 28},
          {kind: 'stars', stars: [[28, 30, 5], [44, 16, 3.5]]},
        ),
        {kind: 'cloud', x: 4, y: 50, s: 1.05, tone: 'light'},
      ];
  }
}

const n = (v: number) => Math.round(v * 100) / 100;
const rad = (deg: number) => (deg * Math.PI) / 180;

const Sun = ({cx, cy, r}: {cx: number; cy: number; r: number}) => {
  const rays = [];
  for (let k = 0; k < 8; k++) {
    const a = rad(k * 45 - 90);
    const at = (f: number) => ({x: n(cx + Math.cos(a) * r * f), y: n(cy + Math.sin(a) * r * f)});
    const [o1, o2, h1, h2] = [at(1.32), at(1.72), at(1.36), at(1.6)];
    rays.push(
      <Line key={`o${k}`} x1={o1.x} y1={o1.y} x2={o2.x} y2={o2.y} stroke="#FFBE2E"
        strokeWidth={n(r * 0.22)} strokeLinecap="round" />,
      <Line key={`h${k}`} x1={h1.x} y1={h1.y} x2={h2.x} y2={h2.y} stroke="#FFE38A"
        strokeWidth={n(r * 0.07)} strokeLinecap="round" />,
    );
  }
  const gx = n(cx - r * 0.36);
  const gy = n(cy - r * 0.44);
  return (
    <G>
      {rays}
      <Circle cx={cx} cy={cy} r={n(r * 1.12)} fill="#FFF0A8" opacity={0.45} />
      <Circle cx={cx} cy={cy} r={r} fill="url(#sun)" />
      <Ellipse cx={gx} cy={gy} rx={n(r * 0.3)} ry={n(r * 0.16)} transform={`rotate(-35 ${gx} ${gy})`}
        fill="#FFFFFF" opacity={0.6} />
      {[-1, 1].map(side => (
        <G key={side}>
          <Ellipse cx={n(cx + side * r * 0.3)} cy={n(cy - r * 0.02)} rx={n(r * 0.085)} ry={n(r * 0.12)}
            fill="#4A2C12" />
          <Circle cx={n(cx + side * r * 0.3 + r * 0.03)} cy={n(cy - r * 0.07)} r={n(r * 0.03)} fill="#FFFFFF" />
          <Ellipse cx={n(cx + side * r * 0.52)} cy={n(cy + r * 0.2)} rx={n(r * 0.13)} ry={n(r * 0.08)}
            fill="#FF7F50" opacity={0.4} />
        </G>
      ))}
      <Path
        d={`M${n(cx - r * 0.2)} ${n(cy + r * 0.2)} Q${cx} ${n(cy + r * 0.42)} ${n(cx + r * 0.2)} ${n(cy + r * 0.2)}`}
        stroke="#C0392B" strokeWidth={n(r * 0.07)} strokeLinecap="round" fill="none" />
    </G>
  );
};

/** The moon's disc minus a smaller disc to its right: a "C" with room for a face on the left. */
function crescent(cx: number, cy: number, r: number) {
  const [ox, oy, ri] = [r * 0.5, -r * 0.12, r * 0.78];
  const d = Math.hypot(ox, oy);
  const [ux, uy] = [ox / d, oy / d];
  const a = (r * r - ri * ri + d * d) / (2 * d);
  const h = Math.sqrt(r * r - a * a);
  const p1 = `${n(cx + a * ux - h * uy)} ${n(cy + a * uy + h * ux)}`;
  const p2 = `${n(cx + a * ux + h * uy)} ${n(cy + a * uy - h * ux)}`;
  return `M${p1} A${r} ${r} 0 1 1 ${p2} A${n(ri)} ${n(ri)} 0 0 0 ${p1} Z`;
}

const MOON_INK = '#3D2B7A';

/** A sleeping moon: closed eyes, a small smile and pink cheeks. */
const Moon = ({cx, cy, r}: {cx: number; cy: number; r: number}) => {
  const [fx, fy] = [cx - r * 0.62, cy];
  const line = {stroke: MOON_INK, strokeLinecap: 'round' as const, fill: 'none'};
  return (
    <G>
      <Path d={crescent(cx, cy, r)} fill="url(#moon)" />
      {[-1, 1].map(side => {
        const ex = fx + side * r * 0.15;
        return (
          <G key={side}>
            <Path
              d={`M${n(ex - r * 0.075)} ${n(fy - r * 0.05)} Q${n(ex)} ${n(fy + r * 0.03)} ${n(ex + r * 0.075)} ${n(fy - r * 0.05)}`}
              strokeWidth={n(r * 0.045)} {...line} />
            <Ellipse cx={n(fx + side * r * 0.25)} cy={n(fy + r * 0.09)} rx={n(r * 0.075)} ry={n(r * 0.045)}
              fill="#FF8FB1" opacity={0.6} />
          </G>
        );
      })}
      <Path
        d={`M${n(fx - r * 0.06)} ${n(fy + r * 0.13)} Q${n(fx)} ${n(fy + r * 0.2)} ${n(fx + r * 0.06)} ${n(fy + r * 0.13)}`}
        strokeWidth={n(r * 0.04)} {...line} />
    </G>
  );
};

/** "z Z Z", drawn as lines so they stay sharp. */
const Zzz = ({zeds}: {zeds: [number, number, number][]}) => (
  <G stroke="#5B4BC4" strokeLinecap="round" strokeLinejoin="round" fill="none">
    {zeds.map(([x, y, s]) => (
      <Path key={x} d={`M${x} ${y} H${n(x + s)} L${x} ${n(y + s)} H${n(x + s)}`} strokeWidth={n(Math.max(1.6, s * 0.2))} />
    ))}
  </G>
);

const Cloud = ({x, y, s, tone, gradient}: {x: number; y: number; s: number; tone: keyof typeof CLOUD_TONES; gradient: string}) => {
  const edge = CLOUD_TONES[tone][3];
  // Bumps and base on the cloud's own grid, moved to (x, y) and scaled by s.
  const shapes = (paint: object) => [
    <Circle key="l" cx={n(x + 30 * s)} cy={n(y + 38 * s)} r={n(18 * s)} {...paint} />,
    <Circle key="t" cx={n(x + 52 * s)} cy={n(y + 28 * s)} r={n(24 * s)} {...paint} />,
    <Circle key="r" cx={n(x + 76 * s)} cy={n(y + 36 * s)} r={n(17 * s)} {...paint} />,
    <Rect key="b" x={n(x + 12 * s)} y={n(y + 34 * s)} width={n(80 * s)} height={n(26 * s)} rx={n(13 * s)} {...paint} />,
  ];
  const hx = n(x + 40 * s);
  const hy = n(y + 17 * s);
  // Outlined shapes first, then the same shapes filled on top: only the outer edge stays visible.
  return (
    <G>
      {shapes({fill: edge, stroke: edge, strokeWidth: n(2.4 * s)})}
      {shapes({fill: `url(#${gradient})`})}
      <Ellipse cx={hx} cy={hy} rx={n(9 * s)} ry={n(4.5 * s)} transform={`rotate(-20 ${hx} ${hy})`}
        fill="#FFFFFF" opacity={0.9} />
    </G>
  );
};

const Drops = ({points, s}: {points: Point[]; s: number}) => (
  <G>
    {points.map(([x, y]) => (
      <G key={x}>
        <Path
          d={`M${x} ${n(y - s)} C${n(x + 0.15 * s)} ${n(y - 0.6 * s)} ${n(x + 0.6 * s)} ${n(y - 0.1 * s)} ` +
            `${n(x + 0.6 * s)} ${n(y + 0.3 * s)} A${n(0.6 * s)} ${n(0.6 * s)} 0 0 1 ${n(x - 0.6 * s)} ${n(y + 0.3 * s)} ` +
            `C${n(x - 0.6 * s)} ${n(y - 0.1 * s)} ${n(x - 0.15 * s)} ${n(y - 0.6 * s)} ${x} ${n(y - s)} Z`}
          fill="url(#drop)" />
        <Ellipse cx={n(x - 0.24 * s)} cy={n(y + 0.2 * s)} rx={n(0.12 * s)} ry={n(0.22 * s)} fill="#FFFFFF"
          opacity={0.65} />
      </G>
    ))}
  </G>
);

const BOLT: Point[] = [[10, 0], [22, 0], [15, 15], [24, 15], [6, 42], [11, 22], [3, 22]];

const Bolt = ({x, y, s}: {x: number; y: number; s: number}) => (
  <Polygon points={BOLT.map(([px, py]) => `${n(x + px * s)},${n(y + py * s)}`).join(' ')} fill="url(#bolt)"
    stroke="#E08E00" strokeWidth={n(1.6 * s)} strokeLinejoin="round" />
);

const Flakes = ({points, r}: {points: Point[]; r: number}) => {
  const lines: Point[][] = [];
  for (const [x, y] of points) {
    for (let k = 0; k < 3; k++) {
      const a = rad(90 + k * 60);
      const [dx, dy] = [Math.cos(a) * r, Math.sin(a) * r];
      lines.push([[x - dx, y - dy], [x + dx, y + dy]]);
      // Two small branches on each arm.
      for (const sign of [1, -1]) {
        const [bx, by] = [x + sign * dx * 0.55, y + sign * dy * 0.55];
        for (const turn of [-1, 1]) {
          const b = a + (sign === 1 ? 0 : Math.PI) + turn * rad(40);
          lines.push([[bx, by], [bx + Math.cos(b) * r * 0.35, by + Math.sin(b) * r * 0.35]]);
        }
      }
    }
  }
  return (
    <G stroke="#3F97EA" strokeWidth={n(r * 0.2)} strokeLinecap="round">
      {lines.map(([[x1, y1], [x2, y2]], i) => (
        <Line key={i} x1={n(x1)} y1={n(y1)} x2={n(x2)} y2={n(y2)} />
      ))}
    </G>
  );
};

const Star = ({x, y, s}: {x: number; y: number; s: number}) => (
  <Path
    d={`M${x} ${y - s} Q${x} ${y} ${x + s} ${y} Q${x} ${y} ${x} ${y + s} Q${x} ${y} ${x - s} ${y} Q${x} ${y} ${x} ${y - s} Z`}
    fill="#FFE27A" />
);

interface Props {
  icon?: Condition;
  // Moon instead of sun.
  night?: boolean;
  size: number;
  style?: StyleProp<ViewStyle>;
}

const WeatherIcon = ({icon = 'cloudy', night = false, size, style}: Props) => {
  const parts = partsFor(icon, night);
  return (
    <Svg width={size} height={size} viewBox="0 0 128 128" style={style}>
      <Defs>
        <RadialGradient id="sun" cx="38%" cy="32%" r="75%">
          <Stop offset="0" stopColor="#FFF6B8" />
          <Stop offset="0.35" stopColor="#FFD94A" />
          <Stop offset="0.8" stopColor="#FFB627" />
          <Stop offset="1" stopColor="#F59E1B" />
        </RadialGradient>
        <LinearGradient id="moon" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0" stopColor="#D3C8FF" />
          <Stop offset="0.45" stopColor="#9C8CF8" />
          <Stop offset="1" stopColor="#6A55E0" />
        </LinearGradient>
        <LinearGradient id="drop" x1="30%" y1="0%" x2="70%" y2="100%">
          <Stop offset="0" stopColor="#8FDBFF" />
          <Stop offset="0.55" stopColor="#2F8CEB" />
          <Stop offset="1" stopColor="#1565C0" />
        </LinearGradient>
        <LinearGradient id="bolt" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0" stopColor="#FFE45C" />
          <Stop offset="1" stopColor="#FFB300" />
        </LinearGradient>
        {/* One top-to-bottom shade per cloud, across all its bumps, so they blend into one shape. */}
        {parts.map((p, i) =>
          p.kind === 'cloud' ? (
            <LinearGradient key={i} id={`cloud${i}`} gradientUnits="userSpaceOnUse"
              x1="0" y1={n(p.y + 4 * p.s)} x2="0" y2={n(p.y + 60 * p.s)}>
              <Stop offset="0" stopColor={CLOUD_TONES[p.tone][0]} />
              <Stop offset="0.6" stopColor={CLOUD_TONES[p.tone][1]} />
              <Stop offset="1" stopColor={CLOUD_TONES[p.tone][2]} />
            </LinearGradient>
          ) : null,
        )}
      </Defs>
      {parts.map((p, i) => {
        switch (p.kind) {
          case 'sun':
            return <Sun key={i} cx={p.cx} cy={p.cy} r={p.r} />;
          case 'moon':
            return <Moon key={i} cx={p.cx} cy={p.cy} r={p.r} />;
          case 'stars':
            return <G key={i}>{p.stars.map(([x, y, s]) => <Star key={x} x={x} y={y} s={s} />)}</G>;
          case 'cloud':
            return <Cloud key={i} x={p.x} y={p.y} s={p.s} tone={p.tone} gradient={`cloud${i}`} />;
          case 'drops':
            return <Drops key={i} points={p.points} s={p.s} />;
          case 'bolt':
            return <Bolt key={i} x={p.x} y={p.y} s={p.s} />;
          case 'flakes':
            return <Flakes key={i} points={p.points} r={p.r} />;
          case 'zzz':
            return <Zzz key={i} zeds={p.zeds} />;
        }
      })}
    </Svg>
  );
};

export default WeatherIcon;
