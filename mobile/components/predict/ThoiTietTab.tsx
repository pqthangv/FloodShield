/* eslint-disable react-native/no-inline-styles */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
} from 'react-native';
import {vw, vh} from '../../services/styleProps';
import {useApp} from '../../context/AppContext';
import {
  parseLocal,
  shortDate,
  timeOf,
  weatherImage,
  weekdayName,
} from '../../services/format';
import {useI18n} from '../../i18n';

const ThoiTietTab = () => {
  const {weather, weatherError, loading, refresh} = useApp();
  const {t} = useI18n();

  if (!weather && loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="white" />
        <Text
          style={[styles.sectionTitle, {textAlign: 'center', marginTop: vh(2)}]}>
          {t('loadingWeather')}
        </Text>
      </View>
    );
  }

  if (!weather) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text style={[styles.sectionTitle, {textAlign: 'center', color: '#ff6b6b'}]}>
          {weatherError || t('weatherFailed')}
        </Text>
        <Text
          style={[
            styles.sectionTitle,
            {textAlign: 'center', marginTop: vh(2), fontSize: vw(3.5)},
          ]}
          onPress={refresh}>
          {t('tapToRetry')}
        </Text>
      </View>
    );
  }

  const hourly = weather.hourly.slice(0, 24);

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>{t('next24h')}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.hourlyForecastContainer}>
        {hourly.map((item, index) => {
          const isCurrent = index === 0;
          return (
            <View
              key={item.time}
              style={[styles.hourlyItem, isCurrent && styles.currentHourItem]}>
              <Text style={[styles.hourlyTime, isCurrent && styles.currentHourText]}>
                {isCurrent ? t('now') : timeOf(item.time)}
              </Text>
              <Image source={weatherImage(item.icon)} style={styles.weatherIconSmall} />
              <Text style={[styles.hourlyRain, isCurrent && styles.currentHourText]}>
                💧{item.precipitation_probability ?? 0}%
              </Text>
              <Text style={[styles.hourlyTemp, isCurrent && styles.currentHourText]}>
                {Math.round(item.temperature)}°
              </Text>
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.next7daysContainer}>
        <Text style={[styles.sectionTitle, {color: '#1F2D54'}]}>
          {t('nextDays', {count: weather.daily.length})}
        </Text>
        <View>
          {weather.daily.map((item, index) => {
            const date = parseLocal(item.date);
            return (
              <View key={item.date} style={styles.dailyItem}>
                <View style={styles.weatherIconLargeCircle}>
                  <Image source={weatherImage(item.icon)} style={styles.weatherIconLarge} />
                </View>
                <View style={{width: vw(4)}} />
                <View style={styles.dailyTextContainer}>
                  <View style={styles.dailyTempContainer}>
                    <Text style={styles.dailyTemp}>
                      {Math.round(item.temperature_max)}°
                    </Text>
                    <Text style={styles.dailyMinTemp}>
                      {Math.round(item.temperature_min)}°
                    </Text>
                  </View>
                  <View style={styles.dailyInfoContainer}>
                    <Text style={styles.dailyDay}>
                      {index === 0 ? t('today') : weekdayName(date)}, {shortDate(item.date)}
                    </Text>
                    <Text style={styles.dailyCondition} numberOfLines={1}>
                      {item.condition}
                    </Text>
                    <Text style={styles.dailyRainChance}>
                      💧 {item.precipitation_sum} mm · {item.precipitation_probability_max ?? 0}%
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: vh(4),
  },
  sectionTitle: {
    fontSize: vw(4.5),
    fontWeight: 'bold',
    color: 'white',
    marginLeft: vw(2),
    marginBottom: vh(1),
  },
  hourlyForecastContainer: {
    flexDirection: 'row',
    paddingVertical: vh(1),
    marginBottom: vh(2),
  },
  hourlyItem: {
    backgroundColor: 'rgba(169, 211, 255, 0.6)',
    borderRadius: vw(15),
    padding: vw(3),
    alignItems: 'center',
    marginHorizontal: vw(1.5),
    width: vw(20),
  },
  currentHourItem: {
    backgroundColor: '#87CEFA',
  },
  hourlyTime: {
    fontSize: vw(3.5),
    color: '#1F2D54',
    marginBottom: vh(0.5),
  },
  currentHourText: {
    color: '#FFFFFF',
  },
  weatherIconSmall: {
    width: vw(8),
    height: vw(8),
    marginVertical: vh(0.5),
  },
  hourlyRain: {
    fontSize: vw(3.2),
    color: '#1F2D54',
  },
  hourlyTemp: {
    fontSize: vw(4),
    fontWeight: 'bold',
    color: '#1F2D54',
    marginTop: vh(0.5),
  },
  next7daysContainer: {
    backgroundColor: '#A9D3FF',
    borderRadius: vw(5),
    marginHorizontal: vw(2),
    padding: vw(2),
  },
  dailyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: vw(3),
    paddingVertical: vh(1.2),
  },
  weatherIconLargeCircle: {
    backgroundColor: '#1F2D54',
    borderRadius: vw(20),
    padding: vw(2),
  },
  weatherIconLarge: {
    width: vw(11),
    height: vw(11),
  },
  dailyTextContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1F2D54',
    borderRadius: 100,
    paddingHorizontal: vw(4),
    paddingVertical: vh(0.8),
  },
  dailyTempContainer: {
    alignItems: 'center',
  },
  dailyTemp: {
    fontSize: vw(5),
    fontWeight: 'bold',
    color: '#1F2D54',
  },
  dailyMinTemp: {
    fontSize: vw(3.5),
    color: '#1F2D54',
    opacity: 0.7,
  },
  dailyInfoContainer: {
    flex: 1,
    alignItems: 'flex-end',
    marginLeft: vw(2),
  },
  dailyDay: {
    fontSize: vw(3.8),
    color: '#1F2D54',
    textAlign: 'right',
    fontWeight: '600',
  },
  dailyCondition: {
    fontSize: vw(3.3),
    color: '#1F2D54',
  },
  dailyRainChance: {
    fontSize: vw(3.3),
    color: '#1F2D54',
    opacity: 0.75,
    textAlign: 'right',
  },
});

export default ThoiTietTab;
