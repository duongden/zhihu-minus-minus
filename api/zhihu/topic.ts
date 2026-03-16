import apiClient from '../client';

export const TOPIC_INCLUDE =
  'introduction,questions_count,best_answers_count,followers_count,is_following,header_card';

export const getTopic = async (id: string | number) => {
  const res = await apiClient.get(`/topics/${id}?include=${TOPIC_INCLUDE}`);
  return res.data;
};

export const getTopicFeed = async (
  id: string | number,
  type: string = 'hot',
  offset: number = 0,
) => {
  const typeMapping: Record<string, string> = {
    'hot': 'hot',
    'top-answers': 'essence',
    'unanswered': 'top_question',
  };
  const feedType = typeMapping[type] || type;
  const include =
    'data[*].target.content,voteup_count,comment_count,author.name,author.avatar_url,author.headline,author.is_following,relationship.voting,relationship.is_author,created_time,segment_infos';
  const res = await apiClient.get(
    `/topics/${id}/feeds/${feedType}?include=${include}&limit=20&offset=${offset}`,
  );
  return res.data;
};

export const followTopic = async (id: string | number) => {
  const res = await apiClient.post(`/topics/${id}/followers`);
  return res.data;
};

export const unfollowTopic = async (id: string | number) => {
  const res = await apiClient.delete(`/topics/${id}/followers`);
  return res.data;
};

export const getTopicParents = async (id: string | number) => {
  const res = await apiClient.get(`/topics/${id}/parent`);
  return res.data;
};

export const getTopicChildren = async (id: string | number) => {
  const res = await apiClient.get(`/topics/${id}/children`);
  return res.data;
};
