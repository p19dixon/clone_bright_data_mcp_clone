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
  const baseResult = baseSchema.safeParse(process.env);
  if (!baseResult.success) {
    throw new Error(
      `Invalid environment variables: ${baseResult.error.errors
        .map((err) => `${err.path.join('.')}: ${err.message}`)
        .join(', ')}`,
    );
  }

  const extraResult = shape.safeParse(process.env);
  if (!extraResult.success) {
    throw new Error(
      `Invalid environment variables: ${extraResult.error.errors
        .map((err) => `${err.path.join('.')}: ${err.message}`)
        .join(', ')}`,
    );
  }

  return { ...baseResult.data, ...extraResult.data } as BaseEnv & z.infer<typeof shape>;
}

export const baseEnv = baseSchema.parse(process.env);
