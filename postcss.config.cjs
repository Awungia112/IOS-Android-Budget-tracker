const path = require('path');

module.exports = {
  plugins: {
    'tailwindcss/nesting': {},
    tailwindcss: {
      config: path.resolve(__dirname, 'packages/app/tailwind.config.ts'),
    },
    autoprefixer: {},
  },
}
