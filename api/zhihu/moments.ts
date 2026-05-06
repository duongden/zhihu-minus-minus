import apiClient from '../client';

// ==========================================
// 1. 类型定义
// ==========================================

export interface ZhihuActor {
  id: string;
  url_token: string;
  name: string;
  avatar_url: string;
}

export interface RecentMomentItem {
  actor: ZhihuActor;
  unread_count: number;
}

export interface ZhihuPaging {
  is_end: boolean;
  is_start: boolean;
  next: string;
  previous: string;
  totals?: number;
}

export interface RecentMomentsResponse {
  data: RecentMomentItem[];
  paging: ZhihuPaging;
}

// ==========================================
// 2. 请求函数
// ==========================================

/**
 * 获取最近有更新的关注用户列表及未读数量
 *
 * @returns 包含有新动态的用户列表和分页信息的 Promise
 */
export const fetchRecentMoments = async (): Promise<RecentMomentsResponse> => {
  const url = 'https://api.zhihu.com/moments/recent?type=raw';
  const response = await apiClient.get<RecentMomentsResponse>(url);
  return response.data;
};
