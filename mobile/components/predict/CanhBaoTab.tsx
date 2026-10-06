/* eslint-disable react-native/no-inline-styles */
import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Image,
  TouchableWithoutFeedback,
  Linking,
  ActivityIndicator,
} from 'react-native';
import {NavigationProp, useNavigation} from '@react-navigation/native';
import {vw, vh} from '../../services/styleProps';
import {Alert} from '../../services/model';
import {useApp} from '../../context/AppContext';
import {
  SEVERITY_COLOR,
  SEVERITY_LEVEL,
  parseLocal,
  severityLabel,
  shortDate,
  timeOf,
  weekdayName,
} from '../../services/format';
import {translate, useI18n} from '../../i18n';
import {
  stormIconXml,
  locationIconXml,
  clockIconXml,
  rainIconXml,
  directionIconXml,
} from '../../assets/svgIcon';

function formatWhen(alert: Alert) {
  if (!alert.starts_at) {
    return translate('ongoing');
  }
  const start = alert.starts_at.replace(' ', 'T');
  const hasTime = start.length > 10;
  const date = parseLocal(start.slice(0, 16));
  let text = `${weekdayName(date)}, ${shortDate(start)}${hasTime ? ` - ${timeOf(start)}` : ''}`;
  if (alert.ends_at) {
    text += ` → ${shortDate(alert.ends_at.replace(' ', 'T'))}`;
  }
  return translate('timeLabel', {text});
}

