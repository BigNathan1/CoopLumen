import { validateFrontendEnv } from '../env';

const validEnvironment = {
  NEXT_PUBLIC_API_URL: 'http://localhost:4000',
  NEXT_PUBLIC_STELLAR_NETWORK: 'TESTNET',
};

describe('validateFrontendEnv', () => {
  it('accepts the required public frontend configuration', () => {
    expect(() => validateFrontendEnv(validEnvironment)).not.toThrow();
  });

  it.each(['NEXT_PUBLIC_API_URL', 'NEXT_PUBLIC_STELLAR_NETWORK'] as const)(
    'throws when %s is missing',
    (key) => {
      const environment = { ...validEnvironment };
      delete environment[key];

      expect(() => validateFrontendEnv(environment)).toThrow(
        `Missing required frontend environment variables: ${key}`
      );
    }
  );

  it('treats whitespace-only values as missing', () => {
    expect(() => validateFrontendEnv({ ...validEnvironment, NEXT_PUBLIC_API_URL: '   ' })).toThrow(
      'NEXT_PUBLIC_API_URL'
    );
  });
});
