import { parseEnv } from '@clone/shared';
import { z } from 'zod';

const configSchema = z.object({
  SCRAPER_PORT: z.coerce.number().default(8801),
  SCRAPER_HOST: z.string().default('0.0.0.0'),
  SCRAPER_DEFAULT_TIMEOUT_MS: z.coerce.number().default(20000),
  SCRAPER_USER_AGENT: z.string().default('BrightData-Clone-Scraper/0.1'),
  SCRAPER_ENABLE_CORS: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true')
});

const env = parseEnv(configSchema);

export const config = {
  port: env.SCRAPER_PORT,
  host: env.SCRAPER_HOST,
  requestTimeoutMs: env.SCRAPER_DEFAULT_TIMEOUT_MS,
  userAgent: env.SCRAPER_USER_AGENT,
  enableCors: env.SCRAPER_ENABLE_CORS
};
