import axios from 'axios';

const dailyClient = axios.create({
  timeout: 10000,
  headers: {
    'User-Agent': 'ZhihuDaily/2.9.0 (Android; 10; Scale/2.0)',
    'Referer': 'https://daily.zhihu.com/',
  }
});

dailyClient.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('日报 API 错误:', error.response?.status, error.message);
    return Promise.reject(error);
  }
);

export const getDailyLatest = async () => {
  const res = await dailyClient.get('https://daily.zhihu.com/api/4/news/latest');
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
