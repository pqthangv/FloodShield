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
      'Xóa dữ liệu của tôi?',
      'Toàn bộ bài viết, ảnh và lượt xác nhận bạn đã gửi sẽ bị xóa khỏi máy chủ. Không thể hoàn tác.',
      [
        {text: 'Hủy', style: 'cancel'},
        {
          text: 'Xóa',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await communityAPI.deleteMyData();
              await storage.setNickname('');
              setNickname('');
              Alert.alert('Đã xóa', `Đã xóa ${res.deleted_posts} bài viết.`);
            } catch (e) {
              Alert.alert('Không xóa được', errorMessage(e));
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
    Alert.alert('Đã lưu', `Máy chủ: ${getApiBaseUrl()}`);
  };

  return (
    <SafeAreaView style={styles.container}>
      <CustomStatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          {backIcon(vw(6), vw(6))}
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Cài đặt</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.section}>Vị trí</Text>
        <Row
          title={locationLabel(location, weather)}
          subtitle={
            location?.mode === 'manual'
              ? 'Vị trí chọn thủ công · Nhấn để đổi'
              : 'Theo GPS · Nhấn để chọn vị trí khác'
          }
          onPress={() => navigation.navigate('LocationPicker')}
        />
        {location?.mode === 'manual' && (
          <Row title="Dùng vị trí GPS" onPress={switchToGps} />
        )}

        <Text style={styles.section}>Thông báo</Text>
        <Row
          title="Cảnh báo thiên tai"
          subtitle="Kiểm tra khoảng 30 phút một lần, kể cả khi đóng ứng dụng"
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
            title="Kiểm tra cảnh báo ngay"
            onPress={() => {
              checkAlertsNow();
              Alert.alert('Đang kiểm tra', 'Bạn sẽ nhận thông báo nếu có cảnh báo mới.');
            }}
          />
        )}

        <Text style={styles.section}>Cộng đồng</Text>
        <Row title="Tên hiển thị" subtitle={nickname || 'Chưa đặt (đặt khi gửi bài)'} />
        <Row
          title="Bỏ ẩn tất cả người dùng"
          subtitle={`${blockedCount} người đang bị ẩn`}
          onPress={
            blockedCount
              ? async () => {
                  await storage.setBlockedAuthors([]);
                  setBlockedCount(0);
                }
              : undefined
          }
        />
        <Row title="Xóa dữ liệu của tôi" danger onPress={deleteMyData} />

        <Text style={styles.section}>Thông tin</Text>
        <Row title="Chính sách quyền riêng tư" onPress={() => Linking.openURL(privacyUrl)} />
        <Row
          title="Nguồn dữ liệu"
          subtitle={
            'Thời tiết: Open-Meteo.com (CC BY 4.0)\n' +
            'Lũ sông: GloFAS - Copernicus Emergency Management Service\n' +
            'Thiên tai: GDACS (Liên Hợp Quốc & Ủy ban châu Âu)\n' +
            'Bản đồ, nơi sơ tán: © OpenStreetMap contributors'
          }
        />
        <Row
          title="Lưu ý"
          subtitle="Thông tin chỉ mang tính tham khảo. Luôn làm theo hướng dẫn của chính quyền và Trung tâm Dự báo KTTV Quốc gia (nchmf.gov.vn)."
        />
        <Row
          title={`Phiên bản ${APP_VERSION}`}
          subtitle={showAdvanced ? undefined : 'Nhấn để hiện cài đặt nâng cao'}
          onPress={() => setShowAdvanced(!showAdvanced)}
        />
        {showAdvanced && (
          <View style={styles.advanced}>
            <Text style={styles.rowTitle}>Máy chủ API</Text>
            <TextInput
              style={styles.input}
              value={serverUrl}
              onChangeText={setServerUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <TouchableOpacity style={styles.saveButton} onPress={saveServer}>
              <Text style={styles.saveText}>Lưu</Text>
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
