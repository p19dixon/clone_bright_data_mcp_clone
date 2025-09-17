import { z } from 'zod';

type ZodEnvShape = Record<string, z.ZodTypeAny>;

const baseSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default(process.env.NODE_ENV === 'test' ? 'test' : 'development'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default(process.env.NODE_ENV === 'development' ? 'debug' : 'info')
});

export type BaseEnv = z.infer<typeof baseSchema>;

export function parseEnv<T extends ZodEnvShape>(shape: z.ZodObject<T>) {
  const merged = baseSchema.merge(shape);
  const parsed = merged.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment variables: ${parsed.error.errors
        .map((err) => `${err.path.join('.')}: ${err.message}`)
        .join(', ')}`,
    );
  }
  return parsed.data;
}

export const baseEnv = baseSchema.parse(process.env);
