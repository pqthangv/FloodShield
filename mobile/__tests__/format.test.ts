import {formatDistance, isNightAt, parseLocal, shortDate, timeAgo, timeOf} from '../services/format';

test('parses API local times without shifting the time zone', () => {
  const d = parseLocal('2026-10-04T15:30');
  expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([
    2026, 9, 4, 15, 30,
  ]);
  expect(shortDate('2026-10-04')).toBe('4/10');
  expect(timeOf('2026-10-04T05:41')).toBe('05:41');
});

test('hours before sunrise or after sunset are night', () => {
  const days = [
    {date: '2026-10-13', sunrise: '2026-10-13T05:52', sunset: '2026-10-13T17:34'},
    {date: '2026-10-14', sunrise: '2026-10-14T05:52', sunset: '2026-10-14T17:33'},
  ];
  expect(isNightAt('2026-10-13T05:00', days)).toBe(true);
  expect(isNightAt('2026-10-13T06:00', days)).toBe(false);
  expect(isNightAt('2026-10-13T17:00', days)).toBe(false);
  expect(isNightAt('2026-10-13T18:00', days)).toBe(true);
  // After midnight the next day's sunrise counts.
  expect(isNightAt('2026-10-14T02:00', days)).toBe(true);
  expect(isNightAt('2026-10-14T12:00', days)).toBe(false);
  // A day missing from the forecast is drawn as day.
  expect(isNightAt('2026-10-20T23:00', days)).toBe(false);
});

test('formats distances', () => {
  expect(formatDistance(0.35)).toBe('350 m');
  expect(formatDistance(4.26)).toBe('4.3 km');
  expect(formatDistance(null)).toBe('');
});

test('relative times are in Vietnamese', () => {
  const minutesAgo = (m: number) => new Date(Date.now() - m * 60000).toISOString();
  expect(timeAgo(minutesAgo(0))).toBe('Vừa xong');
  expect(timeAgo(minutesAgo(5))).toBe('5 phút trước');
  expect(timeAgo(minutesAgo(180))).toBe('3 giờ trước');
  expect(timeAgo(minutesAgo(60 * 50))).toBe('2 ngày trước');
});
