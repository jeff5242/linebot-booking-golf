module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  transformIgnorePatterns: [
    '/node_modules/(?!(uuid|@supabase)/)'
  ],
  transform: {
    '^.+\\.js$': ['babel-jest', {
      plugins: ['@babel/plugin-transform-modules-commonjs']
    }]
  }
};
