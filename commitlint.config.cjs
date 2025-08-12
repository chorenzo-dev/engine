module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'docs', 'chore', 'ci', 'refactor'],
    ],
  },
  ignores: [
    (message) => message.includes('[skip ci]'),
    (message) => message.startsWith('chore(release):'),
  ],
};
