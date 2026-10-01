import { act, render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { useRuntimeThemeColors } from '../components/Themed';
import Colors from '../constants/Colors';
import { resolveThemeColors } from '../constants/theme';
import { useSettingsStore } from '../store/useSettingsStore';
import { contrastRatio } from '../utils/colorContrast';
import { themeVariables } from '../utils/themeVariables';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: jest.requireActual('react-native').View,
}));
jest.mock('../store/useSettingsStore', () => ({
  useSettingsStore: jest.requireActual('zustand').create(() => ({
    primaryColor: null,
    readingBackground: 'default',
    textContrast: 'standard',
    surfaceStyle: 'layered',
    fontSizeScale: 1,
    lineHeightScale: 1.5,
  })),
}));
jest.mock('../components/useColorScheme', () => ({
  useColorScheme: () => 'light',
}));

function PaletteProbe() {
  const palette = useRuntimeThemeColors();
  return (
    <Text testID="palette">
      {JSON.stringify({
        palette,
        legacy: Colors.light,
        variables: themeVariables(palette),
      })}
    </Text>
  );
}

test('all reading presets keep text, links and primary-button text readable', () => {
  for (const scheme of ['light', 'dark'] as const) {
    for (const readingBackground of [
      'default',
      'soft',
      'warm',
      'dim',
    ] as const) {
      for (const textContrast of ['standard', 'high'] as const) {
        for (const surfaceStyle of ['layered', 'flat'] as const) {
          for (const primaryColor of [
            null,
            '#ffffff',
            '#000000',
            '#eeee00',
            '#0084ff',
            '#fe1199',
          ]) {
            const palette = resolveThemeColors(scheme, {
              primaryColor,
              readingBackground,
              textContrast,
              surfaceStyle,
            });
            for (const foreground of [
              palette.text,
              palette.textSecondary,
              palette.textTertiary,
              palette.link,
            ]) {
              for (const background of [
                palette.background,
                palette.backgroundSecondary,
                palette.backgroundTertiary,
              ]) {
                expect(
                  contrastRatio(foreground, background),
                ).toBeGreaterThanOrEqual(4.5);
              }
            }
            expect(
              contrastRatio(palette.onPrimary, palette.primary),
            ).toBeGreaterThanOrEqual(4.5);
            if (primaryColor) expect(palette.primary).toBe(primaryColor);
          }
        }
      }
    }
  }
});

test('preference updates rerender hooks and keep legacy and NativeWind values in sync', async () => {
  const host = await render(<PaletteProbe />);
  await act(() => {
    useSettingsStore.setState({
      primaryColor: '#ffff00',
      readingBackground: 'warm',
      surfaceStyle: 'flat',
    });
  });
  const data = JSON.parse(host.getByTestId('palette').props.children);
  expect(data.palette).toEqual(data.legacy);
  expect(data.palette.primary).toBe('#ffff00');
  expect(data.palette.onPrimary).toBe('#000000');
  expect(data.palette.background).toBe(data.palette.backgroundSecondary);
  expect(data.variables['--theme-primary']).toBe('255 255 0');
  expect(data.variables['--theme-text']).toBe(
    data.palette.text
      .slice(1)
      .match(/../g)
      .map((value: string) => Number.parseInt(value, 16))
      .join(' '),
  );
  await host.unmount();
});
