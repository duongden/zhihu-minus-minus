import { Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { Text, useThemeColor, View } from '@/components/Themed';

export default function VideoDetailScreen() {
  const { id, title } = useLocalSearchParams<{
    id: string;
    title?: string;
  }>();
  const primaryColor = useThemeColor({}, 'primary');

  if (!id) {
    return (
      <View className="flex-1 items-center justify-center">
        <Stack.Screen options={{ title: '视频' }} />
        <Text type="secondary">无效的视频地址</Text>
      </View>
    );
  }

  return (
    <View className="flex-1">
      <Stack.Screen options={{ title: title || '视频' }} />
      <WebView
        source={{
          uri: `https://www.zhihu.com/zvideo/${encodeURIComponent(id)}`,
        }}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        startInLoadingState
        renderLoading={() => (
          <View className="absolute inset-0 items-center justify-center">
            <ActivityIndicator color={primaryColor} />
          </View>
        )}
      />
    </View>
  );
}
