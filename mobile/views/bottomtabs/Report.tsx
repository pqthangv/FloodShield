import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Image,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import React, {useState, useCallback, useRef} from 'react';
import {SafeAreaView} from 'react-native-safe-area-context';
import CustomStatusBar from '../../components/CustomStatusBar';
import {vh, vw} from '../../services/styleProps';
import {NavigationProp, useNavigation, useFocusEffect} from '@react-navigation/native';
import {communityAPI} from '../../apis/disasterAPI';
import {useApp} from '../../context/AppContext';
import {Post} from '../../services/model';
import storage from '../../services/storage';
import {errorMessage} from '../../services/axiosClient';
import {formatDistance, timeAgo} from '../../services/format';
import {moreIcon} from '../../assets/svgIcon';

export const CATEGORY_LABEL: Record<string, string> = {
  flood: '🌊 Ngập lụt',
  landslide: '⛰️ Sạt lở',
  storm: '🌀 Bão, gió lớn',
  rescue: '🆘 Cần cứu trợ',
  other: '📢 Khác',
};

export const WATER_LEVEL_LABEL: Record<string, string> = {
  none: 'Không ngập',
  ankle: 'Ngập mắt cá',
  knee: 'Ngập đầu gối',
  waist: 'Ngập ngang hông',
  chest: 'Ngập ngang ngực',
  over_head: 'Ngập quá đầu',
};

const avatarSource = require('../../assets/report/avatar.png');
const myAvatarSource = require('../../assets/report/user.png');

const REFRESH_MS = 60 * 1000;

const Report = () => {
  const navigation = useNavigation<NavigationProp<any>>();
  const {location} = useApp();
  const [posts, setPosts] = useState<Post[]>([]);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const [data, blockedIds] = await Promise.all([
        communityAPI.getPosts(location?.latitude, location?.longitude),
        storage.getBlockedAuthors(),
      ]);
      setPosts(data.posts);
      setBlocked(blockedIds);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [location]);

  // Reload when the tab is opened, then every minute while it stays open.
  useFocusEffect(
    useCallback(() => {
      load();
      timer.current = setInterval(load, REFRESH_MS);
      return () => {
        if (timer.current) {
          clearInterval(timer.current);
        }
      };
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const toggleConfirm = async (post: Post) => {
    try {
      const res = await communityAPI.confirm(post.id);
      setPosts(list =>
        list.map(p => (p.id === post.id ? {...p, ...res} : p)),
      );
    } catch (e) {
      Alert.alert('Lỗi', errorMessage(e));
    }
  };

  const reportPost = (post: Post) =>
    Alert.alert('Báo cáo bài viết', 'Lý do báo cáo bài viết này?', [
      {text: 'Thông tin sai', onPress: () => sendReport(post, 'false_info')},
      {text: 'Nội dung xấu / spam', onPress: () => sendReport(post, 'abuse')},
      {text: 'Hủy', style: 'cancel'},
    ]);

  const sendReport = async (post: Post, reason: string) => {
    try {
      await communityAPI.report(post.id, reason);
      setPosts(list => list.filter(p => p.id !== post.id));
      Alert.alert('Cảm ơn bạn', 'Bài viết đã được báo cáo và sẽ được kiểm tra.');
    } catch (e) {
      Alert.alert('Lỗi', errorMessage(e));
    }
  };

  const blockAuthor = (post: Post) =>
    Alert.alert(
      `Ẩn bài của ${post.author_name}?`,
      'Bạn sẽ không thấy bài viết của người này nữa. Có thể bỏ chặn trong Cài đặt.',
      [
        {text: 'Hủy', style: 'cancel'},
        {
          text: 'Ẩn',
          style: 'destructive',
          onPress: async () => {
            const next = [...new Set([...blocked, post.author_id])];
            setBlocked(next);
            await storage.setBlockedAuthors(next);
          },
        },
      ],
    );

  const deletePost = (post: Post) =>
    Alert.alert('Xóa bài viết?', 'Bài viết sẽ bị xóa vĩnh viễn.', [
      {text: 'Hủy', style: 'cancel'},
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: async () => {
          try {
            await communityAPI.remove(post.id);
            setPosts(list => list.filter(p => p.id !== post.id));
          } catch (e) {
            Alert.alert('Lỗi', errorMessage(e));
          }
        },
      },
    ]);

  const openMenu = (post: Post) =>
    post.is_mine
      ? Alert.alert('Bài viết của bạn', undefined, [
          {text: 'Xóa bài viết', style: 'destructive', onPress: () => deletePost(post)},
          {text: 'Đóng', style: 'cancel'},
        ])
      : Alert.alert('Tùy chọn', undefined, [
          {text: 'Báo cáo vi phạm', onPress: () => reportPost(post)},
          {text: 'Ẩn bài của người này', onPress: () => blockAuthor(post)},
          {text: 'Đóng', style: 'cancel'},
        ]);

  const visible = posts.filter(p => !blocked.includes(p.author_id));

  const renderPost = ({item: post}: {item: Post}) => (
    <View style={styles.postCard}>
      <View style={styles.postHeader}>
        <Image source={post.is_mine ? myAvatarSource : avatarSource} style={styles.avatar} />
        <View style={styles.postHeaderTextContainer}>
          <Text style={styles.postUserName}>{post.author_name}</Text>
          <Text style={styles.postMeta} numberOfLines={1}>
            {timeAgo(post.created_at)}
            {post.distance_km !== null ? ` · ${formatDistance(post.distance_km)}` : ''}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.menuButton}
          onPress={() => openMenu(post)}
          accessibilityLabel="Tùy chọn bài viết">
          {moreIcon(vw(6), vw(6))}
        </TouchableOpacity>
      </View>

      <View style={styles.badges}>
        <Text style={styles.badge}>{CATEGORY_LABEL[post.category] || post.category}</Text>
        {post.water_level && post.water_level !== 'none' && (
          <Text style={[styles.badge, styles.waterBadge]}>
            {WATER_LEVEL_LABEL[post.water_level]}
          </Text>
        )}
      </View>
      <Text style={styles.postCardDescription}>{post.description}</Text>
      {post.address ? <Text style={styles.postAddress}>📍 {post.address}</Text> : null}

      {post.image_url && <Image source={{uri: post.image_url}} style={styles.postImage} />}

      <TouchableOpacity
        style={[styles.confirmButton, post.confirmed_by_me && styles.confirmButtonActive]}
        onPress={() => toggleConfirm(post)}
        disabled={post.is_mine}>
        <Text style={[styles.confirmText, post.confirmed_by_me && styles.confirmTextActive]}>
          👁 Tôi cũng thấy{post.confirm_count ? ` · ${post.confirm_count}` : ''}
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <CustomStatusBar backgroundColor="#fff" barStyle="dark-content" />
      <FlatList
        data={visible}
        keyExtractor={p => String(p.id)}
        renderItem={renderPost}
        contentContainerStyle={styles.scrollContentContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2A4B8D']} />
        }
        ListHeaderComponent={
          <>
            <View style={styles.sendAlertOuterContainer}>
              <TouchableOpacity
                style={styles.sendAlertButton}
                onPress={() => navigation.navigate('AddReport')}>
                <View style={styles.plusIconContainer}>
                  <Text style={styles.plusIcon}>+</Text>
                </View>
                <Text style={styles.sendAlertButtonText}>GỬI CẢNH BÁO THỰC TẾ</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Cảnh báo thực tế gần bạn</Text>
              <Text style={styles.sectionSubtitle}>
                Trong bán kính 50 km, 7 ngày gần nhất. Tự động cập nhật mỗi phút.
              </Text>
            </View>
          </>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator size="large" color="#2A4B8D" style={styles.loader} />
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                {error || 'Chưa có báo cáo nào gần bạn. Hãy là người đầu tiên chia sẻ tình hình!'}
              </Text>
              {error && (
                <Text style={styles.retry} onPress={load}>
                  Thử lại
                </Text>
              )}
            </View>
          )
        }
      />
    </SafeAreaView>
  );
};