const CanhBaoTab = () => {
  const {alerts, alertsError, loading, refresh, location} = useApp();
  const {t} = useI18n();
  const [selectedCaution, setSelectedCaution] = useState<Alert | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const navigation = useNavigation<NavigationProp<any>>();

  const handleViewDetails = (caution: Alert) => {
    setSelectedCaution(caution);
    setModalVisible(true);
  };

  if (loading && alerts.length === 0) {
    return (
      <View style={styles.empty}>
        <ActivityIndicator size="large" color="white" />
      </View>
    );
  }

  if (alerts.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyIcon}>{alertsError ? '⚠️' : '✅'}</Text>
        <Text style={styles.emptyText}>
          {alertsError ||
            (location
              ? t('noAlertsNext3Days')
              : t('chooseLocationShort'))}
        </Text>
        {alertsError && (
          <Text style={styles.retry} onPress={refresh}>
            {t('tapToRetry')}
          </Text>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.scrollContainer}>
        {alerts.map((caution, index) => (
          <React.Fragment key={caution.id}>
            <View style={styles.cautionItemContainer}>
              <View style={styles.cautionHeader}>
                {stormIconXml(vw(5), vw(5), '#FFFFFF')}
                <Text style={styles.cautionType}>{caution.title}</Text>
              </View>
              <View style={styles.cautionRow}>
                {locationIconXml(vw(5), vw(5), '#FFFFFF')}
                <Text style={styles.cautionText}>{t('areaLabel', {area: caution.area})}</Text>
              </View>
              <View style={styles.cautionRow}>
                {clockIconXml(vw(5), vw(5), '#FFFFFF')}
                <Text style={styles.cautionText}>{formatWhen(caution)}</Text>
              </View>
              <View style={styles.cautionFooter}>
                <View style={styles.dangerLevelContainer}>
                  <Text style={styles.dangerLevelText}>
                    {severityLabel(caution.severity)}:
                  </Text>
                  <View
                    style={[
                      styles.dangerLevelCircle,
                      {backgroundColor: SEVERITY_COLOR[caution.severity]},
                    ]}>
                    <Text style={styles.dangerLevelNumber}>
                      {SEVERITY_LEVEL[caution.severity]}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.detailsButton}
                  onPress={() => handleViewDetails(caution)}>
                  <Text style={styles.detailsButtonText}>{t('viewDetails')}</Text>
                </TouchableOpacity>
              </View>
              <Image
                source={require('../../assets/home/tonardo.png')}
                style={styles.tornadoImage}
              />
            </View>
            {index < alerts.length - 1 && <View style={styles.separator} />}
          </React.Fragment>
        ))}
        <Text style={styles.sourceNote}>{t('alertSources')}</Text>
      </View>

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={styles.modalContainer}>
                {selectedCaution && (
                  <ScrollView contentContainerStyle={styles.modalScrollContainer}>
                    <Text style={styles.modalTitle}>{selectedCaution.title}</Text>
                    <View style={styles.detailItem}>
                      {locationIconXml(vw(5), vw(5), '#FFFFFF')}
                      <Text style={styles.modalText}>{selectedCaution.area}</Text>
                    </View>
                    <View style={styles.detailItem}>
                      {clockIconXml(vw(5), vw(5), '#FFFFFF')}
                      <Text style={styles.modalText}>{formatWhen(selectedCaution)}</Text>
                    </View>
                    <View style={styles.detailItem}>
                      {stormIconXml(vw(5), vw(5), '#FFFFFF')}
                      <Text style={styles.modalText}>{selectedCaution.description}</Text>
                    </View>
                    {selectedCaution.details.map(d => (
                      <View key={d.label} style={styles.detailItem}>
                        {rainIconXml(vw(5), vw(5), '#FFFFFF')}
                        <Text style={styles.modalText}>
                          {d.label}: {d.value}
                        </Text>
                      </View>
                    ))}
                    <View style={styles.detailItem}>
                      {directionIconXml(vw(5), vw(5), '#FFFFFF')}
                      <Text style={styles.modalText}>
                        {t('sourceLabel', {source: selectedCaution.source})}
                      </Text>
                    </View>
                    {selectedCaution.url && (
                      <Text
                        style={styles.link}
                        onPress={() => Linking.openURL(selectedCaution.url!)}>
                        {t('fullReport')}
                      </Text>
                    )}
                  </ScrollView>
                )}
                <View style={styles.ButtonBottomGroup}>
                  <View
                    style={{
                      flexDirection: 'row',
                      marginTop: vh(2),
                      alignItems: 'center',
                    }}>
                    <Text style={{fontSize: 14, fontWeight: 700, color: '#1F2D54'}}>
                      {selectedCaution &&
                        t('severityWithLabel', {label: severityLabel(selectedCaution.severity)})}{' '}
                    </Text>
                    <View style={[styles.dangerLevelCircle, {backgroundColor: '#1F2D54'}]}>
                      <Text style={[styles.dangerLevelNumber, {color: '#FFA500'}]}>
                        {selectedCaution && SEVERITY_LEVEL[selectedCaution.severity]}
                      </Text>
                    </View>
                  </View>
                  {selectedCaution?.disaster_type_id ? (
                    <TouchableOpacity
                      onPress={() => {
                        navigation.navigate('MustDo', {
                          disasterTypeId: selectedCaution.disaster_type_id,
                          title: selectedCaution.title,
                        });
                        setModalVisible(false);
                      }}
                      style={styles.skillButton}>
                      <Text style={styles.skillButtonText}>{t('viewResponseSkills')}</Text>
                      <Text style={styles.skillButtonArrow}>&gt;</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: vw(100),
  },
  scrollContainer: {
    padding: vw(5),
    paddingHorizontal: vw(5),
  },
  empty: {
    alignItems: 'center',
    paddingVertical: vh(5),
    paddingHorizontal: vw(8),
  },
  emptyIcon: {
    fontSize: vw(10),
    marginBottom: vh(1),
  },
  emptyText: {
    color: 'white',
    fontSize: vw(4),
    textAlign: 'center',
    lineHeight: vw(6),
  },
  retry: {
    color: 'white',
    marginTop: vh(2),
    textDecorationLine: 'underline',
  },
  cautionItemContainer: {
    backgroundColor: '#1F2D54',
    borderRadius: vw(3),
    marginBottom: vw(4),
    padding: vw(4),
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    position: 'relative',
  },
  cautionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: vh(1),
    paddingRight: vw(22),
  },
  cautionType: {
    fontSize: vw(4.5),
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginLeft: vw(2),
    flexShrink: 1,
  },
  cautionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: vh(0.5),
    paddingRight: vw(22),
  },
  cautionText: {
    fontSize: vw(3.8),
    color: '#E0E0E0',
    flexShrink: 1,
    marginLeft: vw(1),
  },
  cautionFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: vh(1.5),
  },
  dangerLevelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dangerLevelText: {
    fontSize: vw(3.8),
    color: '#E0E0E0',
    marginRight: vw(2),
  },
  dangerLevelCircle: {
    width: vw(8),
    height: vw(8),
    borderRadius: vw(4),
    justifyContent: 'center',
    alignItems: 'center',
  },
  dangerLevelNumber: {
    fontSize: vw(4),
    fontWeight: 'bold',
    color: '#1F2D54',
  },
  detailsButton: {
    borderColor: '#FFFFFF',
    borderWidth: 1,
    borderRadius: vw(5),
    paddingVertical: vh(1),
    paddingHorizontal: vw(4),
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailsButtonText: {
    fontSize: vw(3.8),
    color: '#FFFFFF',
  },
  tornadoImage: {
    position: 'absolute',
    right: vw(1),
    top: 0,
    width: vw(20),
    height: vh(10),
    resizeMode: 'contain',
  },
  separator: {
    height: 0.5,
    backgroundColor: '#FFFFFF',
    marginVertical: vh(3),
  },
  sourceNote: {
    color: '#C9D6EA',
    fontSize: vw(3),
    marginTop: vh(1),
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContainer: {
    height: '80%',
    backgroundColor: '#1F2D54',
    borderTopLeftRadius: vw(5),
    borderTopRightRadius: vw(5),
    overflow: 'hidden',
  },
  modalTitle: {
    fontSize: vw(5.5),
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: vh(2),
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: vh(1.5),
  },
  modalText: {
    fontSize: vw(4),
    color: '#E0E0E0',
    marginLeft: vw(2),
    flexShrink: 1,
    lineHeight: vw(5.8),
  },
  link: {
    color: '#87CEFA',
    fontSize: vw(4),
    textDecorationLine: 'underline',
    marginTop: vh(1),
  },
  ButtonBottomGroup: {
    flexDirection: 'column',
    alignItems: 'center',
    backgroundColor: '#FFAC33',
    paddingBottom: vh(4),
  },
  skillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderColor: '#1F2D54',
    borderWidth: 1,
    borderRadius: 15,
    paddingVertical: vh(1),
    paddingHorizontal: vw(4),
    marginTop: vh(2),
  },
  skillButtonText: {
    color: '#1F2D54',
    fontWeight: 'bold',
    fontSize: vw(4),
    marginRight: vw(2),
  },
  skillButtonArrow: {
    color: '#1F2D54',
    fontSize: vw(5),
    fontWeight: 'bold',
  },
  modalScrollContainer: {
    padding: vw(5),
    paddingBottom: vh(2),
  },
});

export default CanhBaoTab;
