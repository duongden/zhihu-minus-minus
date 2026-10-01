import { act, fireEvent, render } from '@testing-library/react-native';
import { createElement } from 'react';
import { Alert } from 'react-native';
import { createPublishingDocument } from '../features/publishing/document';
import { PublishingDocumentEditor } from '../features/publishing/PublishingDocumentEditor';

jest.mock('../features/rich-content', () => ({ ZhihuContent: () => null }));
jest.mock('../components/BouncyButton', () => ({
  BouncyButton: jest.requireActual('react-native').Pressable,
}));
jest.mock('../components/useColorScheme', () => ({
  useColorScheme: () => 'light',
}));
jest.mock('../components/Themed', () => ({
  Text: jest.requireActual('react-native').Text,
  View: jest.requireActual('react-native').View,
}));

test('protected block deletion needs an explicit confirmation', async () => {
  const document = createPublishingDocument(
    '<p>普通段落</p><table><tr><td>保留表格</td></tr></table>',
  );
  const onChange = jest.fn();
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const host = await render(
    createElement(PublishingDocumentEditor, { document, onChange }),
  );
  expect(host.getByText('这段复杂内容将原样保留')).toBeTruthy();
  await fireEvent.press(host.getAllByText('删除此段')[1]);
  expect(onChange).not.toHaveBeenCalled();
  await act(() => {
    alert.mock.calls[0][2]
      ?.find((button) => button.text === '删除')
      ?.onPress?.();
  });
  expect(onChange).toHaveBeenCalledWith({
    ...document,
    blocks: [document.blocks[0]],
  });
  alert.mockRestore();
  await host.unmount();
});
