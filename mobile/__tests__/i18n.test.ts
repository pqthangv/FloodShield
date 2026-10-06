import vi from '../i18n/vi';
import en from '../i18n/en';
import {setLanguageForTests, translate} from '../i18n';
import {longDate, severityLabel, shortDate, timeAgo} from '../services/format';

afterEach(() => setLanguageForTests('vi'));

test('every English text is filled in and keeps the same placeholders', () => {
  for (const key of Object.keys(vi) as (keyof typeof vi)[]) {
    expect(en[key].trim()).not.toBe('');
    const placeholders = (text: string) => (text.match(/\{\w+\}/g) || []).sort();
    // longDate is built differently in each language.
    if (key !== 'longDate') {
      expect(placeholders(en[key])).toEqual(placeholders(vi[key]));
    }
  }
});

test('translate fills placeholders', () => {
  expect(translate('alertsCount', {count: 2})).toBe('Cảnh báo (2)');
  setLanguageForTests('en');
  expect(translate('alertsCount', {count: 2})).toBe('Alerts (2)');
  expect(translate('thingsToDo', {count: 10, name: 'Flood'})).toBe('Flood: 10 things to do');
});

test('dates and labels follow the language', () => {
  const sunday = new Date(2026, 9, 4);
  expect(longDate(sunday)).toBe('Ngày 4 tháng 10 năm 2026');
  expect(shortDate('2026-10-05')).toBe('5/10');
  expect(severityLabel('high')).toBe('Nguy hiểm');

  setLanguageForTests('en');
  expect(longDate(sunday)).toBe('Sunday, 4 October 2026');
  expect(shortDate('2026-10-05')).toBe('5 Oct');
  expect(severityLabel('high')).toBe('Dangerous');
  expect(timeAgo(new Date(Date.now() - 5 * 60000).toISOString())).toBe('5 min ago');
});