export default Report;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
  },
  scrollContentContainer: {
    paddingBottom: vh(3),
  },
  sendAlertOuterContainer: {
    backgroundColor: '#fff',
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  sendAlertButton: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    backgroundColor: '#fff',
    width: '100%',
    maxWidth: 350,
  },
  plusIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#2A4B8D',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  plusIcon: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
  },
  sendAlertButtonText: {
    color: '#2A4B8D',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  sectionHeader: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333333',
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#7F8C8D',
    marginTop: 2,
  },
  postCard: {
    backgroundColor: '#E9F5FE',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    marginHorizontal: 16,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#FFF',
  },
  postHeaderTextContainer: {
    flex: 1,
  },
  postUserName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2C3E50',
  },
  postMeta: {
    fontSize: 13,
    color: '#7F8C8D',
  },
  menuButton: {
    padding: 6,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  badge: {
    fontSize: 13,
    color: '#2A4B8D',
    backgroundColor: '#D6EFFF',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    overflow: 'hidden',
    marginRight: 6,
    marginBottom: 4,
  },
  waterBadge: {
    color: '#FFFFFF',
    backgroundColor: '#2A78D6',
  },
  postCardDescription: {
    fontSize: 15,
    color: '#333333',
    marginBottom: 8,
    lineHeight: 21,
  },
  postAddress: {
    fontSize: 13,
    color: '#566573',
    marginBottom: 8,
  },
  postImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    resizeMode: 'cover',
    marginTop: 4,
    backgroundColor: '#D6EAF8',
  },
  confirmButton: {
    marginTop: 12,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: '#D6EFFF',
  },
  confirmButtonActive: {
    backgroundColor: '#2A4B8D',
  },
  confirmText: {
    color: '#2A4B8D',
    fontWeight: '600',
    fontSize: 14,
  },
  confirmTextActive: {
    color: '#FFFFFF',
  },
  loader: {
    marginTop: vh(5),
  },
  empty: {
    alignItems: 'center',
    paddingHorizontal: vw(8),
    paddingTop: vh(4),
  },
  emptyText: {
    textAlign: 'center',
    color: '#7F8C8D',
    fontSize: 15,
    lineHeight: 22,
  },
  retry: {
    marginTop: 12,
    color: '#2A4B8D',
    fontWeight: 'bold',
    fontSize: 15,
  },
});
