import React, {useEffect, useState} from 'react';
import {
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {NavigationProp, useNavigation} from '@react-navigation/native';
import {SafeAreaView} from 'react-native-safe-area-context';
import CustomStatusBar from '../../components/CustomStatusBar';
import {backIcon} from '../../assets/svgIcon';
import {locationLabel, useApp} from '../../context/AppContext';
import {communityAPI} from '../../apis/disasterAPI';
import {errorMessage, getApiBaseUrl, setApiBaseUrl} from '../../services/axiosClient';
import {checkAlertsNow} from '../../services/alertNotifications';
import storage from '../../services/storage';
import {APP_VERSION, DEFAULT_API_URL} from '../../config';
import {vh, vw} from '../../services/styleProps';
import {Language, useI18n} from '../../i18n';

const LANGUAGES: {code: Language; label: string}[] = [
  {code: 'vi', label: 'Tiếng Việt'},
  {code: 'en', label: 'English'},
];

const Row = ({
  title,
  subtitle,
  onPress,
  right,
  danger,
}: {
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  danger?: boolean;
}) => (
  <TouchableOpacity style={styles.row} onPress={onPress} disabled={!onPress}>
    <View style={styles.rowText}>
      <Text style={[styles.rowTitle, danger && styles.danger]}>{title}</Text>
      {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
    </View>
    {right}
  </TouchableOpacity>
);

const SettingsScreen = () => {
  const navigation = useNavigation<NavigationProp<any>>();
  const {
    location,
    weather,
    notificationsEnabled,
    setNotificationsEnabled,
    switchToGps,
    refresh,
  } = useApp();
  const {t, lang, setLanguage} = useI18n();
  const [nickname, setNickname] = useState('');
  const [blockedCount, setBlockedCount] = useState(0);
  const [serverUrl, setServerUrl] = useState(getApiBaseUrl());
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    storage.getNickname().then(n => setNickname(n || ''));
    storage.getBlockedAuthors().then(ids => setBlockedCount(ids.length));
  }, []);

  const privacyUrl = getApiBaseUrl().replace(/\/api\/v1\/?$/, '') + '/privacy';

  const deleteMyData = () =>
    Alert.alert(
      t('deleteMyDataQ'),
      t('deleteMyDataMessage'),
      [
        {text: t('cancel'), style: 'cancel'},
        {
          text: t('delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await communityAPI.deleteMyData();
              await storage.setNickname('');
              setNickname('');
              Alert.alert(t('deleted'), t('deletedPosts', {count: res.deleted_posts}));
            } catch (e) {
              Alert.alert(t('deleteFailed'), errorMessage(e));
            }
          },
        },
      ],
    );

  const saveServer = async () => {
    const url = serverUrl.trim().replace(/\/$/, '');
    await setApiBaseUrl(url && url !== DEFAULT_API_URL ? url : null);
    setServerUrl(getApiBaseUrl());
    await refresh();
    Alert.alert(t('saved'), t('serverIs', {url: getApiBaseUrl()}));
  };

  return (
    <SafeAreaView style={styles.container}>
      <CustomStatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          {backIcon(vw(6), vw(6))}
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('settings')}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.section}>{t('sectionLanguage')}</Text>
        {LANGUAGES.map(option => (
          <Row
            key={option.code}
            title={option.label}
            onPress={() => setLanguage(option.code)}
            right={lang === option.code ? <Text style={styles.check}>✓</Text> : undefined}
          />
        ))}

        <Text style={styles.section}>{t('sectionLocation')}</Text>
        <Row
          title={locationLabel(location, weather)}
          subtitle={
            location?.mode === 'manual'
              ? t('manualLocationHint')
              : t('gpsLocationHint')
          }
          onPress={() => navigation.navigate('LocationPicker')}
        />
        {location?.mode === 'manual' && (
          <Row title={t('useGpsLocation')} onPress={switchToGps} />
        )}

        <Text style={styles.section}>{t('sectionNotifications')}</Text>
        <Row
          title={t('disasterAlerts')}
          subtitle={t('disasterAlertsHint')}
          right={
            <Switch
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
              trackColor={{true: '#2A78D6'}}
            />
          }
        />
        {notificationsEnabled && (
          <Row
            title={t('checkNow')}
            onPress={() => {
              checkAlertsNow();
              Alert.alert(t('checking'), t('checkingMessage'));
            }}
          />
        )}

        <Text style={styles.section}>{t('sectionCommunity')}</Text>
        <Row title={t('displayName')} subtitle={nickname || t('nicknameNotSet')} />
        <Row
          title={t('unhideAll')}
          subtitle={t('hiddenCount', {count: blockedCount})}
          onPress={
            blockedCount
              ? async () => {
                  await storage.setBlockedAuthors([]);
                  setBlockedCount(0);
                }
              : undefined
          }
        />
        <Row title={t('deleteMyData')} danger onPress={deleteMyData} />

        <Text style={styles.section}>{t('sectionInfo')}</Text>
        <Row title={t('privacyPolicy')} onPress={() => Linking.openURL(privacyUrl)} />
        <Row title={t('dataSources')} subtitle={t('dataSourcesList')} />
        <Row title={t('note')} subtitle={t('disclaimer')} />
        <Row
          title={t('version', {version: APP_VERSION})}
          subtitle={showAdvanced ? undefined : t('showAdvanced')}
          onPress={() => setShowAdvanced(!showAdvanced)}
        />
        {showAdvanced && (
          <View style={styles.advanced}>
            <Text style={styles.rowTitle}>{t('apiServer')}</Text>
            <TextInput
              style={styles.input}
              value={serverUrl}
              onChangeText={setServerUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <TouchableOpacity style={styles.saveButton} onPress={saveServer}>
              <Text style={styles.saveText}>{t('save')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F7FB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: vw(4),
    paddingVertical: vh(2),
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
  content: {
    paddingBottom: vh(4),
  },
  section: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#7F8C8D',
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  rowText: {
    flex: 1,
    paddingRight: 8,
  },
  rowTitle: {
    fontSize: 16,
    color: '#1F2D54',
  },
  rowSubtitle: {
    fontSize: 13,
    color: '#7F8C8D',
    marginTop: 3,
    lineHeight: 18,
  },
  danger: {
    color: '#D32F2F',
    fontWeight: '600',
  },
  check: {
    color: '#2A78D6',
    fontSize: 18,
    fontWeight: 'bold',
  },
  advanced: {
    backgroundColor: 'white',
    padding: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D0D0D0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 8,
    color: '#333',
  },
  saveButton: {
    marginTop: 10,
    backgroundColor: '#1F2D54',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  saveText: {
    color: 'white',
    fontWeight: 'bold',
  },
});

export default SettingsScreen;
