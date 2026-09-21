import { classifyNetworkError } from './networkFailure';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function getZhihuErrorMessage(error: unknown): string {
  if (isRecord(error) && isRecord(error.response)) {
    const status = error.response.status;
    const data = error.response.data;
    if (isRecord(data) && isRecord(data.error)) {
      const message = data.error.message;
      if (typeof message === 'string' && message) return message;
    }
    if (isRecord(data)) {
      const message = data.message;
      if (typeof message === 'string' && message) return message;
    }
    if (typeof status === 'number') {
      if (status === 400) return '请求参数无效，请检查后重试';
      if (status === 401) return '登录状态已失效，请重新登录';
      if (status === 403) return '当前账号没有执行此操作的权限';
      if (status === 404) return '请求的内容不存在或已被删除';
      if (status === 408) return '请求超时，请稍后重试';
      if (status === 429) return '操作太频繁，请稍后重试';
      if (status >= 500) return '知乎服务暂时不可用，请稍后重试';
    }
  }

  if (isRecord(error)) {
    const code = error.code;
    if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') {
      return '请求超时，请检查网络后重试';
    }
    if (code === 'ERR_NETWORK') {
      const status = classifyNetworkError(error);
      if (status === 'offline') return '当前设备似乎已离线，请检查网络';
      if (status === 'dns-error') return '域名解析失败，请检查 DNS 或代理设置';
      if (status === 'tls-error')
        return '安全连接建立失败，请检查代理或证书设置';
      if (status === 'connection-reset') return '连接被远端中断，请稍后重试';
      if (status === 'connection-refused')
        return '服务器拒绝了连接，请稍后重试';
      if (status === 'connection-error') return '网络连接已中断，请稍后重试';
      return '网络连接失败，请检查网络后重试';
    }

    const message = error.message;
    if (typeof message === 'string' && message) return message;
  }

  if (error instanceof Error && error.message) return error.message;

  return '未知错误';
}
