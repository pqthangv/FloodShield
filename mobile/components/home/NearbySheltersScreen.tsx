import React, {useCallback, useEffect, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Linking,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {SafeAreaView} from 'react-native-safe-area-context';
import CustomStatusBar from '../CustomStatusBar';
import {vh, vw} from '../../services/styleProps';
import {backIcon, directionsIcon, phoneIcon} from '../../assets/svgIcon';
import disasterAPI from '../../apis/disasterAPI';
import {Shelter} from '../../services/model';
import {useApp} from '../../context/AppContext';
import {errorMessage} from '../../services/axiosClient';
import {formatDistance} from '../../services/format';
import {useI18n} from '../../i18n';

const openDirections = (s: Shelter) =>
  Linking.openURL(
    `https://www.google.com/maps/dir/?api=1&destination=${s.latitude},${s.longitude}&travelmode=walking`,
  );

const NearbySheltersScreen = () => {
  const navigation = useNavigation();
  const {location} = useApp();
  const {t, lang} = useI18n();
  const [shelters, setShelters] = useState<Shelter[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!location) {
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const data = await disasterAPI.getShelters(location.latitude, location.longitude);
      setShelters(data.shelters);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [location]);

  // Reload when the language changes: kind labels come from the API in the current language.
  useEffect(() => {
    load();
  }, [load, lang]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const renderItem = ({item, index}: {item: Shelter; index: number}) => (
    <View style={styles.itemContainer}>
      <View style={styles.itemContent}>
        <View style={styles.badges}>
          <Text style={styles.itemType}>{item.kind_label}</Text>
          {item.official && <Text style={styles.officialBadge}>{t('official')}</Text>}
        </View>
        <Text style={styles.itemName}>{item.name}</Text>
        {item.address ? <Text style={styles.itemAddress}>{item.address}</Text> : null}
        {item.note ? <Text style={styles.itemAddress}>{item.note}</Text> : null}
        <Text style={[styles.itemDistance, index < 5 && styles.nearestDistance]}>
          {t('distanceFromYou', {distance: formatDistance(item.distance_km)})}
          {item.capacity ? t('capacity', {count: item.capacity}) : ''}
        </Text>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.directionsButton}
          onPress={() => openDirections(item)}
          accessibilityLabel={t('directionsTo', {name: item.name})}>
          {directionsIcon(vw(5), vw(5), '#FFFFFF')}
          <Text style={styles.directionsText}>{t('directions')}</Text>
        </TouchableOpacity>
        {item.phone ? (
          <TouchableOpacity
            style={styles.callButton}
            onPress={() => Linking.openURL(`tel:${item.phone}`)}
            accessibilityLabel={t('callPlace', {name: item.name})}>
            {phoneIcon(vw(4.5), vw(4.5), '#1F2D54')}
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );

  const header = (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
        {backIcon(vw(6), vw(6))}
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{t('nearbyShelters')}</Text>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <CustomStatusBar barStyle="dark-content" />
        {header}
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2C3E50" />
          <Text style={styles.loadingText}>{t('findingShelters')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <CustomStatusBar barStyle="dark-content" />
      {header}
      <FlatList
        data={shelters}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        style={styles.list}
        ListHeaderComponent={
          <Text style={styles.hint}>{t('sheltersHint')}</Text>
        }
        ListEmptyComponent={
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>
              {!location
                ? t('noLocationSettings')
                : error || t('noShelters')}
            </Text>
            {error && (
              <Text style={styles.retry} onPress={load}>
                {t('retry')}
              </Text>
            )}
          </View>
        }
        ListFooterComponent={
          shelters.length > 0 ? (
            <Text style={styles.attribution}>{t('mapAttribution')}</Text>
          ) : undefined
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#2C3E50']}
            tintColor="#2C3E50"
          />
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: vw(4),
    paddingTop: vh(2),
    paddingBottom: vh(2),
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  backButton: {
    padding: vw(1),
  },
  headerTitle: {
    fontSize: vw(5),
    fontWeight: 'bold',
    color: '#2C3E50',
    marginLeft: vw(3),
  },
  list: {
    flex: 1,
  },
  hint: {
    fontSize: vw(3.4),
    color: '#7F8C8D',
    paddingHorizontal: vw(5),
    paddingTop: vh(1.5),
    paddingBottom: vh(0.5),
  },
  itemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: vh(1.8),
    paddingHorizontal: vw(5),
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  itemContent: {
    flex: 1,
    paddingRight: vw(2),
  },
  badges: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: vh(0.4),
  },
  itemType: {
    fontSize: vw(3.2),
    color: '#34495E',
    backgroundColor: '#EAF2F8',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: 'hidden',
  },
  officialBadge: {
    fontSize: vw(3.2),
    color: 'white',
    backgroundColor: '#27AE60',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: 'hidden',
    marginLeft: 6,
  },
  itemName: {
    fontSize: vw(4),
    fontWeight: 'bold',
    color: '#2C3E50',
  },
  itemAddress: {
    fontSize: vw(3.4),
    color: '#566573',
    marginTop: 2,
  },
  itemDistance: {
    fontSize: vw(3.5),
    color: '#7F8C8D',
    marginTop: vh(0.4),
  },
  nearestDistance: {
    color: '#E74C3C',
    fontWeight: 'bold',
  },
  actions: {
    alignItems: 'center',
  },
  directionsButton: {
    backgroundColor: '#1F2D54',
    borderRadius: vw(3),
    paddingVertical: vh(0.8),
    paddingHorizontal: vw(2.5),
    alignItems: 'center',
  },
  directionsText: {
    color: 'white',
    fontSize: vw(3),
    marginTop: 2,
  },
  callButton: {
    marginTop: vh(0.8),
    backgroundColor: '#D6EAF8',
    borderRadius: vw(5),
    padding: vw(2),
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: vw(5),
    paddingTop: vh(10),
  },
  loadingText: {
    fontSize: vw(4),
    color: '#7F8C8D',
    marginTop: vh(2),
    textAlign: 'center',
  },
  retry: {
    marginTop: vh(2),
    color: '#1F2D54',
    fontWeight: 'bold',
    fontSize: vw(4),
  },
  attribution: {
    fontSize: vw(3),
    color: '#95A5A6',
    textAlign: 'center',
    paddingVertical: vh(2),
  },
});

export default NearbySheltersScreen;
