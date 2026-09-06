export const REQUIRED_FRONTEND_ENV_VARS = [
  'NEXT_PUBLIC_API_URL',
  'NEXT_PUBLIC_STELLAR_NETWORK',
] as const;

export type FrontendEnvironment = Readonly<Record<string, string | undefined>>;

export function validateFrontendEnv(env: FrontendEnvironment = process.env): void {
  const missing = REQUIRED_FRONTEND_ENV_VARS.filter((key) => !env[key]?.trim());

  if (missing.length > 0) {
    throw new Error(`Missing required frontend environment variables: ${missing.join(', ')}`);
  }
}
