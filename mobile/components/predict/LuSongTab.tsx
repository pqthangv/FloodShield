import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  GestureResponderEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, {Circle, G, Line, Path, Rect, Text as SvgText} from 'react-native-svg';
import disasterAPI from '../../apis/disasterAPI';
import {useApp} from '../../context/AppContext';
import {errorMessage} from '../../services/axiosClient';
import {parseLocal, shortDate, weekdayName} from '../../services/format';
import {getLanguage, useI18n} from '../../i18n';
import {FloodOutlook, FloodRisk} from '../../services/model';
import {vh, vw} from '../../services/styleProps';

// Chart tokens (light surface). Series uses categorical slot 1; thresholds use status colors.
const C = {
  surface: '#FFFFFF',
  ink: '#0b0b0b',
  inkSecondary: '#52514e',
  muted: '#898781',
  grid: '#e1e0d9',
  baseline: '#c3c2b7',
  series: '#2a78d6',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
  good: '#0ca30c',
};

const RISK_STYLE: Record<FloodRisk, {color: string; icon: string}> = {
  none: {color: C.good, icon: '✓'},
  watch: {color: C.series, icon: 'i'},
  moderate: {color: C.warning, icon: '!'},
  high: {color: C.serious, icon: '!!'},
  severe: {color: C.critical, icon: '!!!'},
  unknown: {color: C.muted, icon: '?'},
};

// 3.771 in Vietnamese, 3,771 in English.
const fmt = (n: number) =>
  Math.round(n).toLocaleString(getLanguage() === 'en' ? 'en-US' : 'vi-VN');

function niceStep(max: number) {
  const raw = max / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const unit = [1, 2, 2.5, 5, 10].find(u => u * pow >= raw) || 10;
  return unit * pow;
}

