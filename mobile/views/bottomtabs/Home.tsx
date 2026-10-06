import {
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  View,
} from 'react-native';
import React, {useState} from 'react';
import {SafeAreaView} from 'react-native-safe-area-context';
import {NavigationProp, useNavigation} from '@react-navigation/native';
import WeatherDisplay from '../../components/bottomtabs/WeatherDisplay';
import AdditionalInfo from '../../components/home/AdditionalInfo';
import {vh, vw} from '../../services/styleProps';
import CustomStatusBar from '../../components/CustomStatusBar';
import {useApp} from '../../context/AppContext';
import {useI18n} from '../../i18n';
import {settingsIcon} from '../../assets/svgIcon';

const Home = () => {
  const navigation = useNavigation<NavigationProp<any>>();
  const {refresh} = useApp();
  const {t} = useI18n();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <CustomStatusBar barStyle="dark-content" backgroundColor={'#C9E5FF'} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollViewContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#1F2D54']} // Android
            tintColor="#1F2D54" // iOS
            title={t('reloading')} // iOS
            titleColor="#1F2D54" // iOS
          />
        }>
        <View style={styles.header}>
          <WeatherDisplay textColor="#1F2D54" backgroundColor="#C9E5FF" />
          <TouchableOpacity
            onPress={() => navigation.navigate('Settings')}
            style={styles.settingsButton}
            accessibilityRole="button"
            accessibilityLabel={t('settings')}>
            {settingsIcon(vw(6.5), vw(6.5), '#1F2D54')}
          </TouchableOpacity>
        </View>
        <AdditionalInfo />
      </ScrollView>
    </SafeAreaView>
  );
};

export default Home;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#C9E5FF',
  },
  scroll: {
    backgroundColor: 'white',
  },
  scrollViewContent: {
    alignItems: 'center',
    paddingBottom: vh(4),
  },
  header: {
    width: '100%',
  },
  settingsButton: {
    position: 'absolute',
    top: vh(1),
    right: vw(2),
    padding: vw(2),
  },
});
