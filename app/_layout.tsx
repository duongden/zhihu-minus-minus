import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from '@react-navigation/native';
import * as Sentry from '@sentry/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import { useEffect } from 'react';
import { RootSiblingParent } from 'react-native-root-siblings';
import { UpdateChecker } from '@/components/UpdateChecker';
import { VerificationModal } from '@/components/VerificationModal';
import { useColorScheme } from '@/components/useColorScheme';
import {
  useSyncThemeWithNativeWind,
  useThemeStore,
} from '@/store/useThemeStore';
import '../global.css';

// 保持启动页显示，直到资源加载完成
SplashScreen.preventAutoHideAsync();

// 初始化 Sentry
Sentry.init({
  dsn: Constants.expoConfig?.extra?.sentryDsn,
  debug: __DEV__,
  enableAutoSessionTracking: true,
});

const queryClient = new QueryClient();

function RootLayout() {
  const colorScheme = useColorScheme();
  const isDark = useThemeStore((state) => state.isDark);
  const theme = isDark ? DarkTheme : DefaultTheme;

  // Sync NativeWind dark mode with zustand store
  useSyncThemeWithNativeWind();

  // 这里简单处理：如果以后需要加载字体，可以写在这里
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <RootSiblingParent>
        <ThemeProvider value={theme}>
          <UpdateChecker />
          <Stack
            screenOptions={{
              headerStyle: {
                backgroundColor: isDark ? '#1a1a1a' : '#ffffff',
              },
              headerTitleStyle: {
                color: isDark ? '#ffffff' : '#1a1a1a',
                fontWeight: 'bold',
              },
              headerTintColor: '#0084ff',
              headerShadowVisible: false,
            }}
          >
            {/* 底部 Tab 主框架 */}
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

            {/* 文章详情页：从右侧推入 */}
            <Stack.Screen
              name="article/[id]"
              options={{
                headerTitle: '正文',
                headerBackTitle: '返回',
              }}
            />

            {/* 登录页：建议做成从底部弹出的 Modal */}
            <Stack.Screen
              name="login/index"
              options={{
                presentation: 'modal',
                headerTitle: '登录知乎',
                headerLeft: () => null,
              }}
            />

            <Stack.Screen
              name="feedback/index"
              options={{
                headerShown: false,
                presentation: 'card',
              }}
            />

            {/* 发布相关页面：使用全屏 Modal */}
            <Stack.Screen
              name="publish/answer"
              options={{ presentation: 'fullScreenModal', headerShown: false }}
            />
            <Stack.Screen
              name="publish/article"
              options={{ presentation: 'fullScreenModal', headerShown: false }}
            />
            <Stack.Screen
              name="publish/pin"
              options={{ presentation: 'fullScreenModal', headerShown: false }}
            />
            <Stack.Screen
              name="publish/question"
              options={{ presentation: 'fullScreenModal', headerShown: false }}
            />

            {/* 问题详情页 */}
            <Stack.Screen
              name="question/[id]"
              options={{
                headerShown: false,
                animation: 'fade',
              }}
            />

            {/* 回答详情页 */}
            <Stack.Screen
              name="answer/[id]"
              options={{
                headerShown: false,
                animation: 'fade',
              }}
            />

            {/* 其他 Modal 弹窗 */}
            <Stack.Screen
              name="modal"
              options={{ presentation: 'modal', title: '提示' }}
            />
          </Stack>

          {/* 全局状态栏控制 */}
          <StatusBar style={isDark ? 'light' : 'dark'} />
          
          {/* 人机验证弹窗 */}
          <VerificationModal />
        </ThemeProvider>
      </RootSiblingParent>
    </QueryClientProvider>
  );
}
export default Sentry.wrap(RootLayout);
