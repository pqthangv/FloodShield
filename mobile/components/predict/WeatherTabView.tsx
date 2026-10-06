import React, {useEffect, useState} from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {vw, vh} from '../../services/styleProps';
import ThoiTietTab from './ThoiTietTab';
import CanhBaoTab from './CanhBaoTab';
import LuSongTab from './LuSongTab';
import {useApp} from '../../context/AppContext';
import {MessageKey, useI18n} from '../../i18n';

export type PredictTab = 'THOI_TIET' | 'LU_SONG' | 'CANH_BAO';

const TABS: {key: PredictTab; label: MessageKey}[] = [
  {key: 'THOI_TIET', label: 'tabWeather'},
  {key: 'LU_SONG', label: 'tabRiver'},
  {key: 'CANH_BAO', label: 'tabAlerts'},
];

const WeatherTabView = ({initialTab}: {initialTab?: PredictTab}) => {
  const [activeTab, setActiveTab] = useState<PredictTab>(initialTab || 'THOI_TIET');
  const {alerts} = useApp();
  const {t} = useI18n();

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  return (
    <View style={styles.container}>
      <View style={styles.tabContainer}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tabButton, activeTab === tab.key && styles.activeTabButton]}
            onPress={() => setActiveTab(tab.key)}>
            <Text style={[styles.tabText, activeTab === tab.key && styles.activeTabText]}>
              {t(tab.label)}
              {tab.key === 'CANH_BAO' && alerts.length > 0 ? ` (${alerts.length})` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.contentContainer}>
        {activeTab === 'THOI_TIET' && <ThoiTietTab />}
        {activeTab === 'LU_SONG' && <LuSongTab />}
        {activeTab === 'CANH_BAO' && <CanhBaoTab />}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    backgroundColor: '#1F2D54',
    borderTopLeftRadius: vw(5),
    borderTopRightRadius: vw(5),
    paddingBottom: vh(4),
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: vw(3),
    paddingTop: vh(2),
    justifyContent: 'space-evenly',
  },
  tabButton: {
    paddingBottom: vh(1.5),
    paddingHorizontal: vw(2),
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
  },
  activeTabButton: {
    borderBottomColor: '#FFFFFF',
  },
  tabText: {
    color: '#EBEBF599',
    fontSize: 15,
    textAlign: 'center',
  },
  activeTabText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  contentContainer: {
    flex: 1,
    marginTop: vh(1),
    paddingVertical: vh(2),
  },
});

export default WeatherTabView;
