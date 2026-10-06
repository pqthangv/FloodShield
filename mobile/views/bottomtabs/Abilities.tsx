 
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  Image,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import React, {useState, useEffect, useCallback} from 'react';
import {SafeAreaView} from 'react-native-safe-area-context';
import {NavigationProp, useNavigation} from '@react-navigation/native';
import CustomStatusBar from '../../components/CustomStatusBar';
import {vh, vw} from '../../services/styleProps';
import disasterAPI from '../../apis/disasterAPI';
import {Dissater} from '../../services/model';
import {useApp} from '../../context/AppContext';
import {errorMessage} from '../../services/axiosClient';
import {useI18n} from '../../i18n';

const Abilities = () => {
  const navigation = useNavigation<NavigationProp<any>>();
  const {alerts} = useApp();
  const {t, lang} = useI18n();
  // "10 việc cần làm khi có lũ" needs the name in lower case; "Flood: 10 things to do" doesn't.
  const typeName = (type: Dissater) => (lang === 'vi' ? type.name.toLowerCase() : type.name);
  const [types, setTypes] = useState<Dissater[]>([]);
  const [selectedTabId, setSelectedTabId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await disasterAPI.getAll();
      setTypes(data);
      setSelectedTabId(current => current ?? data[0]?.id ?? null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload when the language changes: the checklists come from the API in the current language.
  useEffect(() => {
    load();
  }, [load, lang]);

  // "For you": disaster types mentioned in the current alerts first, then floods and storms.
  const alertTypeIds = alerts
    .map(a => a.disaster_type_id)
    .filter((id): id is number => !!id);
  const forYouIds = [...new Set([...alertTypeIds, 2, 1, 4])].slice(0, 3);
  const forYou = forYouIds
    .map(id => types.find(type => type.id === id))
    .filter((type): type is Dissater => !!type);
  const selected = types.find(type => type.id === selectedTabId);

  const openChecklist = (type: Dissater) =>
    navigation.navigate('MustDo', {disasterTypeId: type.id});

  const renderCards = () => (
    <ScrollView
      horizontal={true}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.horizontalCardsContainer}>
      {forYou.map(type => (
        <TouchableOpacity
          key={type.id}
          style={styles.card}
          onPress={() => openChecklist(type)}
          activeOpacity={0.85}>
          <View style={styles.cardTextContainer}>
            <Text style={styles.cardTitle}>
              {t('thingsToDo', {count: type.actions.length, name: typeName(type)})}
            </Text>
            <Text style={styles.cardViews}>
              {alertTypeIds.includes(type.id)
                ? t('relatedToAlert')
                : t('checklist')}
            </Text>
          </View>
          <Image
            source={require('../../assets/abilities/bground.png')}
            style={styles.cardImage}
          />
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  const renderTabData = () => {
    if (loading) {
      return (
        <View style={styles.centeredMessage}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text>{t('loading')}</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.centeredMessage}>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.retry} onPress={load}>
            {t('retry')}
          </Text>
        </View>
      );
    }

    if (!selected || selected.actions.length === 0) {
      return (
        <View style={styles.centeredMessage}>
          <Text>{t('noInfo')}</Text>
        </View>
      );
    }

    return (
      <View style={styles.tabDataContainer}>
        {selected.actions.map((action, index) => (
          <View key={action.action_id || index} style={styles.actionItem}>
            <Text style={styles.actionTitle}>
              {index + 1}. {action.title}
            </Text>
            <Text style={styles.actionDescription}>{action.description}</Text>
          </View>
        ))}
        <TouchableOpacity
          style={styles.checklistButton}
          onPress={() => openChecklist(selected)}>
          <Text style={styles.checklistButtonText}>
            {t('openChecklist', {name: selected.name})}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <CustomStatusBar backgroundColor="#C9E5FF" barStyle={'dark-content'} />
      <ScrollView>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('skillsTitle')}</Text>
        </View>
        {forYou.length > 0 && (
          <>
            <View style={styles.subHeader}>
              <Text style={styles.subHeaderTitle}>{t('forYou')}</Text>
            </View>
            {renderCards()}
          </>
        )}
        <ScrollView
          horizontal={true}
          showsHorizontalScrollIndicator={false}
          style={styles.tabsContainer}
          contentContainerStyle={styles.tabsContentContainer}>
          {types.map(type => (
            <TouchableOpacity
              key={type.id}
              style={[styles.tab, selectedTabId === type.id && styles.selectedTab]}
              onPress={() => setSelectedTabId(type.id)}>
              <Text
                style={[
                  styles.tabText,
                  selectedTabId === type.id && styles.selectedTabText,
                ]}>
                {type.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <View style={{paddingBottom: vh(3)}}>{renderTabData()}</View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default Abilities;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#C9E5FF',
  },
  header: {
    padding: 20,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
  },
  subHeader: {
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  subHeaderTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
  },
  horizontalCardsContainer: {
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    marginRight: 15,
    height: 120,
    overflow: 'hidden',
    width: 300,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  cardTextContainer: {
    flex: 1,
    justifyContent: 'space-evenly',
    alignItems: 'flex-start',
    height: '100%',
    paddingLeft: vw(3),
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000',
  },
  cardViews: {
    fontSize: 12,
    color: '#777',
  },
  cardImage: {
    width: '40%',
    height: '100%',
    marginLeft: 10,
  },
  tabsContainer: {
    flexDirection: 'row',
    paddingVertical: 10,
    backgroundColor: '#C9E5FF',
  },
  tabsContentContainer: {
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  tab: {
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 20,
    backgroundColor: '#E0EFFF',
    marginRight: 10,
  },
  selectedTab: {
    backgroundColor: '#007AFF',
  },
  tabText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  selectedTabText: {
    color: '#fff',
  },
  tabDataContainer: {
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  actionItem: {
    marginBottom: 15,
    padding: 10,
    backgroundColor: '#fff',
    borderRadius: 5,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 1,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 5,
  },
  actionDescription: {
    fontSize: 14,
    color: '#333',
  },
  checklistButton: {
    backgroundColor: '#1F2D54',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 5,
  },
  checklistButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 15,
  },
  centeredMessage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: 'red',
    fontSize: 16,
    textAlign: 'center',
  },
  retry: {
    marginTop: 10,
    color: '#007AFF',
    fontWeight: 'bold',
  },
});
