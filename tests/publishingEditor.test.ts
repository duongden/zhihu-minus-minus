import { act, fireEvent, render } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { createElement } from 'react';
import { Alert } from 'react-native';
import { type UploadedImage, uploadImage } from '../api/zhihu/image';
import { PublishingEditor } from '../features/publishing/PublishingEditor';

jest.mock('../api/zhihu/image', () => ({ uploadImage: jest.fn() }));
jest.mock('../store/useAuthStore', () => ({ getAuthSessionVersion: () => 0 }));
jest.mock('../storage/publishingDraftRepository', () => ({
  publishingDraftRepository: {
    retainAsset: jest.fn(async (_scope, id, asset) => ({
      ...asset,
      uri: `file:///synthetic-draft/${id}.image`,
    })),
    releaseAsset: jest.fn(async () => {}),
  },
}));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../features/rich-content', () => ({ ZhihuContent: () => null }));
jest.mock('../components/useColorScheme', () => ({
  useColorScheme: () => 'light',
}));
jest.mock('../components/Themed', () => {
  const native = jest.requireActual('react-native');
  return { Text: native.Text, View: native.View };
});
jest.mock('../components/BouncyButton', () => ({
  BouncyButton: jest.requireActual('react-native').Pressable,
}));

test('keeps failed images retryable while inserting other successful uploads', async () => {
  jest
    .mocked(ImagePicker.requestMediaLibraryPermissionsAsync)
    .mockResolvedValue({
      granted: true,
    } as ImagePicker.MediaLibraryPermissionResponse);
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
    canceled: false,
    assets: [
      { uri: 'file:///failed.jpg', width: 10, height: 10 },
      { uri: 'file:///success.jpg', width: 20, height: 20 },
    ],
  });
  const image: UploadedImage = {
    imageId: 'synthetic',
    src: 'https://pic.example/success.jpg',
    width: 20,
    height: 20,
  };
  let finishUpload: (value: UploadedImage) => void = () => {};
  jest
    .mocked(uploadImage)
    .mockRejectedValueOnce(new Error('synthetic failure'))
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishUpload = resolve;
        }),
    );
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const onBusyChange = jest.fn();
  const onChangeText = jest.fn();
  const onImagesChange = jest.fn();
  const host = await render(
    createElement(PublishingEditor, {
      contentType: 'answer',
      draftScope: { accountKey: 'id:synthetic', kind: 'answer', target: 'new' },
      placeholder: '正文',
      value: '草稿',
      onBusyChange,
      onChangeText,
      onImagesChange,
    }),
  );
  await fireEvent.press(host.getByText('图片'));
  await act(async () => {});
  expect(onBusyChange).toHaveBeenLastCalledWith(true);
  expect(onChangeText).not.toHaveBeenCalled();
  expect(alert).toHaveBeenCalledWith('图片上传失败', '操作失败，请稍后重试');
  await act(() => finishUpload(image));
  expect(onBusyChange).toHaveBeenLastCalledWith(true);
  expect(onImagesChange).toHaveBeenLastCalledWith([image]);
  expect(onChangeText).toHaveBeenLastCalledWith(
    '草稿\n\n![图片](https://pic.example/success.jpg "20x20")',
  );
  jest.mocked(uploadImage).mockResolvedValueOnce({
    ...image,
    imageId: 'retry',
    src: 'https://pic.example/retry.jpg',
  });
  await fireEvent.press(host.getByText('重试'));
  await act(async () => {});
  expect(onBusyChange).toHaveBeenLastCalledWith(false);
  alert.mockRestore();
});
