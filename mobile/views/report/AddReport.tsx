import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import React, {useState, useEffect} from 'react';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {launchCamera, launchImageLibrary, Asset} from 'react-native-image-picker';
import CustomStatusBar from '../../components/CustomStatusBar';
import {backIcon, cameraIcon, imageIcon} from '../../assets/svgIcon';
import {vw} from '../../services/styleProps';
import {communityAPI} from '../../apis/disasterAPI';
import {locationLabel, useApp} from '../../context/AppContext';
import storage from '../../services/storage';
import locationService from '../../services/locationService';
import {errorMessage} from '../../services/axiosClient';
import {PostCategory, WaterLevel} from '../../services/model';
import {CATEGORIES, WATER_LEVELS, categoryLabel, waterLevelLabel} from '../bottomtabs/Report';
import {useI18n} from '../../i18n';

const pickerOptions = {
  mediaType: 'photo' as const,
  maxWidth: 1600,
  maxHeight: 1600,
  quality: 0.8 as const,
  saveToPhotos: false,
};

const AddReport = () => {
  const navigation = useNavigation();
  const {location, weather} = useApp();
  const {t} = useI18n();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<PostCategory>('flood');
  const [waterLevel, setWaterLevel] = useState<WaterLevel | null>(null);
  const [description, setDescription] = useState('');
  const [image, setImage] = useState<Asset | null>(null);
  const [coords, setCoords] = useState(location);
  const [placeName, setPlaceName] = useState(locationLabel(location, weather));
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    storage.getNickname().then(saved => saved && setName(saved));
  }, []);

  const locateNow = async () => {
    setLocating(true);
    try {
      const pos = await locationService.getCurrentPosition();
      setCoords({...pos, mode: 'gps'});
      setPlaceName(t('currentGps'));
    } catch (e: any) {
      Alert.alert(t('locationFailed'), e.message);
    } finally {
      setLocating(false);
    }
  };

  const handlePick = async (fromCamera: boolean) => {
    const result = fromCamera
      ? await launchCamera(pickerOptions)
      : await launchImageLibrary({...pickerOptions, selectionLimit: 1});
    if (result.errorCode) {
      Alert.alert(t('cannotOpen'), result.errorMessage || t('pleaseRetry'));
    } else if (result.assets?.[0]) {
      setImage(result.assets[0]);
    }
  };

  // Google Play requires users to accept the content rules before posting.
  const ensureRulesAccepted = async () => {
    if (await storage.getRulesAccepted()) {
      return true;
    }
    return new Promise<boolean>(resolve =>
      Alert.alert(t('communityRulesTitle'), t('communityRules'), [
        {text: t('cancel'), style: 'cancel', onPress: () => resolve(false)},
        {
          text: t('agree'),
          onPress: async () => {
            await storage.setRulesAccepted();
            resolve(true);
          },
        },
      ], {cancelable: true, onDismiss: () => resolve(false)}),
    );
  };

  const handleSubmit = async () => {
    if (!coords) {
      Alert.alert(t('missingLocation'), t('missingLocationMessage'));
      return;
    }
    if (!name.trim()) {
      Alert.alert(t('missingName'), t('missingNameMessage'));
      return;
    }
    if (description.trim().length < 3) {
      Alert.alert(t('missingDescription'), t('missingDescriptionMessage'));
      return;
    }
    if (!(await ensureRulesAccepted())) {
      return;
    }

    setSubmitting(true);
    try {
      await storage.setNickname(name.trim());
      await communityAPI.createPost({
        author_name: name.trim(),
        description: description.trim(),
        latitude: coords.latitude,
        longitude: coords.longitude,
        category,
        water_level: category === 'flood' ? waterLevel : null,
        address: coords.mode === 'manual' ? coords.name : null,
        image: image?.uri ? {uri: image.uri, type: image.type, fileName: image.fileName} : null,
      });
      Alert.alert(t('sent'), t('sentMessage'));
      navigation.goBack();
    } catch (error) {
      Alert.alert(t('sendFailed'), errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const chip = (selected: boolean) => [styles.chip, selected && styles.chipSelected];
  const chipText = (selected: boolean) => [styles.chipText, selected && styles.chipTextSelected];

  return (
    <SafeAreaView style={styles.container}>
      <CustomStatusBar backgroundColor="white" barStyle={'dark-content'} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          {backIcon(24, 24, '#2A4B8D')}
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('newReportTitle')}</Text>
      </View>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContainer}
          keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>{t('incidentType')}</Text>
          <View style={styles.chips}>
            {CATEGORIES.map((key: PostCategory) => (
              <TouchableOpacity key={key} style={chip(category === key)} onPress={() => setCategory(key)}>
                <Text style={chipText(category === key)}>{categoryLabel(key)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {category === 'flood' && (
            <>
              <Text style={styles.label}>{t('waterLevel')}</Text>
              <View style={styles.chips}>
                {WATER_LEVELS.map((key: WaterLevel) => (
                  <TouchableOpacity
                    key={key}
                    style={chip(waterLevel === key)}
                    onPress={() => setWaterLevel(waterLevel === key ? null : key)}>
                    <Text style={chipText(waterLevel === key)}>{waterLevelLabel(key)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          <Text style={styles.label}>{t('description')}</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder={t('descriptionPlaceholder')}
            placeholderTextColor="#9AA5B1"
            value={description}
            onChangeText={setDescription}
            multiline
            maxLength={1000}
          />

          <Text style={styles.label}>{t('location')}</Text>
          <View style={styles.locationRow}>
            <Text style={styles.locationText} numberOfLines={2}>
              📍 {coords ? placeName : t('noLocation')}
            </Text>
            <TouchableOpacity onPress={locateNow} disabled={locating}>
              {locating ? (
                <ActivityIndicator color="#2A4B8D" />
              ) : (
                <Text style={styles.linkText}>{t('useGps')}</Text>
              )}
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>{t('displayName')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('yourName')}
            placeholderTextColor="#9AA5B1"
            value={name}
            onChangeText={setName}
            maxLength={40}
          />

          <Text style={styles.imageSectionTitle}>{t('addPhoto')}</Text>
          {image?.uri ? (
            <TouchableOpacity style={styles.imagePickerBox} onPress={() => setImage(null)}>
              <Image source={{uri: image.uri}} style={styles.previewImage} />
              <Text style={styles.removeImage}>{t('removePhoto')}</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.imageButtons}>
              <TouchableOpacity style={styles.imagePickerBox} onPress={() => handlePick(true)}>
                {cameraIcon(40, 40, '#B0B0B0')}
                <Text style={styles.imagePickerText}>{t('takePhoto')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.imagePickerBox} onPress={() => handlePick(false)}>
                {imageIcon(40, 40, '#B0B0B0')}
                <Text style={styles.imagePickerText}>{t('choosePhoto')}</Text>
              </TouchableOpacity>
            </View>
          )}
          <Text style={styles.privacyNote}>{t('publicNote')}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.submitButton, submitting && styles.submitDisabled]}
          onPress={handleSubmit}
          disabled={submitting}>
          {submitting ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.submitButtonText}>{t('submitReport')}</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

export default AddReport;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'white',
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2A4B8D',
  },
  scrollView: {
    flex: 1,
    backgroundColor: '#E9F5FE',
    borderTopLeftRadius: vw(5),
    borderTopRightRadius: vw(5),
  },
  scrollContainer: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
  },
  label: {
    fontSize: 16,
    color: '#2A4B8D',
    marginBottom: 8,
    marginTop: 16,
    fontWeight: '600',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  chip: {
    borderWidth: 1,
    borderColor: '#2A4B8D',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginRight: 8,
    marginBottom: 8,
    backgroundColor: 'white',
  },
  chipSelected: {
    backgroundColor: '#2A4B8D',
  },
  chipText: {
    color: '#2A4B8D',
    fontSize: 14,
  },
  chipTextSelected: {
    color: 'white',
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    borderColor: '#D0D0D0',
    borderWidth: 1,
    color: '#333',
  },
  multiline: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderColor: '#D0D0D0',
    borderWidth: 1,
  },
  locationText: {
    flex: 1,
    fontSize: 15,
    color: '#333',
    marginRight: 8,
  },
  linkText: {
    color: '#2A78D6',
    fontWeight: 'bold',
  },
  imageSectionTitle: {
    fontSize: 16,
    color: '#E74C3C',
    textAlign: 'center',
    marginTop: 24,
    marginBottom: 12,
    fontWeight: 'bold',
  },
  imageButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  imagePickerBox: {
    flex: 1,
    height: 150,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 4,
    overflow: 'hidden',
  },
  imagePickerText: {
    fontSize: 14,
    color: '#8A8A8A',
    marginTop: 8,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  removeImage: {
    position: 'absolute',
    top: 8,
    right: 8,
    color: 'white',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
  privacyNote: {
    fontSize: 12,
    color: '#7F8C8D',
    textAlign: 'center',
    marginTop: 12,
  },
  footer: {
    padding: 20,
    backgroundColor: '#E9F5FE',
  },
  submitButton: {
    backgroundColor: '#2A4B8D',
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
