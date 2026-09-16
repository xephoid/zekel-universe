// Server configuration from environment variables.
// All defaults are safe for local development only.

export interface ServerConfig {
  port: number;
  engineUrl: string;
  engineToken: string;
  secretKey: string;
  databaseUrl: string;
  emailFrom: string;
}

// A 32-byte key used only when SECRET_KEY is unset. Never use in production;
// rotating it invalidates every stored host token.
const DEV_SECRET_KEY = '0'.repeat(64);

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    port: Number(env.PORT ?? 8788),
    engineUrl: env.ENGINE_URL ?? 'http://localhost:8789/mcp',
    engineToken: env.ENGINE_TOKEN ?? '',
    secretKey: env.SECRET_KEY ?? DEV_SECRET_KEY,
    databaseUrl: env.DATABASE_URL ?? 'sqlite://dev.db',
    emailFrom: env.EMAIL_FROM ?? 'noreply@example.com',
  };
}
