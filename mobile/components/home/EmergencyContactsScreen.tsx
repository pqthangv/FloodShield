import React, {JSX, useCallback, useMemo, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Linking,
  Animated,
  PanResponder,
  Pressable,
  Alert,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {SafeAreaView} from 'react-native-safe-area-context';
import CustomStatusBar from '../CustomStatusBar';
import {Layout, useLayout, useStyles} from '../../services/layout';
import {
  ambulanceIcon,
  backIcon,
  contactIcon,
  copIcon,
  fireFighterIcon,
  rescueIcon,
} from '../../assets/svgIcon';
import {MessageKey, translate, useI18n} from '../../i18n';

interface EmergencyContact {
  id: string;
  name: MessageKey;
  number: string;
  /** Drawn at the size of the screen now. */
  icon: (width: number, height: number) => JSX.Element;
  color: string;
  iconBackgroundColor: string;
}

// Vietnam's official emergency numbers (free from any phone, including without a SIM credit).
const emergencyContactsData: EmergencyContact[] = [
  {
    id: '115',
    name: 'contact115',
    number: '115',
    icon: ambulanceIcon,
    color: '#F0F4C3',
    iconBackgroundColor: '#D4E157',
  },
  {
    id: '114',
    name: 'contact114',
    number: '114',
    icon: fireFighterIcon,
    color: '#FFCDD2',
    iconBackgroundColor: '#F06292',
  },
  {
    id: '113',
    name: 'contact113',
    number: '113',
    icon: copIcon,
    color: '#FFCCBC',
    iconBackgroundColor: '#FF8A65',
  },
  {
    id: '112',
    name: 'contact112',
    number: '112',
    icon: rescueIcon,
    color: '#FFF9C4',
    iconBackgroundColor: '#FFEE58',
  },
  {
    id: '111',
    name: 'contact111',
    number: '111',
    icon: contactIcon,
    color: '#E1BEE7',
    iconBackgroundColor: '#BA68C8',
  },
];

// The round button that slides, and how far it goes: sizes that follow the screen.
const slideSizes = ({vw}: Layout) => {
  const range = vw(51);
  // Must slide most of the way so a call is never started by accident.
  return {button: vw(13), range, threshold: range * 0.6};
};

const callNumber = (phoneNumber: string) => Linking.openURL(`tel:${phoneNumber}`);

const confirmCall = (item: EmergencyContact) =>
  Alert.alert(translate('callNumberQ', {number: item.number}), translate(item.name), [
    {text: translate('cancel'), style: 'cancel'},
    {text: translate('call'), onPress: () => callNumber(item.number)},
  ]);

const EmergencyContactItem = ({item}: {item: EmergencyContact}) => {
  const {t} = useI18n();
  const layout = useLayout();
  const {vw} = layout;
  const {range, threshold} = slideSizes(layout);
  const styles = useStyles(makeStyles);
  const translateX = useRef(new Animated.Value(0)).current;

  // A tap never calls, so a call isn't started by mistake (in a pocket, or by a child): the
  // button moves a little to show that it slides.
  const nudge = useCallback(
    () =>
      Animated.sequence([
        Animated.timing(translateX, {toValue: vw(12), duration: 180, useNativeDriver: true}),
        Animated.spring(translateX, {toValue: 0, useNativeDriver: true, bounciness: 12}),
      ]).start(),
    [translateX, vw],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // The button takes the touch as soon as it's pressed: the card around it would otherwise
        // keep it, and a child can't take a touch back from its parent once it has started.
        onStartShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_, g) => {
          translateX.setValue(Math.max(0, Math.min(g.dx, range)));
        },
        onPanResponderRelease: (_, g) => {
          if (Math.abs(g.dx) < 8 && Math.abs(g.dy) < 8) {
            nudge();
            return;
          }
          if (g.dx >= threshold) {
            callNumber(item.number);
          }
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 4,
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(translateX, {toValue: 0, useNativeDriver: true}).start();
        },
      }),
    [item.number, translateX, nudge, range, threshold],
  );

  return (
    <Pressable
      onPress={nudge}
      style={[styles.itemContainer, {backgroundColor: item.color}]}
      accessibilityRole="button"
      accessibilityLabel={t('contactA11y', {name: t(item.name), number: item.number})}
      // Screen reader users can't slide: their double tap asks "Call 115?" first.
      accessibilityActions={[{name: 'activate'}]}
      onAccessibilityAction={event => {
        if (event.nativeEvent.actionName === 'activate') {
          confirmCall(item);
        }
      }}>
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.iconDraggable,
          {backgroundColor: item.iconBackgroundColor},
          {transform: [{translateX}]},
        ]}>
        {item.icon(vw(6.5), vw(6.5))}
      </Animated.View>
      <View style={styles.staticContentContainer}>
        <View style={styles.infoContainer}>
          <Text style={styles.itemName}>{t(item.name)}</Text>
          <Text style={styles.itemNumber}>{item.number}</Text>
        </View>
        <View style={styles.slidePromptContainer}>
          <Text style={styles.slidePromptText}>{t('slideToCall')}</Text>
        </View>
      </View>
    </Pressable>
  );
};

