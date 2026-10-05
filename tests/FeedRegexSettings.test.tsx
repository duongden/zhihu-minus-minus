import { fireEvent, render } from '@testing-library/react-native';
import { FeedRegexSettings } from '../components/FeedRegexSettings';

jest.mock(
  '@expo/vector-icons/Ionicons',
  () => jest.requireActual('react-native').View,
);
jest.mock('../components/BouncyButton', () => ({
  BouncyButton: jest.requireActual('react-native').Pressable,
}));
jest.mock('../components/useColorScheme', () => ({
  useColorScheme: () => 'light',
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

test('rejects invalid lines without changing saved rules or discarding the draft', async () => {
  const onChange = jest.fn();
  const host = await render(
    <FeedRegexSettings
      patterns={['广告']}
      onChange={onChange}
      colorScheme="light"
    />,
  );
  const draft = '有用\n[\n\n(?';
  await fireEvent.changeText(host.getByLabelText('自定义正则屏蔽规则'), draft);
  expect(
    host.getByText('第 2、4 行：正则表达式语法无效，请检查后再保存。'),
  ).toBeOnTheScreen();
  await fireEvent.press(host.getByRole('button', { name: '保存正则屏蔽规则' }));
  expect(onChange).not.toHaveBeenCalled();
  expect(host.getByLabelText('自定义正则屏蔽规则').props.value).toBe(draft);
  expect(host.getByText('已保存 1 条规则')).toBeOnTheScreen();
});

test('saves valid lines explicitly, trimming blanks and removing duplicates', async () => {
  const onChange = jest.fn();
  const host = await render(
    <FeedRegexSettings patterns={[]} onChange={onChange} colorScheme="light" />,
  );
  await fireEvent.changeText(
    host.getByLabelText('自定义正则屏蔽规则'),
    '  ^.{0,50}$  \n\n广告\n广告\n',
  );
  expect(onChange).not.toHaveBeenCalled();
  expect(host.getByText('2 条规则语法有效，保存后生效')).toBeOnTheScreen();
  await fireEvent.press(host.getByRole('button', { name: '保存正则屏蔽规则' }));
  expect(onChange).toHaveBeenCalledWith(['^.{0,50}$', '广告']);
  expect(host.getByLabelText('自定义正则屏蔽规则').props.value).toBe(
    '^.{0,50}$\n广告',
  );
});

test('clears saved patterns when the user saves an empty editor', async () => {
  const onChange = jest.fn();
  const host = await render(
    <FeedRegexSettings
      patterns={['广告']}
      onChange={onChange}
      colorScheme="dark"
    />,
  );
  await fireEvent.changeText(
    host.getByLabelText('自定义正则屏蔽规则'),
    ' \n\n ',
  );
  await fireEvent.press(host.getByRole('button', { name: '保存正则屏蔽规则' }));
  expect(onChange).toHaveBeenCalledWith([]);
  expect(host.getByLabelText('自定义正则屏蔽规则').props.value).toBe('');
  await host.rerender(
    <FeedRegexSettings patterns={[]} onChange={onChange} colorScheme="dark" />,
  );
  expect(host.getByText('尚未设置规则，当前未启用')).toBeOnTheScreen();
});

test('reflects changed saved preferences without committing the previous draft', async () => {
  const onChange = jest.fn();
  const host = await render(
    <FeedRegexSettings
      patterns={['旧规则']}
      onChange={onChange}
      colorScheme="light"
    />,
  );
  await fireEvent.changeText(host.getByLabelText('自定义正则屏蔽规则'), '[');
  await host.rerender(
    <FeedRegexSettings
      patterns={['新的', '^.{0,50}$']}
      onChange={onChange}
      colorScheme="light"
    />,
  );
  expect(host.getByLabelText('自定义正则屏蔽规则').props.value).toBe(
    '新的\n^.{0,50}$',
  );
  expect(host.getByText('已保存 2 条规则')).toBeOnTheScreen();
  expect(host.queryByRole('alert')).toBeNull();
  expect(onChange).not.toHaveBeenCalled();
});
