import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'logs', 'uploads'] },
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      // 现有代码在 catch / 路由处理中大量使用 any，先降级为 warn，逐步收敛
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // 脚本与种子文件允许 console 输出
    files: ['src/scripts/**', 'src/database/**'],
    rules: {
      'no-console': 'off',
    },
  }
);
