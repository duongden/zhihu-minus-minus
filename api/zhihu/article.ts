import apiClient from '../client';

export const getArticle = async (id: string | number) => {
  const res = await apiClient.get(`/articles/${id}`);
  return res.data;
};

export const createArticle = async (title: string, content: string) => {
  const timestamp = Date.now();
  const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
  const traceId = `${timestamp},${uuid}`;

  const payload = {
    action: 'article',
    data: {
      publish: { traceId },
      draft: { isPublished: false, disabled: 1 },
      article: {
        title,
        content: `<p>${content}</p>`,
      },
    },
  };

  const res = await apiClient.post('/content/publish', payload);
  return res.data;
};
