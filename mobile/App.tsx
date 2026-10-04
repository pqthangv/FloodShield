/* eslint-disable react/no-unstable-nested-components */
import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {StyleSheet, View} from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import {vh, vw} from './services/styleProps';
import Home from './views/bottomtabs/Home';
import {homeIcon, menuIcon, predictIcon, reportIcon} from './assets/svgIcon';
import Predict from './views/bottomtabs/Predict';
import Abilities from './views/bottomtabs/Abilities';
import Report from './views/bottomtabs/Report';
import MustDoScreen from './views/predict/MustDo';
import AddReport from './views/report/AddReport';
import NearbySheltersScreen from './components/home/NearbySheltersScreen';
import EmergencyContactsScreen from './components/home/EmergencyContactsScreen';
import SettingsScreen from './views/settings/Settings';
import LocationPickerScreen from './views/settings/LocationPicker';
import {AppProvider} from './context/AppContext';

export type RootStackParamList = {
  MainTabs: {screen?: string; params?: object} | undefined;
  MustDo: {disasterTypeId: number; title?: string};
  AddReport: undefined;
  NearbyShelters: undefined;
  EmergencyContacts: undefined;
  Settings: undefined;
  LocationPicker: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();

const TabNavigator = () => {
  const insets = useSafeAreaInsets();
  const createTabBarIcon =
    (iconComponent: Function) =>
    ({color, focused}: {color: string; focused: boolean}) => {
      const iconOnlySize = vw(9);
      const iconContainerSize = vw(10);

      return (
        <View
          style={[
            styles.iconContainer,
            {
              width: iconContainerSize,
              height: iconContainerSize,
              ...(focused && {
                backgroundColor: '#C9E5FF',
                borderRadius: iconContainerSize / 2,
              }),
            },
          ]}>
          {iconComponent(iconOnlySize, iconOnlySize, color)}
        </View>
      );
    };

  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={{
        tabBarActiveTintColor: '#1F2D54',
        tabBarInactiveTintColor: '#FFFFFF',
        tabBarShowLabel: false,
        tabBarStyle: {
          borderTopWidth: 0,
          backgroundColor: '#1F2D54',
          // Leave room for the Android navigation bar (the app draws edge-to-edge).
          height: vh(7) + insets.bottom,
          paddingTop: vh(1),
          paddingBottom: insets.bottom,
          borderTopLeftRadius: 10,
          borderTopRightRadius: 10,
          elevation: 20,
        },
        headerShown: false,
      }}>
      <Tab.Screen
        name="Home"
        component={Home}
        options={{tabBarIcon: createTabBarIcon(homeIcon), title: 'Trang chủ'}}
      />
      <Tab.Screen
        name="Predict"
        component={Predict}
        options={{tabBarIcon: createTabBarIcon(predictIcon), title: 'Dự báo'}}
      />
      <Tab.Screen
        name="Abilities"
        component={Abilities}
        options={{tabBarIcon: createTabBarIcon(menuIcon), title: 'Kỹ năng'}}
      />
      <Tab.Screen
        name="Report"
        component={Report}
        options={{tabBarIcon: createTabBarIcon(reportIcon), title: 'Cộng đồng'}}
      />
    </Tab.Navigator>
  );
};

const App = () => {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <NavigationContainer>
          <Stack.Navigator
            initialRouteName="MainTabs"
            screenOptions={{headerShown: false}}>
            <Stack.Screen name="MainTabs" component={TabNavigator} />
            <Stack.Screen name="MustDo" component={MustDoScreen} />
            <Stack.Screen name="AddReport" component={AddReport} />
            <Stack.Screen
              name="NearbyShelters"
              component={NearbySheltersScreen}
            />
            <Stack.Screen
              name="EmergencyContacts"
              component={EmergencyContactsScreen}
            />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen
              name="LocationPicker"
              component={LocationPickerScreen}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </AppProvider>
    </SafeAreaProvider>
  );
};
const styles = StyleSheet.create({
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default App;
