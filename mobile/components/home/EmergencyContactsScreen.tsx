import React, {JSX, useMemo, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Linking,
  Animated,
  PanResponder,
  Alert,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {SafeAreaView} from 'react-native-safe-area-context';
import CustomStatusBar from '../CustomStatusBar';
import {vh, vw} from '../../services/styleProps';
import {
  ambulanceIcon,
  backIcon,
  contactIcon,
  copIcon,
  fireFighterIcon,
  rescueIcon,
} from '../../assets/svgIcon';

interface EmergencyContact {
  id: string;
  name: string;
  number: string;
  icon: JSX.Element;
  color: string;
  iconBackgroundColor: string;
}

// Vietnam's official emergency numbers (free from any phone, including without a SIM credit).
const emergencyContactsData: EmergencyContact[] = [
  {
    id: '115',
    name: 'Cấp cứu y tế',
    number: '115',
    icon: ambulanceIcon(vw(6.5), vw(6.5)),
    color: '#F0F4C3',
    iconBackgroundColor: '#D4E157',
  },
  {
    id: '114',
    name: 'Cứu hỏa, cứu nạn cứu hộ',
    number: '114',
    icon: fireFighterIcon(vw(6.5), vw(6.5)),
    color: '#FFCDD2',
    iconBackgroundColor: '#F06292',
  },
  {
    id: '113',
    name: 'Công an',
    number: '113',
    icon: copIcon(vw(6.5), vw(6.5)),
    color: '#FFCCBC',
    iconBackgroundColor: '#FF8A65',
  },
  {
    id: '112',
    name: 'Tìm kiếm cứu nạn',
    number: '112',
    icon: rescueIcon(vw(6.5), vw(6.5)),
    color: '#FFF9C4',
    iconBackgroundColor: '#FFEE58',
  },
  {
    id: '111',
    name: 'Bảo vệ trẻ em',
    number: '111',
    icon: contactIcon(vw(6.5), vw(6.5)),
    color: '#E1BEE7',
    iconBackgroundColor: '#BA68C8',
  },
];

const ICON_DRAGGABLE_WIDTH = vw(13);
const SLIDE_FULL_RANGE = vw(51);
// Must slide most of the way so a call is never started by accident.
const SLIDE_TO_CALL_THRESHOLD = SLIDE_FULL_RANGE * 0.6;

const callNumber = (phoneNumber: string) => Linking.openURL(`tel:${phoneNumber}`);

const confirmCall = (item: EmergencyContact) =>
  Alert.alert(`Gọi ${item.number}?`, item.name, [
    {text: 'Hủy', style: 'cancel'},
    {text: 'Gọi', onPress: () => callNumber(item.number)},
  ]);

const EmergencyContactItem = ({item}: {item: EmergencyContact}) => {
  const translateX = useRef(new Animated.Value(0)).current;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dy) < 20,
        onPanResponderMove: (_, g) => {
          translateX.setValue(Math.max(0, Math.min(g.dx, SLIDE_FULL_RANGE)));
        },
        onPanResponderRelease: (_, g) => {
          if (g.dx >= SLIDE_TO_CALL_THRESHOLD) {
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
    [item.number, translateX],
  );

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => confirmCall(item)}
      style={[styles.itemContainer, {backgroundColor: item.color}]}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, số ${item.number}. Nhấn để gọi`}>
      <View style={styles.staticContentContainer}>
        <View style={styles.infoContainer}>
          <Text style={styles.itemName}>{item.name}</Text>
          <Text style={styles.itemNumber}>{item.number}</Text>
        </View>
        <View style={styles.slidePromptContainer}>
          <Text style={styles.slidePromptText}>{'Trượt để gọi >>>'}</Text>
        </View>
      </View>

      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.iconDraggable,
          {backgroundColor: item.iconBackgroundColor},
          {transform: [{translateX}]},
        ]}>
        {item.icon}
      </Animated.View>
    </TouchableOpacity>
  );
};

const EmergencyContactsScreen = () => {
  const navigation = useNavigation();

  return (
    <SafeAreaView style={styles.container}>
      <CustomStatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          {backIcon(vw(6), vw(6))}
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Liên lạc khẩn cấp</Text>
      </View>
      <FlatList
        data={emergencyContactsData}
        renderItem={({item}) => <EmergencyContactItem item={item} />}
        keyExtractor={item => item.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        ListFooterComponent={
          <Text style={styles.footer}>
            Các số khẩn cấp gọi miễn phí từ mọi điện thoại. Hãy nói rõ địa chỉ, tình
            trạng và số người cần hỗ trợ.
          </Text>
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
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
  staticContentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'absolute',
    left: vw(3) + ICON_DRAGGABLE_WIDTH + vw(3.5),
    right: vw(3),
    top: 0,
    bottom: 0,
  },
  iconDraggable: {
    width: ICON_DRAGGABLE_WIDTH,
    height: ICON_DRAGGABLE_WIDTH,
    borderRadius: ICON_DRAGGABLE_WIDTH / 2,
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
    height: '100%',
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

export default EmergencyContactsScreen;
