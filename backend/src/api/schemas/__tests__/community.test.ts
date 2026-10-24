import {
  createCommunitySchema,
  updateCommunitySchema,
  addMemberSchema,
  updateMemberSchema,
  setAvatarSchema,
  communityIdParamsSchema,
  getCommunitiesQuerySchema,
} from '../community';

const KEY = `G${'A'.repeat(55)}`;
const UUID = '3f1a2b4c-5d6e-4f70-8192-a3b4c5d6e7f8';

const VALID_CREATE = {
  name: 'EcoDAO',
  issuerPublicKey: KEY,
  assetCode: 'ECO',
  assetIssuer: KEY,
};

describe('createCommunitySchema', () => {
  it('accepts a minimal valid payload', () => {
    expect(createCommunitySchema.safeParse(VALID_CREATE).success).toBe(true);
  });

  it('accepts an optional description', () => {
    expect(createCommunitySchema.safeParse({ ...VALID_CREATE, description: 'Eco coop' }).success).toBe(true);
  });

  it('rejects a name shorter than 2 characters', () => {
    expect(createCommunitySchema.safeParse({ ...VALID_CREATE, name: 'E' }).success).toBe(false);
  });

  it('rejects a name longer than 64 characters', () => {
    expect(createCommunitySchema.safeParse({ ...VALID_CREATE, name: 'E'.repeat(65) }).success).toBe(false);
  });

  it('rejects a description longer than 500 characters', () => {
    expect(createCommunitySchema.safeParse({ ...VALID_CREATE, description: 'd'.repeat(501) }).success).toBe(false);
  });

  it('rejects a non-alphanumeric assetCode', () => {
    expect(createCommunitySchema.safeParse({ ...VALID_CREATE, assetCode: 'EC-1' }).success).toBe(false);
  });

  it('rejects an invalid issuerPublicKey', () => {
    expect(createCommunitySchema.safeParse({ ...VALID_CREATE, issuerPublicKey: 'bad' }).success).toBe(false);
  });

  it('rejects an invalid assetIssuer', () => {
    expect(createCommunitySchema.safeParse({ ...VALID_CREATE, assetIssuer: 'bad' }).success).toBe(false);
  });
});

describe('updateCommunitySchema', () => {
  it('accepts a name-only update', () => {
    expect(updateCommunitySchema.safeParse({ name: 'New Name' }).success).toBe(true);
  });

  it('accepts clearing description to null', () => {
    expect(updateCommunitySchema.safeParse({ description: null }).success).toBe(true);
  });

  it('accepts a settings-only update', () => {
    expect(updateCommunitySchema.safeParse({ settings: { theme: 'dark' } }).success).toBe(true);
  });

  it('rejects an empty update object', () => {
    expect(updateCommunitySchema.safeParse({}).success).toBe(false);
  });

  it('rejects a name shorter than 2 characters', () => {
    expect(updateCommunitySchema.safeParse({ name: 'X' }).success).toBe(false);
  });
});

describe('addMemberSchema', () => {
  it('accepts an address with no role', () => {
    expect(addMemberSchema.safeParse({ stellarAddress: KEY }).success).toBe(true);
  });

  it.each(['admin', 'treasurer', 'member', 'observer'])('accepts the %s role', (role) => {
    expect(addMemberSchema.safeParse({ stellarAddress: KEY, role }).success).toBe(true);
  });

  it('rejects an invalid address', () => {
    expect(addMemberSchema.safeParse({ stellarAddress: 'bad' }).success).toBe(false);
  });

  it('rejects an unknown role', () => {
    expect(addMemberSchema.safeParse({ stellarAddress: KEY, role: 'owner' }).success).toBe(false);
  });
});

describe('updateMemberSchema', () => {
  it.each(['admin', 'treasurer', 'member', 'observer'])('accepts the %s role', (role) => {
    expect(updateMemberSchema.safeParse({ role }).success).toBe(true);
  });

  it('rejects a role outside the enum', () => {
    expect(updateMemberSchema.safeParse({ role: 'superuser' }).success).toBe(false);
  });

  it('requires the role field', () => {
    expect(updateMemberSchema.safeParse({}).success).toBe(false);
  });
});

describe('setAvatarSchema', () => {
  it('accepts a valid URL', () => {
    expect(setAvatarSchema.safeParse({ avatarUrl: 'https://cdn.example.com/avatar.png' }).success).toBe(true);
  });

  it('rejects a non-URL string', () => {
    expect(setAvatarSchema.safeParse({ avatarUrl: 'not-a-url' }).success).toBe(false);
  });

  it('rejects a URL longer than 2048 characters', () => {
    const url = 'https://cdn.example.com/' + 'a'.repeat(2030);
    expect(setAvatarSchema.safeParse({ avatarUrl: url }).success).toBe(false);
  });
});

describe('communityIdParamsSchema', () => {
  it('accepts a valid UUID', () => {
    expect(communityIdParamsSchema.safeParse({ id: UUID }).success).toBe(true);
  });

  it('rejects a non-UUID string', () => {
    expect(communityIdParamsSchema.safeParse({ id: 'not-a-uuid' }).success).toBe(false);
  });
});

describe('getCommunitiesQuerySchema', () => {
  it('applies defaults for an empty query', () => {
    const result = getCommunitiesQuerySchema.parse({});
    expect(result).toMatchObject({ page: 1, limit: 20, search: '', sortBy: 'created_at', order: 'DESC' });
  });

  it('coerces numeric strings from URL params', () => {
    const result = getCommunitiesQuerySchema.parse({ page: '2', limit: '50' });
    expect(result.page).toBe(2);
    expect(result.limit).toBe(50);
  });

  it('rejects a page below 1', () => {
    expect(getCommunitiesQuerySchema.safeParse({ page: 0 }).success).toBe(false);
  });

  it('rejects a limit above 100', () => {
    expect(getCommunitiesQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
  });

  it('normalises order to uppercase', () => {
    const result = getCommunitiesQuerySchema.parse({ order: 'asc' });
    expect(result.order).toBe('ASC');
  });

  it('rejects an unknown sortBy', () => {
    expect(getCommunitiesQuerySchema.safeParse({ sortBy: 'password' }).success).toBe(false);
  });

  it('accepts an optional offset', () => {
    expect(getCommunitiesQuerySchema.safeParse({ offset: '10' }).success).toBe(true);
  });
});
