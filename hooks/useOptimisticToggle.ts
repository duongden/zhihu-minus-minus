import {
  type QueryKey,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { showToast } from '@/utils/toast';

export interface UseOptimisticToggleOptions<TData = unknown> {
  queryKey?: QueryKey;
  mutationFn: () => Promise<unknown>;
  onUpdateCache?: (oldData: TData) => TData;
  successMessage?: ((isActive: boolean) => string) | string;
  errorMessage?: string;
  isActive?: boolean;
  onSuccessCallback?: () => void;
  invalidateQueries?: QueryKey[];
}

export function useOptimisticToggle<TData = unknown>({
  queryKey,
  mutationFn,
  onUpdateCache,
  successMessage,
  errorMessage = '操作失败，请稍后重试',
  isActive = false,
  onSuccessCallback,
  invalidateQueries,
}: UseOptimisticToggleOptions<TData>) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onMutate: async () => {
      const wasActive = isActive;
      if (!queryKey || !onUpdateCache) {
        return { previous: undefined, wasActive };
      }

      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<TData>(queryKey);

      if (previous !== undefined) {
        queryClient.setQueryData<TData>(queryKey, onUpdateCache(previous));
      }

      return { previous, wasActive };
    },
    onError: (_err, _variables, context) => {
      if (context?.previous !== undefined && queryKey) {
        queryClient.setQueryData(queryKey, context.previous);
      }
      showToast(errorMessage);
    },
    onSuccess: (_data, _variables, context) => {
      if (successMessage) {
        const msg =
          typeof successMessage === 'function'
            ? successMessage(context.wasActive)
            : successMessage;
        showToast(msg);
      }
      if (onSuccessCallback) onSuccessCallback();
    },
    onSettled: () => {
      if (queryKey) {
        queryClient.invalidateQueries({ queryKey });
      }
      if (invalidateQueries) {
        invalidateQueries.forEach((key) => {
          queryClient.invalidateQueries({ queryKey: key });
        });
      }
    },
  });
}
