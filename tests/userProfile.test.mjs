import assert from 'node:assert/strict';
import test from 'node:test';
import { parseZhihuUrl } from '../utils/url.ts';
import {
  getNextPageOffset,
  isOwnMemberProfile,
  isSameMember,
  normalizeUserFeedType,
} from '../utils/userProfile.ts';

test('matches a member by immutable id or url token', () => {
  const member = { id: 'hash-id', url_token: 'friendly-token' };

  assert.equal(isSameMember('hash-id', member), true);
  assert.equal(isSameMember('friendly-token', member), true);
  assert.equal(isSameMember('another-user', member), false);
});

test('does not treat every loaded profile as the signed-in member', () => {
  const me = { id: 'my-hash-id', url_token: 'my-token' };
  const anotherUser = {
    id: 'another-hash-id',
    url_token: 'another-token',
  };

  assert.equal(isOwnMemberProfile('another-token', me, anotherUser), false);
  assert.equal(isOwnMemberProfile('my-token', me, me), true);
  assert.equal(
    isOwnMemberProfile(
      'my-token',
      { id: 'my-hash-id' },
      { id: 'my-hash-id', url_token: 'my-token' },
    ),
    true,
  );
});

test('normalizes profile content types without treating videos as answers', () => {
  assert.equal(normalizeUserFeedType('answer'), 'answers');
  assert.equal(normalizeUserFeedType('articles'), 'articles');
  assert.equal(normalizeUserFeedType('zvideo'), 'videos');
  assert.equal(normalizeUserFeedType('videos'), 'videos');
  assert.equal(normalizeUserFeedType('unsupported'), null);
});

test('reads pagination offsets through URLSearchParams', () => {
  assert.equal(
    getNextPageOffset(
      'https://www.zhihu.com/api/v4/members/demo/answers?limit=20&offset=40',
    ),
    40,
  );
  assert.equal(
    getNextPageOffset('/api/v4/items?offset=not-a-number'),
    undefined,
  );
  assert.equal(getNextPageOffset(undefined), undefined);
});

test('normalizes public Zhihu video links to the internal video route', () => {
  assert.equal(
    parseZhihuUrl('https://www.zhihu.com/zvideo/123456789'),
    '/video/123456789',
  );
  assert.equal(
    parseZhihuUrl('https://oia.zhihu.com/zvideos/987654321'),
    '/video/987654321',
  );
});
