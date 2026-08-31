export interface MemberIdentity {
  id?: string | number | null;
  url_token?: string | null;
}

export type UserFeedType =
  | 'answers'
  | 'articles'
  | 'questions'
  | 'pins'
  | 'videos';

function normalizeIdentity(value: string | number | null | undefined) {
  return value === null || value === undefined ? null : String(value);
}

/** Match a route token against every stable identifier returned for a member. */
export function isSameMember(
  routeId: string | number | null | undefined,
  ...members: Array<MemberIdentity | null | undefined>
) {
  const normalizedRouteId = normalizeIdentity(routeId);
  if (!normalizedRouteId) return false;

  return members.some((member) => {
    if (!member) return false;
    return [member.id, member.url_token].some(
      (candidate) => normalizeIdentity(candidate) === normalizedRouteId,
    );
  });
}

/**
 * Decide whether a profile belongs to the signed-in member.
 *
 * The route will naturally match the loaded profile, so the profile itself must
 * never be used as independent proof that it is the current member. It is only
 * useful for bridging an id/url_token mismatch with the current-member payload.
 */
export function isOwnMemberProfile(
  routeId: string | number | null | undefined,
  currentMember: MemberIdentity | null | undefined,
  profileMember: MemberIdentity | null | undefined,
) {
  if (!currentMember) return false;
  if (isSameMember(routeId, currentMember)) return true;
  if (!profileMember) return false;

  const currentIdentifiers = [currentMember.id, currentMember.url_token]
    .map(normalizeIdentity)
    .filter((value): value is string => Boolean(value));
  const profileIdentifiers = new Set(
    [profileMember.id, profileMember.url_token]
      .map(normalizeIdentity)
      .filter((value): value is string => Boolean(value)),
  );

  return currentIdentifiers.some((identifier) =>
    profileIdentifiers.has(identifier),
  );
}

export function normalizeUserFeedType(
  type: string | null | undefined,
): UserFeedType | null {
  switch (type) {
    case 'answer':
    case 'answers':
      return 'answers';
    case 'article':
    case 'articles':
      return 'articles';
    case 'question':
    case 'questions':
      return 'questions';
    case 'pin':
    case 'pins':
      return 'pins';
    case 'video':
    case 'videos':
    case 'zvideo':
    case 'zvideos':
      return 'videos';
    default:
      return null;
  }
}

export function getNextPageOffset(nextUrl: string | null | undefined) {
  if (!nextUrl) return undefined;
  try {
    const url = new URL(nextUrl, 'https://www.zhihu.com');
    const offset = url.searchParams.get('offset');
    if (offset === null) return undefined;
    const parsedOffset = Number.parseInt(offset, 10);
    return Number.isFinite(parsedOffset) ? parsedOffset : undefined;
  } catch {
    return undefined;
  }
}
