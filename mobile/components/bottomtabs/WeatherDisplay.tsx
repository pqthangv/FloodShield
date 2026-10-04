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
import {longDateVi, timeOf, weatherImage} from '../../services/format';

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
          {locating ? 'Đang xác định vị trí...' : 'Đang tải dữ liệu thời tiết...'}
        </Text>
      </View>
    );
  }

  if (!weather) {
    return (
      <View style={container}>
        <Text style={dynamicStyles.dateText}>{longDateVi()}</Text>
        <Text style={dynamicStyles.weatherConditionText}>
          {!location
            ? locationError || 'Chưa có vị trí'
            : weatherError || 'Không thể tải dữ liệu thời tiết'}
        </Text>
        {!location ? (
          <Text style={dynamicStyles.linkText} onPress={openPicker}>
            Chọn vị trí của bạn
          </Text>
        ) : (
          <Text style={dynamicStyles.linkText} onPress={refresh}>
            Nhấn để thử lại
          </Text>
        )}
      </View>
    );
  }

  const {current} = weather;
  return (
    <View style={container}>
      <Text style={dynamicStyles.dateText}>{longDateVi()}</Text>

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
        accessibilityLabel="Đổi vị trí">
        <Text style={dynamicStyles.locationIcon}>📍</Text>
        <Text style={dynamicStyles.locationText} numberOfLines={1}>
          {locationLabel(location, weather)}
        </Text>
        <Text style={dynamicStyles.locationIcon}> ▾</Text>
      </TouchableOpacity>

      <View style={styles.detailsSection}>
        <View style={styles.detailItem}>
          <Text style={dynamicStyles.detailLabel}>CẬP NHẬT</Text>
          <Text style={dynamicStyles.detailValue}>{timeOf(current.time)}</Text>
        </View>
        <View style={styles.detailItem}>
          <Text style={dynamicStyles.detailLabel}>GIÓ</Text>
          <Text style={dynamicStyles.detailValue}>
            {current.wind_speed} km/h
          </Text>
        </View>
        <View style={styles.detailItem}>
          <Text style={dynamicStyles.detailLabel}>CẢM THẤY</Text>
          <Text style={dynamicStyles.detailValue}>
            {Math.round(current.apparent_temperature)}°
          </Text>
        </View>
        <View style={styles.detailItem}>
          <Text style={dynamicStyles.detailLabel}>ĐỘ ẨM</Text>
          <Text style={dynamicStyles.detailValue}>{current.humidity}%</Text>
        </View>
      </View>
      <Text style={[dynamicStyles.detailLabel, styles.attribution]}>
        Dữ liệu thời tiết: Open-Meteo.com
      </Text>
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
  attribution: {
    marginTop: vh(2),
    marginBottom: 0,
    fontSize: vw(2.8),
  },
});

export default WeatherDisplay;
