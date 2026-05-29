import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // env.ts 在 import 时即校验这些变量，测试前注入占位值
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test_jwt_secret_value',
      AI_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef',
    },
  },
});
