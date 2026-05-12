import apiClient from '../client';
import { useAuthStore } from '@/store/useAuthStore';

export const FEED_URLS = {
  following: 'https://www.zhihu.com/api/v3/moments?limit=10',
  recommend: 'https://www.zhihu.com/api/v3/feed/topstory/recommend?limit=10',
  hot: 'https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=50',
};

export const getFeed = async (url: string) => {
  let finalUrl = url;
  const { cookies } = useAuthStore.getState();

  // 如果未登录且请求的是推荐页初始接口，则切换为游客接口
  if (!cookies && url.includes('feed/topstory/recommend')) {
    finalUrl = 'https://www.zhihu.com/api/v3/explore/guest/feeds?limit=15&ws_qiangzhisafe=0';
  }

  const res = await apiClient.get(finalUrl);
  return res.data;
};
