import React from 'react';
import {View, Text, StyleSheet, TouchableOpacity, Image} from 'react-native';
import {vh, vw} from '../../services/styleProps';
import {contactIcon, homeLocationIcon} from '../../assets/svgIcon';
import {NavigationProp, useNavigation} from '@react-navigation/native';
import {useApp} from '../../context/AppContext';
import {SEVERITY_COLOR, SEVERITY_LABEL} from '../../services/format';
import SunPath from './SunPath';

const AdditionalInfo = () => {
  const navigation = useNavigation<NavigationProp<any>>();
  const {alerts, alertsError, weather, location} = useApp();
  const topAlert = alerts.find(a => a.severity !== 'info') || alerts[0];
  const today = weather?.daily?.[0];

  const openAlerts = () =>
    navigation.navigate('MainTabs', {
      screen: 'Predict',
      params: {tab: 'CANH_BAO'},
    });
  const openSkills = () => {
    if (topAlert?.disaster_type_id) {
      navigation.navigate('MustDo', {
        disasterTypeId: topAlert.disaster_type_id,
        title: topAlert.title,
      });
    } else {
      navigation.navigate('MainTabs', {screen: 'Abilities'});
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.sunGraphOuterContainer}>
        <SunPath
          sunrise={today?.sunrise}
          sunset={today?.sunset}
          utcOffsetSeconds={weather?.utc_offset_seconds}
        />
      </View>

      {topAlert ? (
        <TouchableOpacity
          style={styles.warningCard}
          onPress={openAlerts}
          activeOpacity={0.85}>
          <View style={styles.warningHeader}>
            <Text style={styles.warningIcon}>⚠️</Text>
            <Text style={styles.warningTitle}>
              {alerts.length > 1
                ? `Cảnh báo (${alerts.length})`
                : 'Cảnh báo khẩn cấp!'}
            </Text>
          </View>
          <View style={styles.warningBody}>
            <View style={styles.warningTextContainer}>
              <Text style={styles.warningText}>{topAlert.title}</Text>
              <Text style={styles.warningText} numberOfLines={2}>
                {topAlert.area}
              </Text>
              <View style={styles.severityContainer}>
                <Text style={styles.warningText}>Mức độ:</Text>
                <View
                  style={[
                    styles.severityBadge,
                    {backgroundColor: SEVERITY_COLOR[topAlert.severity]},
                  ]}>
                  <Text style={styles.severityText}>
                    {SEVERITY_LABEL[topAlert.severity].toUpperCase()}
                  </Text>
                </View>
              </View>
            </View>
            <Image
              source={require('../../assets/home/tonardo.png')}
              style={styles.tornadoIcon}
            />
          </View>
        </TouchableOpacity>
      ) : (
        <View style={[styles.warningCard, styles.safeCard]}>
          <View style={styles.warningHeader}>
            <Text style={styles.warningIcon}>✅</Text>
            <Text style={styles.warningTitle}>
              {alertsError ? 'Chưa tải được cảnh báo' : 'Không có cảnh báo'}
            </Text>
          </View>
          <Text style={styles.warningText}>
            {alertsError ||
              (location
                ? 'Hiện chưa có cảnh báo thiên tai nào cho khu vực của bạn.'
                : 'Chọn vị trí để nhận cảnh báo cho khu vực của bạn.')}
          </Text>
        </View>
      )}

      <View style={styles.buttonsSection}>
        <TouchableOpacity style={styles.buttonDark} onPress={openAlerts}>
          <Text style={styles.buttonDarkText}>Chi tiết cảnh báo</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.buttonLight} onPress={openSkills}>
          <Text style={styles.buttonLightText}>Kỹ năng ứng phó</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.supportSection}>
        <Text style={styles.supportTitle}>Hỗ trợ</Text>
        <View style={styles.supportButtonsContainer}>
          <TouchableOpacity
            style={styles.supportButton}
            onPress={() => navigation.navigate('NearbyShelters')}>
            <View style={styles.supportButtonContent}>
              {homeLocationIcon(vw(5), vw(5))}
              <Text style={styles.supportButtonText}>Nơi sơ tán gần bạn</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.supportButton}
            onPress={() => navigation.navigate('EmergencyContacts')}>
            <View style={styles.supportButtonContent}>
              {contactIcon(vw(5), vw(5))}
              <Text style={styles.supportButtonText}>Liên lạc khẩn cấp</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: vw(4),
    marginTop: vh(2),
    alignItems: 'center',
  },
  sunGraphOuterContainer: {
    width: '100%',
    alignItems: 'center',
    marginBottom: vh(3),
  },
  warningCard: {
    backgroundColor: '#2A3B5D',
    borderRadius: vw(3),
    padding: vw(4),
    width: '100%',
    marginBottom: vh(2.5),
  },
  safeCard: {
    backgroundColor: '#2E7D32',
  },
  warningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: vh(1),
  },
  warningIcon: {
    fontSize: vw(5),
    color: 'white',
    marginRight: vw(2),
  },
  warningTitle: {
    fontSize: vw(4.5),
    color: 'white',
    fontWeight: 'bold',
  },
  warningBody: {
    flexDirection: 'row',
  },
  warningTextContainer: {
    flex: 1,
  },
  warningText: {
    fontSize: vw(3.8),
    color: 'white',
    marginBottom: vh(0.5),
  },
  severityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: vh(0.5),
  },
  severityBadge: {
    borderRadius: vw(4),
    paddingHorizontal: vw(3),
    paddingVertical: vw(1),
    marginLeft: vw(2),
  },
  severityText: {
    fontSize: vw(3.5),
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  tornadoIcon: {
    width: vw(17),
    height: vw(17),
    resizeMode: 'contain',
  },
  buttonsSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  buttonDark: {
    backgroundColor: '#3A3A3A',
    paddingVertical: vh(1.5),
    paddingHorizontal: vw(5),
    borderRadius: vw(2),
    flex: 1,
    marginRight: vw(2),
    alignItems: 'center',
  },
  buttonDarkText: {
    color: 'white',
    fontSize: vw(4),
    fontWeight: '500',
  },
  buttonLight: {
    backgroundColor: 'white',
    paddingVertical: vh(1.5),
    paddingHorizontal: vw(5),
    borderRadius: vw(2),
    borderWidth: 1,
    borderColor: '#3A3A3A',
    flex: 1,
    marginLeft: vw(2),
    alignItems: 'center',
  },
  buttonLightText: {
    color: '#3A3A3A',
    fontSize: vw(4),
    fontWeight: '500',
  },
  supportSection: {
    width: '100%',
    alignItems: 'center',
    marginTop: vh(3),
  },
  supportTitle: {
    fontSize: vw(4.5),
    fontWeight: 'bold',
    color: '#3A3A3A',
    marginBottom: vh(2),
  },
  supportButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  supportButton: {
    backgroundColor: '#D6EAF8',
    paddingVertical: vh(1.5),
    paddingHorizontal: vw(3),
    borderRadius: vw(2),
    flex: 1,
    marginHorizontal: vw(1),
    alignItems: 'center',
    justifyContent: 'center',
  },
  supportButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  supportButtonText: {
    color: '#2C3E50',
    fontSize: vw(3.8),
    fontWeight: '500',
    marginLeft: vw(2),
    textAlign: 'center',
    flexShrink: 1,
  },
});

export default AdditionalInfo;
