# Contributing to AgentCloak

Thank you for your interest in contributing to AgentCloak. This document outlines how to get involved, from reporting bugs to submitting pull requests.

## Reporting Bugs and Requesting Features

Use [GitHub Issues](https://github.com/ryanfren/AgentCloak/issues) to:

- **Report bugs** -- Include steps to reproduce, expected behavior, actual behavior, and any relevant logs or screenshots.
- **Request features** -- Describe the use case, the problem it solves, and any proposed implementation details.

Please search existing issues before opening a new one to avoid duplicates.

## Development Setup

1. **Clone the repository**

   ```bash
   git clone https://github.com/ryanfren/AgentCloak.git
   cd AgentCloak
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   ```

3. **Start the development server**

   ```bash
   pnpm dev
   ```

Make sure you have [Node.js](https://nodejs.org/) and [pnpm](https://pnpm.io/) installed before proceeding.

## Code Style

- The project is written in **TypeScript**.
- Styling uses **Tailwind CSS**.
- Follow the existing patterns and conventions found in the codebase.
- Keep functions focused and files reasonably sized.
- Write clear, descriptive variable and function names.

## Pull Request Process

1. **Fork** the repository to your own GitHub account.
2. **Create a branch** from `main` for your changes:

   ```bash
   git checkout -b your-feature-branch
   ```

3. **Make your changes**, committing with clear and descriptive messages.
4. **Push** your branch to your fork:

   ```bash
   git push origin your-feature-branch
   ```

5. **Open a pull request** against the `main` branch of the upstream repository.
6. In your PR description, explain what the change does and why it is needed. Reference any related issues.
7. Be responsive to review feedback. Maintainers may request changes before merging.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior through the channels described in the Code of Conduct.