const DischargeChart = ({data}: {data: FloodOutlook}) => {
  const {t} = useI18n();
  const [selected, setSelected] = useState<number | null>(null);
  const points = data.forecast.filter(p => p.discharge !== null);
  if (points.length < 2) {
    return null;
  }

  const width = vw(84);
  const height = vh(26);
  const pad = {left: vw(13), right: vw(3), top: 12, bottom: 24};
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const thr = data.thresholds;
  const dataMax = Math.max(...points.map(p => p.discharge_high ?? p.discharge ?? 0));
  // Always show the first flood level; higher levels only when the river gets close to them.
  const lines: {value: number; color: string; label: string}[] = [];
  if (thr) {
    lines.push({value: thr.rp2, color: C.warning, label: t('flood2y')});
    if (dataMax >= thr.rp2 * 0.9) {
      lines.push({value: thr.rp5, color: C.serious, label: t('flood5y')});
    }
    if (dataMax >= thr.rp5 * 0.9) {
      lines.push({value: thr.rp20, color: C.critical, label: t('flood20y')});
    }
  }
  const top = Math.max(dataMax, 1, ...lines.map(l => l.value)) * 1.08;
  const step = niceStep(top);
  const yMax = Math.ceil(top / step) * step;
  const ticks = Array.from({length: Math.round(yMax / step) + 1}, (_, i) => i * step);

  const x = (i: number) => pad.left + (i / (points.length - 1)) * plotW;
  const y = (v: number) => pad.top + plotH - (v / yMax) * plotH;

  const linePath = points
    .map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.discharge!).toFixed(1)}`)
    .join(' ');
  const band = points.every(p => p.discharge_low !== null && p.discharge_high !== null)
    ? points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.discharge_high!)}`).join(' ') +
      ' ' +
      [...points]
        .map((p, i) => ({p, i}))
        .reverse()
        .map(({p, i}) => `L${x(i)},${y(p.discharge_low!)}`)
        .join(' ') +
      ' Z'
    : null;
  const todayIndex = points.findIndex(p => p.is_forecast);
  const labelEvery = Math.ceil(points.length / 5);

  const select = (e: GestureResponderEvent) => {
    const px = e.nativeEvent.locationX - pad.left;
    const i = Math.round((px / plotW) * (points.length - 1));
    setSelected(Math.max(0, Math.min(points.length - 1, i)));
  };
  const sel = selected !== null ? points[selected] : null;

  return (
    <View>
      <View style={styles.tooltip}>
        {sel ? (
          <Text style={styles.tooltipText}>
            {weekdayName(parseLocal(sel.date))}, {shortDate(sel.date)}:{' '}
            <Text style={styles.tooltipValue}>{fmt(sel.discharge!)} m³/s</Text>
            {sel.discharge_low !== null && sel.discharge_high !== null
              ? t('flowRange', {low: fmt(sel.discharge_low), high: fmt(sel.discharge_high)})
              : ''}
          </Text>
        ) : (
          <Text style={styles.tooltipHint}>{t('chartHint')}</Text>
        )}
      </View>
      <View
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={select}
        onResponderMove={select}
        accessible
        accessibilityLabel={t('chartA11y')}>
        <Svg width={width} height={height}>
          <Rect x={0} y={0} width={width} height={height} fill={C.surface} />
          {ticks.map(tick => (
            <G key={tick}>
              <Line
                x1={pad.left}
                x2={width - pad.right}
                y1={y(tick)}
                y2={y(tick)}
                stroke={tick === 0 ? C.baseline : C.grid}
                strokeWidth={1}
              />
              <SvgText
                x={pad.left - 6}
                y={y(tick) + 4}
                fontSize={vw(2.8)}
                fill={C.muted}
                textAnchor="end">
                {fmt(tick)}
              </SvgText>
            </G>
          ))}
          {todayIndex > 0 && (
            <G>
              <Line
                x1={x(todayIndex)}
                x2={x(todayIndex)}
                y1={pad.top}
                y2={pad.top + plotH}
                stroke={C.baseline}
                strokeWidth={1}
              />
              <SvgText
                x={x(todayIndex) + 4}
                y={pad.top + 10}
                fontSize={vw(2.8)}
                fill={C.inkSecondary}>
                {t('today')}
              </SvgText>
            </G>
          )}
          {band && <Path d={band} fill={C.series} fillOpacity={0.1} />}
          {lines.map(l => (
            <Line
              key={l.label}
              x1={pad.left}
              x2={width - pad.right}
              y1={y(l.value)}
              y2={y(l.value)}
              stroke={l.color}
              strokeWidth={2}
              strokeDasharray="6 4"
            />
          ))}
          <Path
            d={linePath}
            stroke={C.series}
            strokeWidth={2}
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {points.map((p, i) =>
            i % labelEvery === 0 ? (
              <SvgText
                key={p.date}
                x={x(i)}
                y={height - 6}
                fontSize={vw(2.8)}
                fill={C.muted}
                textAnchor="middle">
                {shortDate(p.date)}
              </SvgText>
            ) : null,
          )}
          {sel && (
            <G>
              <Line
                x1={x(selected!)}
                x2={x(selected!)}
                y1={pad.top}
                y2={pad.top + plotH}
                stroke={C.inkSecondary}
                strokeWidth={1}
              />
              <Circle
                cx={x(selected!)}
                cy={y(sel.discharge!)}
                r={5}
                fill={C.series}
                stroke={C.surface}
                strokeWidth={2}
              />
            </G>
          )}
        </Svg>
      </View>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendLine, {backgroundColor: C.series}]} />
          <Text style={styles.legendText}>{t('legendFlow')}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendBand]} />
          <Text style={styles.legendText}>{t('legendRange')}</Text>
        </View>
        {lines.map(l => (
          <View key={l.label} style={styles.legendItem}>
            <View style={[styles.legendLine, {backgroundColor: l.color}]} />
            <Text style={styles.legendText}>
              {l.label} ({fmt(l.value)})
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const LuSongTab = () => {
  const {location} = useApp();
  const {t, lang} = useI18n();
  const [data, setData] = useState<FloodOutlook | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showTable, setShowTable] = useState(false);

  const load = useCallback(async () => {
    if (!location) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setData(await disasterAPI.getFlood(location.latitude, location.longitude));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [location]);

  // Reload when the language changes: the summary comes from the API in the current language.
  useEffect(() => {
    load();
  }, [load, lang]);

  if (!location) {
    return <Text style={styles.centerText}>{t('chooseLocationForFlood')}</Text>;
  }
  if (loading && !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="white" />
        <Text style={styles.centerText}>{t('analysingRiver')}</Text>
      </View>
    );
  }
  if (error && !data) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <Text style={styles.retry} onPress={load}>
          {t('tapToRetry')}
        </Text>
      </View>
    );
  }
  if (!data) {
    return null;
  }

  const risk = RISK_STYLE[data.risk];
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.riskRow}>
          <View style={[styles.riskBadge, {backgroundColor: risk.color}]}>
            <Text style={styles.riskIcon}>{risk.icon}</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.riskLabel}>{t('floodRisk', {label: data.risk_label})}</Text>
            {data.river && (
              <Text style={styles.meta}>
                {t('nearestRiver', {km: data.river.distance_km})}
              </Text>
            )}
          </View>
        </View>
        <Text style={styles.summary}>{data.summary}</Text>

        {data.forecast.length > 1 && (
          <>
            <Text style={styles.chartTitle}>
              {t('riverForecastTitle', {count: data.forecast.filter(f => f.is_forecast).length})}
            </Text>
            <DischargeChart data={data} />
            <TouchableOpacity onPress={() => setShowTable(!showTable)}>
              <Text style={styles.tableToggle}>
                {showTable ? t('hideTable') : t('showTable')}
              </Text>
            </TouchableOpacity>
            {showTable &&
              data.forecast.map(f => (
                <View key={f.date} style={styles.tableRow}>
                  <Text style={styles.tableCell}>
                    {weekdayName(parseLocal(f.date))} {shortDate(f.date)}
                    {f.is_forecast ? '' : t('pastDay')}
                  </Text>
                  <Text style={[styles.tableCell, styles.tableValue]}>
                    {f.discharge !== null ? `${fmt(f.discharge)} m³/s` : '--'}
                  </Text>
                </View>
              ))}
          </>
        )}
        <Text style={styles.attribution}>{t('floodAttribution')}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: vw(4),
  },
  center: {
    alignItems: 'center',
    paddingVertical: vh(4),
  },
  centerText: {
    color: 'white',
    textAlign: 'center',
    marginTop: vh(2),
    fontSize: vw(4),
  },
  errorText: {
    color: '#ff8a80',
    textAlign: 'center',
    fontSize: vw(4),
    paddingHorizontal: vw(5),
  },
  retry: {
    color: 'white',
    marginTop: vh(2),
    textDecorationLine: 'underline',
  },
  card: {
    backgroundColor: C.surface,
    borderRadius: vw(4),
    padding: vw(4),
  },
  riskRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  riskBadge: {
    width: vw(10),
    height: vw(10),
    borderRadius: vw(5),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: vw(3),
  },
  riskIcon: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: vw(4),
  },
  flex: {
    flex: 1,
  },
  riskLabel: {
    fontSize: vw(4.5),
    fontWeight: 'bold',
    color: C.ink,
  },
  meta: {
    fontSize: vw(3.4),
    color: C.inkSecondary,
    marginTop: 2,
  },
  summary: {
    fontSize: vw(3.8),
    color: C.ink,
    marginTop: vh(1.5),
    lineHeight: vw(5.5),
  },
  chartTitle: {
    fontSize: vw(4),
    fontWeight: '600',
    color: C.ink,
    marginTop: vh(2),
  },
  tooltip: {
    minHeight: vh(4),
    justifyContent: 'center',
  },
  tooltipText: {
    fontSize: vw(3.4),
    color: C.inkSecondary,
  },
  tooltipValue: {
    color: C.ink,
    fontWeight: 'bold',
  },
  tooltipHint: {
    fontSize: vw(3.2),
    color: C.muted,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: vh(1),
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: vw(4),
    marginBottom: 4,
  },
  legendLine: {
    width: 14,
    height: 3,
    borderRadius: 2,
    marginRight: 6,
  },
  legendBand: {
    width: 14,
    height: 10,
    borderRadius: 2,
    marginRight: 6,
    backgroundColor: 'rgba(42, 120, 214, 0.15)',
  },
  legendText: {
    fontSize: vw(3.2),
    color: C.inkSecondary,
  },
  tableToggle: {
    color: C.series,
    fontWeight: '600',
    marginTop: vh(1.5),
    fontSize: vw(3.6),
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.grid,
  },
  tableCell: {
    fontSize: vw(3.4),
    color: C.inkSecondary,
  },
  tableValue: {
    color: C.ink,
    fontVariant: ['tabular-nums'],
  },
  attribution: {
    fontSize: vw(2.9),
    color: C.muted,
    marginTop: vh(2),
    lineHeight: vw(4.2),
  },
});

export default LuSongTab;
