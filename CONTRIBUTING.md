# Contributing to dev-loop

## Getting Started

dev-loop is a TypeScript monorepo built with npm workspaces and Turborepo. To get started contributing, follow these steps:

### Prerequisites

- Node.js 20+ (LTS recommended)
- npm 10+
- Git

### Installation

```bash
# Clone the repository
git clone git@github.com:hasanislamoglu5361/dev-loop.git
cd dev-loop

# Install dependencies
npm install
```

### Development Setup

After installation, run the full quality pipeline:

```bash
# Run TypeScript type checking across all packages
npm run typecheck

# Build all packages
npm run build

# Run linting
npm run lint

# Run all tests
npm test
```

## Project Structure

```
packages/
  core/     # Domain types, config loader, database, event bus, analytics
  cli/      # CLI entrypoint and command surface
  ui/       # React UI with Fastify server
```

## Making Changes

1. **Create a feature branch** from `main` for your work:
   ```bash
   git checkout -b feat/your-feature-name
   ```

2. **Write tests before implementation** (TDD). Place tests under the appropriate package's `src/__tests__/` directory.

3. **Run targeted tests** to verify your changes don't break existing behavior:
   ```bash
   npx vitest run packages/core/src/__tests__/your-test-file.test.ts
   ```

4. **Run full quality checks** before committing:
   ```bash
   npm run typecheck
   npm test
   ```

5. **Commit your changes** with a descriptive message following conventional commits:
   ```bash
   git add .
   git commit -m "feat(core): add analytics export utility"
   ```

6. **Push and create a pull request**:
   ```bash
   git push origin feat/your-feature-name
   ```

## Code Style Guidelines

- Follow TypeScript strict mode for all new code
- Use `??` instead of `||` for nullish defaults
- Avoid `as any` unless explicitly documented with reasoning
- Keep modules small and focused (no god modules)
- Document public APIs with JSDoc comments
- Redact secrets in logs, errors, and UI responses

## Reporting Issues

Use GitHub Issues to report bugs or request features. Include:

- Steps to reproduce
- Expected vs actual behavior
- Relevant log output or error messages
- Environment details (OS, Node version)

## Pull Request Process

1. Ensure all CI checks pass
2. Add tests for new functionality
3. Update documentation if API changes are made
4. Request review from maintainers
5. Address review feedback and push updates
6. Squash commits before merge when appropriate

Thank you for contributing to dev-loop!