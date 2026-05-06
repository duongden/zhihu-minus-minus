import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from '@react-navigation/native';
import * as Sentry from '@sentry/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, Redirect } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { parseZhihuUrl } from '@/utils/url';
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
import { Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// 保持启动页显示，直到资源加载完成
SplashScreen.preventAutoHideAsync();

if (!__DEV__) {
  Sentry.init({
    dsn: Constants.expoConfig?.extra?.sentryDsn,
    debug: false,
    enableAutoSessionTracking: true,
  });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: any) => {
        // 如果是人机验证错误（40352），停止自动重试，等待弹窗加载
        if (error?.response?.data?.error?.code === 40352) {
          return false;
        }
        // 其他错误默认重试 2 次 (共三次尝试)
        return failureCount < 2;
      },
      // 这里的配置确保不会因为网络瞬间闪烁在验证期间反复弹窗
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
  },
});

function RootLayout() {
  const colorScheme = useColorScheme();
  const isDark = useThemeStore((state) => state.isDark);
  const theme = isDark ? DarkTheme : DefaultTheme;

  // Sync NativeWind dark mode with zustand store
  useSyncThemeWithNativeWind();

  const router = useRouter();

  // Handle deep links manually
  useEffect(() => {
    const handleUrl = (url: string | null) => {
      if (!url) return;
      // Skip internal Expo URLs
      if (url.includes('expo-development-client') || url.includes('expo-auth-session')) {
        return;
      }
      try {
        let path = '';
        const finalPath = parseZhihuUrl(url);

        if (!finalPath) return;

        if (finalPath === '/') {
          console.log('[Deep Link] Homepage detected, replacing with /');
          router.replace('/');
          return;
        }

        console.log('[Deep Link] Navigating to:', finalPath);
        setTimeout(() => {
          try {
            router.push(finalPath as any);
          } catch (e) {
            console.error('[Deep Link] Navigation failed for:', finalPath, e);
          }
        }, 500);
      } catch (err) {
        // Silently ignore errors in production
      }
    };

    const subscription = Linking.addEventListener('url', (event) => {
      handleUrl(event.url);
    });

    Linking.getInitialURL().then((url) => {
      handleUrl(url);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // 这里简单处理：如果以后需要加载字体，可以写在这里
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
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
                name="question/[id]/index"
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
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
export default __DEV__ ? RootLayout : Sentry.wrap(RootLayout);
