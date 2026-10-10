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
import {Post, PostCategory, WaterLevel} from '../../services/model';
import storage from '../../services/storage';
import {errorMessage} from '../../services/axiosClient';
import {formatDistance, timeAgo} from '../../services/format';
import {moreIcon} from '../../assets/svgIcon';
import {translate, useI18n} from '../../i18n';

export const CATEGORIES: PostCategory[] = ['flood', 'landslide', 'storm', 'rescue', 'other'];
export const WATER_LEVELS: WaterLevel[] = ['none', 'ankle', 'knee', 'waist', 'chest', 'over_head'];

export const categoryLabel = (category: string) =>
  CATEGORIES.includes(category as PostCategory)
    ? translate(`category_${category as PostCategory}`)
    : category;
export const waterLevelLabel = (level: WaterLevel) => translate(`water_${level}`);

// Avatar: the author's initial on a colour picked from their anonymous id, so each person keeps
// one colour. Dark enough for white text, and no red (it would look like a warning).
const AVATAR_COLORS = ['#2A78D6', '#0F7C80', '#B35A00', '#7D3C98', '#1E8449', '#4A5A70'];
const MY_AVATAR_COLOR = '#1F2D54';

function avatarColor(authorId: string) {
  let hash = 0;
  for (const ch of authorId) {
    hash = (hash * 31 + ch.charCodeAt(0)) % 997;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

const Avatar = ({name, authorId, mine}: {name: string; authorId: string; mine: boolean}) => (
  <View
    style={[styles.avatar, {backgroundColor: mine ? MY_AVATAR_COLOR : avatarColor(authorId)}]}
    importantForAccessibility="no-hide-descendants"
    accessibilityElementsHidden>
    <Text style={styles.avatarInitial}>{Array.from(name.trim())[0]?.toUpperCase() || '?'}</Text>
  </View>
);

const REFRESH_MS = 60 * 1000;

const Report = () => {
  const navigation = useNavigation<NavigationProp<any>>();
  const {location} = useApp();
  const {t} = useI18n();
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
      Alert.alert(t('error'), errorMessage(e));
    }
  };

  const reportPost = (post: Post) =>
    Alert.alert(t('reportPostTitle'), t('reportPostQuestion'), [
      {text: t('reasonFalse'), onPress: () => sendReport(post, 'false_info')},
      {text: t('reasonAbuse'), onPress: () => sendReport(post, 'abuse')},
      {text: t('cancel'), style: 'cancel'},
    ]);

  const sendReport = async (post: Post, reason: string) => {
    try {
      await communityAPI.report(post.id, reason);
      setPosts(list => list.filter(p => p.id !== post.id));
      Alert.alert(t('thanks'), t('reportedMessage'));
    } catch (e) {
      Alert.alert(t('error'), errorMessage(e));
    }
  };

  const blockAuthor = (post: Post) =>
    Alert.alert(
      t('hideAuthorQ', {name: post.author_name}),
      t('hideAuthorMessage'),
      [
        {text: t('cancel'), style: 'cancel'},
        {
          text: t('hide'),
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
    Alert.alert(t('deletePostQ'), t('deletePostMessage'), [
      {text: t('cancel'), style: 'cancel'},
      {
        text: t('delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await communityAPI.remove(post.id);
            setPosts(list => list.filter(p => p.id !== post.id));
          } catch (e) {
            Alert.alert(t('error'), errorMessage(e));
          }
        },
      },
    ]);

  const openMenu = (post: Post) =>
    post.is_mine
      ? Alert.alert(t('yourPost'), undefined, [
          {text: t('deletePost'), style: 'destructive', onPress: () => deletePost(post)},
          {text: t('close'), style: 'cancel'},
        ])
      : Alert.alert(t('options'), undefined, [
          {text: t('reportAbuse'), onPress: () => reportPost(post)},
          {text: t('hideThisAuthor'), onPress: () => blockAuthor(post)},
          {text: t('close'), style: 'cancel'},
        ]);

  const visible = posts.filter(p => !blocked.includes(p.author_id));

  const renderPost = ({item: post}: {item: Post}) => (
    <View style={styles.postCard}>
      <View style={styles.postHeader}>
        <Avatar name={post.author_name} authorId={post.author_id} mine={post.is_mine} />
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
          accessibilityLabel={t('postOptions')}>
          {moreIcon(vw(6), vw(6))}
        </TouchableOpacity>
      </View>

      <View style={styles.badges}>
        <Text style={styles.badge}>{categoryLabel(post.category)}</Text>
        {post.water_level && post.water_level !== 'none' && (
          <Text style={[styles.badge, styles.waterBadge]}>
            {waterLevelLabel(post.water_level)}
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
          {t('iSeeItToo')}
          {post.confirm_count ? ` · ${post.confirm_count}` : ''}
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
                <Text style={styles.sendAlertButtonText}>{t('sendRealAlert')}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t('realAlertsNearYou')}</Text>
              <Text style={styles.sectionSubtitle}>{t('feedSubtitle')}</Text>
            </View>
          </>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator size="large" color="#2A4B8D" style={styles.loader} />
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                {error || t('noPosts')}
              </Text>
              {error && (
                <Text style={styles.retry} onPress={load}>
                  {t('retry')}
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
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
