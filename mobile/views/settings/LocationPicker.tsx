import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {SafeAreaView} from 'react-native-safe-area-context';
import CustomStatusBar from '../../components/CustomStatusBar';
import {backIcon} from '../../assets/svgIcon';
import {useApp} from '../../context/AppContext';
import disasterAPI from '../../apis/disasterAPI';
import {DEFAULT_LOCATIONS} from '../../services/locationService';
import {Place} from '../../services/model';
import {errorMessage} from '../../services/axiosClient';
import {vh, vw} from '../../services/styleProps';

const LocationPickerScreen = () => {
  const navigation = useNavigation();
  const {setManualLocation, switchToGps, locationError, locating} = useApp();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search as the user types (debounced).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await disasterAPI.searchPlaces(q);
        setResults(data.results);
        setError(null);
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [query]);

  const choose = async (place: {name: string; latitude: number; longitude: number}) => {
    navigation.goBack();
    await setManualLocation(place);
  };

  const chooseGps = async () => {
    await switchToGps();
    navigation.goBack();
  };

  const data: {name: string; region?: string; latitude: number; longitude: number}[] =
    results ?? DEFAULT_LOCATIONS;

  return (
    <SafeAreaView style={styles.container}>
      <CustomStatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          {backIcon(vw(6), vw(6))}
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Chọn vị trí</Text>
      </View>
      <TouchableOpacity style={styles.gpsButton} onPress={chooseGps} disabled={locating}>
        {locating ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={styles.gpsText}>📍 Dùng vị trí hiện tại (GPS)</Text>
        )}
      </TouchableOpacity>
      {locationError ? <Text style={styles.error}>{locationError}</Text> : null}
      <TextInput
        style={styles.search}
        placeholder="Tìm tỉnh, thành phố, phường xã..."
        placeholderTextColor="#9AA5B1"
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
      />
      {searching && <ActivityIndicator style={styles.spinner} color="#1F2D54" />}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.section}>{results ? 'Kết quả tìm kiếm' : 'Thành phố lớn'}</Text>
      <FlatList
        data={data}
        keyExtractor={(item, i) => `${item.name}-${item.latitude}-${i}`}
        keyboardShouldPersistTaps="handled"
        renderItem={({item}) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() =>
              choose({
                name: item.region ? `${item.name}, ${item.region}` : item.name,
                latitude: item.latitude,
                longitude: item.longitude,
              })
            }>
            <Text style={styles.rowTitle}>{item.name}</Text>
            {item.region ? <Text style={styles.rowSubtitle}>{item.region}</Text> : null}
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          results && !searching ? (
            <Text style={styles.empty}>Không tìm thấy địa điểm phù hợp.</Text>
          ) : undefined
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
    paddingVertical: vh(2),
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
  gpsButton: {
    backgroundColor: '#1F2D54',
    margin: 16,
    marginBottom: 8,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  gpsText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  search: {
    marginHorizontal: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#D0D0D0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    color: '#333',
  },
  spinner: {
    marginTop: 8,
  },
  error: {
    color: '#D32F2F',
    marginHorizontal: 16,
    marginTop: 6,
  },
  section: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#7F8C8D',
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6,
  },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  rowTitle: {
    fontSize: 16,
    color: '#1F2D54',
  },
  rowSubtitle: {
    fontSize: 13,
    color: '#7F8C8D',
    marginTop: 2,
  },
  empty: {
    textAlign: 'center',
    color: '#7F8C8D',
    marginTop: 20,
  },
});

export default LocationPickerScreen;
