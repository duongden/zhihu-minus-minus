export const PROFILE_TABS = [
  { key: 'activities', label: '动态', countKey: undefined },
  { key: 'creations', label: '创作', countKey: undefined },
  { key: 'answers', label: '回答', countKey: 'answer_count' },
  { key: 'articles', label: '文章', countKey: 'articles_count' },
  { key: 'questions', label: '提问', countKey: 'question_count' },
  { key: 'pins', label: '想法', countKey: 'pins_count' },
] as const;

export type ProfileTabKey = (typeof PROFILE_TABS)[number]['key'];

export function getInitialProfileTab(tab: string | undefined): ProfileTabKey {
  return PROFILE_TABS.find((item) => item.key === tab)?.key ?? 'creations';
}
