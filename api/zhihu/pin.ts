import client from '../client';

export const getPin = async (id: string | number) => {
  const include =
    'author,content,content_html,created,like_count,comment_count,relationship.voting';
  const res = await client.get(`/pins/${id}?include=${include}`);
  return res.data;
};

export const createPin = async (content: string) => {
  const timestamp = Date.now();
  const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
  const traceId = `${timestamp},${uuid}`;

  // Step 1: Create Draft
  const draftPayload = {
    action: 'pin',
    data: {
      publish: { traceId },
      commentsPermission: { comment_permission: 'all' },
      extra_info: { view_permission: 'all', publisher: 'pc' },
      draft: { disabled: 1 },
      hybrid: {
        html: `<p>${content}</p>`,
        textLength: content.length,
      },
    },
  };

  const draftRes = await client.post(
    'https://api.zhihu.com/content/drafts',
    draftPayload,
  );
  const draftId = draftRes.data.data.content_id;

  // Step 2: Publish Draft
  const publishPayload = {
    action: 'pin',
    data: {
      publish: { traceId },
      commentsPermission: { comment_permission: 'all' },
      extra_info: { view_permission: 'all', publisher: 'pc' },
      draft: { disabled: 1, id: draftId },
      hybrid: {
        html: `<p>${content}</p>`,
        textLength: content.length,
      },
    },
  };

  const publishRes = await client.post('/content/publish', publishPayload);
  return publishRes.data;
};
