import React from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import {NavigationProp, useNavigation} from '@react-navigation/native';
import {vw, vh} from '../../services/styleProps';
import {locationLabel, useApp} from '../../context/AppContext';
import {longDate, timeOf, weatherImage} from '../../services/format';
import {useI18n} from '../../i18n';

interface WeatherDisplayProps {
  textColor: string;
  backgroundColor: string;
}

const WeatherDisplay: React.FC<WeatherDisplayProps> = ({
  textColor,
  backgroundColor,
}) => {
  const navigation = useNavigation<NavigationProp<any>>();
  const {weather, weatherError, location, locationError, locating, loading, refresh} =
    useApp();
  const {t} = useI18n();

  const dynamicStyles = StyleSheet.create({
    dateText: {
      fontSize: vw(4.5),
      color: textColor,
      marginBottom: vh(3),
      fontWeight: '500',
    },
    temperatureText: {
      fontSize: vw(20),
      fontWeight: 'bold',
      color: textColor,
    },
    weatherConditionText: {
      fontSize: vw(4),
      color: textColor,
      marginTop: vh(-1),
      textAlign: 'center',
    },
    locationText: {
      fontSize: vw(4.5),
      color: textColor,
      fontWeight: '600',
      flexShrink: 1,
    },
    detailLabel: {
      fontSize: vw(3.5),
      color: textColor,
      marginBottom: vh(0.5),
      opacity: 0.7,
    },
    detailValue: {
      fontSize: vw(4),
      color: textColor,
      fontWeight: 'bold',
    },
    locationIcon: {
      fontSize: vw(5),
      marginRight: vw(2),
      color: textColor,
    },
    linkText: {
      fontSize: vw(4),
      color: textColor,
      fontWeight: '600',
      textDecorationLine: 'underline',
      marginTop: vh(2),
    },
  });

  const container = [styles.upperSection, {backgroundColor: backgroundColor}];
  const openPicker = () => navigation.navigate('LocationPicker');

  if (!weather && (locating || loading)) {
    return (
      <View style={container}>
        <ActivityIndicator size="large" color={textColor} />
        <Text style={[dynamicStyles.dateText, styles.loadingText]}>
          {locating ? t('locating') : t('loadingWeather')}
        </Text>
      </View>
    );
  }

  if (!weather) {
    return (
      <View style={container}>
        <Text style={dynamicStyles.dateText}>{longDate()}</Text>
        <Text style={dynamicStyles.weatherConditionText}>
          {!location
            ? locationError || t('noLocation')
            : weatherError || t('weatherFailed')}
        </Text>
        {!location ? (
          <Text style={dynamicStyles.linkText} onPress={openPicker}>
            {t('chooseYourLocation')}
          </Text>
        ) : (
          <Text style={dynamicStyles.linkText} onPress={refresh}>
            {t('tapToRetry')}
          </Text>
        )}
      </View>
    );
  }

  const {current} = weather;
  return (
    <View style={container}>
      <Text style={dynamicStyles.dateText}>{longDate()}</Text>

      <View style={styles.weatherSection}>
        <Image source={weatherImage(current.icon)} style={styles.weatherIcon} />
        <View style={styles.temperatureContainer}>
          <Text style={dynamicStyles.temperatureText}>
            {Math.round(current.temperature)}°
          </Text>
          <Text style={dynamicStyles.weatherConditionText}>
            {current.condition}
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.locationSection}
        onPress={openPicker}
        accessibilityRole="button"
        accessibilityLabel={t('changeLocation')}>
        <Text style={dynamicStyles.locationIcon}>📍</Text>
        <Text style={dynamicStyles.locationText} numberOfLines={1}>
          {locationLabel(location, weather)}
        </Text>
        <Text style={dynamicStyles.locationIcon}> ▾</Text>
      </TouchableOpacity>

      <View style={styles.detailsSection}>
        <View style={styles.detailItem}>
          <Text style={dynamicStyles.detailLabel}>{t('updated')}</Text>
          <Text style={dynamicStyles.detailValue}>{timeOf(current.time)}</Text>
        </View>
        <View style={styles.detailItem}>
          <Text style={dynamicStyles.detailLabel}>{t('wind')}</Text>
          <Text style={dynamicStyles.detailValue}>
            {current.wind_speed} km/h
          </Text>
        </View>
        <View style={styles.detailItem}>
          <Text style={dynamicStyles.detailLabel}>{t('feelsLike')}</Text>
          <Text style={dynamicStyles.detailValue}>
            {Math.round(current.apparent_temperature)}°
          </Text>
        </View>
        <View style={styles.detailItem}>
          <Text style={dynamicStyles.detailLabel}>{t('humidity')}</Text>
          <Text style={dynamicStyles.detailValue}>{current.humidity}%</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  upperSection: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: vh(4),
    paddingHorizontal: vw(4),
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  loadingText: {
    marginTop: vh(2),
  },
  weatherSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: vh(3),
    width: '100%',
    justifyContent: 'space-around',
  },
  weatherIcon: {
    width: vw(35),
    height: vw(35),
    resizeMode: 'contain',
  },
  temperatureContainer: {
    alignItems: 'center',
    maxWidth: vw(45),
  },
  locationSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: vh(4),
    maxWidth: '90%',
  },
  detailsSection: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
  detailItem: {
    alignItems: 'center',
  },
});

export default WeatherDisplay;
