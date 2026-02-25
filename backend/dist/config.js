import { z } from 'zod';
const envSchema = z.object({
    PORT: z.coerce.number().default(4000),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().min(1),
    JWT_SECRET: z.string().min(10),
    JWT_EXPIRES_IN: z.string().default('8h'),
    UPLOAD_DIR: z.string().default('./uploads'),
    MAX_UPLOAD_MB: z.coerce.number().default(10),
    PSGC_BASE_URL: z.string().default('https://psgc.cloud/api')
});
export const env = envSchema.parse(process.env);
