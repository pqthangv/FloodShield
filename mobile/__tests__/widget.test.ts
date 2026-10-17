import {widgetSnapshot} from '../services/widget';
import {Alert, WeatherData} from '../services/model';

const weather = {
  current: {
    temperature: 25.4, condition: 'Mưa vừa', icon: 'rain', is_day: true,
    wind_speed: 14, apparent_temperature: 28.1, humidity: 92,
  },
} as WeatherData;

const alert = (severity: Alert['severity'], title: string) => ({id: title, severity, title}) as Alert;

test('the widget gets the weather and the alerts the app just loaded', () => {
  const snapshot = widgetSnapshot('Phường Thuận Hoá, Huế', weather,
    [alert('high', 'Cảnh báo mưa rất to'), alert('moderate', 'Gió mạnh')], 1000);
  expect(snapshot).toEqual({
    place: 'Phường Thuận Hoá, Huế',
    temperature: 25.4,
    condition: 'Mưa vừa',
    icon: 'rain',
    is_day: true,
    wind_speed: 14,
    apparent_temperature: 28.1,
    humidity: 92,
    alerts: [{title: 'Cảnh báo mưa rất to', severity: 'high'}, {title: 'Gió mạnh', severity: 'moderate'}],
    checked_at: 1000,
  });
});

test("the widget shows the server's short words, or the long ones from an older server", () => {
  const storm = {current: {...weather.current, condition: 'Thunderstorm', condition_short: 'Storm'}} as WeatherData;
  expect(widgetSnapshot('Huế', storm, [], 1000).condition).toBe('Storm');
  const older = {current: {...weather.current, condition: 'Thunderstorm'}} as WeatherData;
  expect(widgetSnapshot('Huế', older, [], 1000).condition).toBe('Thunderstorm');
});

test('no alerts is "all clear", but a failed check is "not known"', () => {
  expect(widgetSnapshot('Huế', weather, [], 1000)).toMatchObject({alerts: [], checked_at: 1000});
  // The check failed: the widget must not turn green.
  expect(widgetSnapshot('Huế', weather, null, 1000)).toMatchObject({alerts: null, checked_at: 0});
});

test('a part that did not load stays empty, so the widget keeps what it had', () => {
  expect(widgetSnapshot(null, null, null, 1000)).toEqual({
    place: null,
    temperature: null,
    condition: null,
    icon: null,
    is_day: true,
    wind_speed: null,
    apparent_temperature: null,
    humidity: null,
    alerts: null,
    checked_at: 0,
  });
});
