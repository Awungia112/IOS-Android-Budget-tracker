// Skip Husky installation in CI and production environments.
// In CI, GitLab Secret Detection and SAST provide the mandatory enforcement layer.
// The prepare script runs on every pnpm install -- this guard prevents it from
// running unnecessarily in environments where git hooks serve no purpose.
if (process.env.CI === 'true' || process.env.NODE_ENV === 'production') {
  process.exit(0)
}

const husky = (await import('husky')).default
console.log(husky())