const EmergencyContactsScreen = () => {
  const navigation = useNavigation();
  const {t} = useI18n();
  const {vw} = useLayout();
  const styles = useStyles(makeStyles);

  return (
    <SafeAreaView style={styles.container}>
      <CustomStatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          {backIcon(vw(6), vw(6))}
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('emergencyContacts')}</Text>
      </View>
      <FlatList
        data={emergencyContactsData}
        renderItem={({item}) => <EmergencyContactItem item={item} />}
        keyExtractor={item => item.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        ListFooterComponent={
          <Text style={styles.footer}>{t('emergencyFooter')}</Text>
        }
      />
    </SafeAreaView>
  );
};

const makeStyles = (layout: Layout) => {
  const {vw, vh} = layout;
  const {button} = slideSizes(layout);
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: 'white',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: vw(4),
      paddingTop: vh(2),
      paddingBottom: vh(2.5),
      backgroundColor: 'white',
      borderBottomWidth: 1,
      borderBottomColor: '#E0E0E0',
    },
    backButton: {
      padding: vw(1),
    },
    headerTitle: {
      fontSize: vw(5.5),
      fontWeight: 'bold',
      color: '#2C3E50',
      marginLeft: vw(3),
      textAlign: 'center',
      flex: 1,
      marginRight: vw(10),
    },
    list: {
      flex: 1,
      paddingHorizontal: vw(3),
      marginTop: vh(2),
    },
    listContent: {
      paddingBottom: vh(2),
    },
    itemContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: vw(4.5),
      paddingVertical: vh(1.5),
      marginBottom: vh(2),
      elevation: 3,
      shadowColor: '#000',
      shadowOffset: {width: 0, height: 2},
      shadowOpacity: 0.15,
      shadowRadius: 2.5,
      position: 'relative',
    },
    // Next to the button, in the card's row: a long name with large text makes the card taller
    // (it used to lie over the card and spill out of it).
    staticContentContainer: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      marginLeft: vw(3.5),
      marginRight: vw(3),
    },
    iconDraggable: {
      width: button,
      height: button,
      borderRadius: button / 2,
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1,
      marginLeft: vw(3),
    },
    infoContainer: {
      flex: 1,
      justifyContent: 'center',
    },
    itemName: {
      fontSize: vw(4.3),
      fontWeight: 'bold',
      color: '#2C3E50',
    },
    itemNumber: {
      fontSize: vw(5),
      fontWeight: 'bold',
      color: '#34495E',
      marginTop: vh(0.3),
    },
    slidePromptContainer: {
      width: vw(28),
      alignSelf: 'stretch',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: vw(1),
    },
    slidePromptText: {
      fontSize: vw(3.3),
      color: '#34495E',
      fontWeight: '500',
      textAlign: 'center',
    },
    footer: {
      fontSize: vw(3.4),
      color: '#7F8C8D',
      textAlign: 'center',
      paddingHorizontal: vw(4),
      marginTop: vh(1),
    },
  });
};

export default EmergencyContactsScreen;
