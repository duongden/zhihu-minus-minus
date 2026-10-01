import axios from 'axios';

const dailyClient = axios.create({
  timeout: 10000,
  headers: {
    'User-Agent': 'ZhihuDaily/2.9.0 (Android; 10; Scale/2.0)',
    Referer: 'https://daily.zhihu.com/',
  },
});

dailyClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    const status = axios.isAxiosError(error)
      ? error.response?.status
      : undefined;
    console.error('日报 API 请求失败', status ?? 'unknown');
    return Promise.reject(error);
  },
);

export const getDailyLatest = async () => {
  const res = await dailyClient.get(
    'https://daily.zhihu.com/api/4/news/latest',
  );
  return res.data;
};

export const getDailyBefore = async (date: string) => {
  const res = await dailyClient.get(
    `https://daily.zhihu.com/api/4/news/before/${date}`,
  );
  return res.data;
};

export const getDailyDetail = async (id: string | number) => {
  const res = await dailyClient.get(`https://daily.zhihu.com/api/4/news/${id}`);
  return res.data;
};
