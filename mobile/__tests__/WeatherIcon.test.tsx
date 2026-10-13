import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import WeatherIcon, {partsFor} from '../components/WeatherIcon';
import {WeatherIcon as Condition} from '../services/model';

const CONDITIONS: Condition[] = ['clear', 'cloudy', 'drizzle', 'rain', 'thunderstorm', 'snow'];

test('the sun shows by day and the moon by night; rain and snow have neither', () => {
  for (const icon of CONDITIONS) {
    const hasSky = icon !== 'rain' && icon !== 'snow';
    const day = partsFor(icon, false).map(p => p.kind);
    const night = partsFor(icon, true).map(p => p.kind);
    expect(day.includes('sun')).toBe(hasSky);
    expect(day.includes('moon')).toBe(false);
    expect(night.includes('moon')).toBe(hasSky);
    expect(night.includes('sun')).toBe(false);
  }
  // A clear sky has no rain in it.
  expect(partsFor('clear', false).map(p => p.kind)).toEqual(['sun']);
  expect(partsFor('cloudy', false).map(p => p.kind)).toEqual(['sun', 'cloud']);
});

test('only the clear night has "z Z Z"; behind clouds there is no room for them', () => {
  for (const icon of CONDITIONS) {
    expect(partsFor(icon, true).some(p => p.kind === 'zzz')).toBe(icon === 'clear');
    expect(partsFor(icon, false).some(p => p.kind === 'zzz')).toBe(false);
  }
});

test('every weather picture draws', async () => {
  for (const icon of [...CONDITIONS, undefined]) {
    for (const night of [false, true]) {
      let tree!: ReactTestRenderer.ReactTestRenderer;
      await ReactTestRenderer.act(() => {
        tree = ReactTestRenderer.create(<WeatherIcon icon={icon} night={night} size={100} />);
      });
      expect(tree.toJSON()).toBeTruthy();
      tree.unmount();
    }
  }
});
