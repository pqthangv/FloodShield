import React, {useCallback, useEffect, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import {RouteProp, useRoute, useNavigation} from '@react-navigation/native';
import {vw, vh} from '../../services/styleProps';
import {SafeAreaView} from 'react-native-safe-area-context';
import CustomStatusBar from '../../components/CustomStatusBar';
import {backIcon} from '../../assets/svgIcon';
import disasterAPI from '../../apis/disasterAPI';
import {Dissater} from '../../services/model';
import storage from '../../services/storage';
import {errorMessage} from '../../services/axiosClient';
import {useI18n} from '../../i18n';
import type {RootStackParamList} from '../../App';

type MustDoScreenRouteProp = RouteProp<RootStackParamList, 'MustDo'>;

const CheckBox = ({checked}: {checked: boolean}) => (
  <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
    {checked && <Text style={styles.checkmark}>✓</Text>}
  </View>
);

const MustDoScreen = () => {
  const route = useRoute<MustDoScreenRouteProp>();
  const navigation = useNavigation();
  const {disasterTypeId, title} = route.params;
  const {t, lang} = useI18n();
  const [disaster, setDisaster] = useState<Dissater | null>(null);
  const [done, setDone] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [data, saved] = await Promise.all([
        disasterAPI.getById(disasterTypeId),
        storage.getChecklist(disasterTypeId),
      ]);
      setDisaster(data);
      setDone(saved);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [disasterTypeId]);

  // Reload when the language changes: texts come from the API in the current language.
  useEffect(() => {
    load();
  }, [load, lang]);

  const toggle = (actionId: number) => {
    const next = done.includes(actionId)
      ? done.filter(id => id !== actionId)
      : [...done, actionId];
    setDone(next);
    storage.setChecklist(disasterTypeId, next);
  };

  const reset = () => {
    setDone([]);
    storage.setChecklist(disasterTypeId, []);
  };

  const actions = disaster?.actions || [];
  const screenTitle = disaster
    ? t('thingsToDo', {
        count: actions.length,
        name: lang === 'vi' ? disaster.name.toLowerCase() : disaster.name,
      })
    : t('responseSkills');

  return (
    <SafeAreaView style={styles.safeArea}>
      <CustomStatusBar backgroundColor="white" barStyle={'dark-content'} />
      <View style={styles.headerContainer}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.headerButtonLeft}
          accessibilityLabel={t('back')}>
          {backIcon(vw(7), vw(7), '#1F2D54')}
        </TouchableOpacity>
        {done.length > 0 && (
          <TouchableOpacity onPress={reset} style={styles.headerButtonRight}>
            <Text style={styles.headerButtonText}>{t('reset')}</Text>
          </TouchableOpacity>
        )}
      </View>
      <ScrollView style={styles.container}>
        <Text style={styles.headerTitle}>{screenTitle}</Text>
        {title ? <Text style={styles.context}>{t('relatedTo', {title})}</Text> : null}
        {disaster && (
          <Text style={styles.progress}>
            {t('progress', {
              done: done.filter(id => actions.some(a => a.action_id === id)).length,
              total: actions.length,
            })}
          </Text>
        )}
        {!disaster && !error && (
          <ActivityIndicator size="large" color="#1F2D54" style={styles.loader} />
        )}
        {error && (
          <Text style={[styles.itemDescription, styles.noItemsText]} onPress={load}>
            {error} {t('tapToRetry')}
          </Text>
        )}
        {actions.map(item => {
          const checked = done.includes(item.action_id);
          return (
            <TouchableOpacity
              key={item.action_id}
              style={[styles.itemContainer, checked && styles.itemDone]}
              onPress={() => toggle(item.action_id)}
              accessibilityRole="checkbox"
              accessibilityState={{checked}}>
              <View style={styles.itemHeader}>
                <CheckBox checked={checked} />
                <Text style={styles.itemTitle}>{item.title}</Text>
              </View>
              <Text style={styles.itemDescription}>{item.description}</Text>
            </TouchableOpacity>
          );
        })}
        <View style={{height: vh(4)}} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flex: 1,
    paddingHorizontal: vw(5),
    backgroundColor: '#FFFFFF',
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: vw(5),
    paddingTop: vh(2),
    paddingBottom: vh(1),
    backgroundColor: '#FFFFFF',
  },
  headerButtonLeft: {
    padding: 4,
  },
  headerButtonRight: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 4,
  },
  headerButtonText: {
    color: '#1F2D54',
    fontSize: vw(4),
    fontWeight: 'bold',
  },
  headerTitle: {
    fontSize: vw(6),
    fontWeight: 'bold',
    color: '#1F2D54',
    textAlign: 'center',
    marginBottom: vh(1),
  },
  context: {
    textAlign: 'center',
    color: '#E67E22',
    fontSize: vw(3.8),
    marginBottom: vh(1),
  },
  progress: {
    textAlign: 'center',
    color: '#555',
    fontSize: vw(3.8),
    marginBottom: vh(2.5),
  },
  loader: {
    marginTop: vh(5),
  },
  itemContainer: {
    marginBottom: vh(2.5),
    padding: vw(4),
    backgroundColor: '#F0F0F0',
    borderRadius: vw(2),
  },
  itemDone: {
    backgroundColor: '#E3F2E5',
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: vh(1),
  },
  checkbox: {
    width: vw(6),
    height: vw(6),
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#1F2D54',
    marginRight: vw(3),
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#1F2D54',
  },
  checkmark: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: vw(4),
  },
  itemTitle: {
    fontSize: vw(4.5),
    fontWeight: 'bold',
    color: '#1F2D54',
    flexShrink: 1,
  },
  itemDescription: {
    fontSize: vw(3.8),
    color: '#333333',
    lineHeight: vh(3),
  },
  noItemsText: {
    textAlign: 'center',
    color: '#555555',
  },
});

export default MustDoScreen;
