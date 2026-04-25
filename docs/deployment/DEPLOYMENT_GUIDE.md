# Dirgha CLI - Deployment Guide

## Quick Start

```bash
# Install globally
npm install -g @dirgha/cli

# Or use npx
npx @dirgha/cli login
```

## Configuration

### Environment Variables

```bash
export DIRGHA_API_KEY="your-api-key"
export DIRGHA_MODEL="claude-sonnet-4"  # Optional
export DIRGHA_DEBUG="1"                # Optional
```

### Config File

```bash
# ~/.dirgha/config.json
{
  "apiKey": "your-key",
  "defaultModel": "claude-sonnet-4",
  "theme": "dark"
}
```

## Production Deployment

### Requirements
- Node.js >= 18.0.0
- pnpm >= 8.0.0
- 100MB disk space
- 512MB RAM minimum

### Steps

1. **Clone and build:**
```bash
git clone https://github.com/dirgha-ai/cli.git
cd cli
pnpm install
pnpm run build
```

2. **Run tests:**
```bash
pnpm test
```

3. **Verify:**
```bash
./dist/dirgha.mjs --version
```

## Docker Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY . .
RUN npm install -g pnpm && pnpm install && pnpm run build
ENTRYPOINT ["node", "/app/dist/dirgha.mjs"]
```

## Troubleshooting

### Common Issues

**Permission denied:**
```bash
chmod +x dist/dirgha.mjs
```

**Missing dependencies:**
```bash
pnpm install --frozen-lockfile
```

**Build failures:**
```bash
pnpm run lint
pnpm run test
```

## Monitoring

```bash
# Check status
dirgha status

# View logs
~/.dirgha/crash.log
```
