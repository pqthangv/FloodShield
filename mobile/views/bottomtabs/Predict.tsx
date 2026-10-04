import {ScrollView, StyleSheet, RefreshControl} from 'react-native';
import React, {useState} from 'react';
import {SafeAreaView} from 'react-native-safe-area-context';
import {RouteProp, useRoute} from '@react-navigation/native';
import CustomStatusBar from '../../components/CustomStatusBar';
import WeatherDisplay from '../../components/bottomtabs/WeatherDisplay';
import WeatherTabView, {PredictTab} from '../../components/predict/WeatherTabView';
import {useApp} from '../../context/AppContext';

type PredictRoute = RouteProp<{Predict: {tab?: PredictTab} | undefined}, 'Predict'>;

const Predict = () => {
  const route = useRoute<PredictRoute>();
  const {refresh} = useApp();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <CustomStatusBar barStyle="light-content" backgroundColor={'#56707d'} />
      <ScrollView
        contentContainerStyle={styles.scrollViewContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#1F2D54']} // Android
            tintColor="#FFFFFF" // iOS - white spinner
            title="Đang tải lại..." // iOS
            titleColor="#FFFFFF" // iOS - white text
          />
        }>
        <WeatherDisplay textColor="#FFFFFF" backgroundColor="transparent" />
        <WeatherTabView initialTab={route.params?.tab} />
      </ScrollView>
    </SafeAreaView>
  );
};

export default Predict;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#56707d',
  },
  scrollViewContent: {
    flexGrow: 1,
    alignItems: 'center',
  },
});
