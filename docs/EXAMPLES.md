# Dirgha CLI - Examples

Real-world workflows and use cases for Dirgha.

## Table of Contents

1. [Web Development](#web-development)
2. [Code Review & Debugging](#code-review--debugging)
3. [Data Analysis](#data-analysis)
4. [DevOps & Automation](#devops--automation)
5. [Learning & Research](#learning--research)
6. [Project Management](#project-management)

---

## Web Development

### Creating a New React Project

```bash
$ dirgha start

dirgha> /start Create a React TypeScript app with Vite, Tailwind, and routing

The agent will:
1. Check if Node.js is installed
2. Run `npm create vite@latest my-app -- --template react-ts`
3. Install Tailwind CSS with PostCSS
4. Set up React Router
5. Create a starter layout with navigation

Want me to proceed with all steps? [Y/n] y

[Agent runs commands, shows progress]
✓ Project created at ./my-app
✓ Tailwind configured
✓ React Router installed
✓ Starter components created

Next steps:
- cd my-app
- npm run dev
- Visit http://localhost:5173
```

### Adding Authentication

```bash
dirgha> /start Add authentication to this React app using Auth0

The agent will:
1. Install @auth0/auth0-react
2. Create Auth0Provider wrapper
3. Add login/logout buttons
4. Create protected route component
5. Update environment variables template
```

### Responsive Design Review

```bash
dirgha> /image ./designs/mobile-mockup.png
dirgha> "Implement this mobile-first design. Use Tailwind CSS with
> the breakpoints: sm:640px, md:768px, lg:1024px. Make sure the
> navigation collapses to a hamburger menu on mobile."

[Agent creates components with responsive styles]
```

---

## Code Review & Debugging

### Debugging TypeScript Errors

```bash
$ dirgha start

dirgha> /attach ./src/utils/api.ts
dirgha> /attach ./tsconfig.json
dirgha> "I'm getting 'Cannot find module' errors when importing
> from './utils/api' in other files. What's wrong?"

[Agent analyzes files]

The issue is that your `tsconfig.json` has:
```json
"moduleResolution": "node"
```

But you're using path aliases without configuring `baseUrl` and `paths`.

Here's the fix:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

Then update your imports to use `@/utils/api` instead of relative paths.
```

### Performance Optimization

```bash
dirgha> /start Analyze this codebase for performance issues

dirgha> /attach ./src/components/Dashboard.tsx
dirgha> /attach ./package.json

dirgha> "The dashboard loads slowly. What can I optimize?"

[Agent identifies issues]

Found 3 performance issues:

1. **Large bundle size**: You're importing all of lodash
   Fix: `import debounce from 'lodash/debounce'`

2. **Unnecessary re-renders**: Dashboard fetches data on every render
   Fix: Use React Query or wrap in useEffect with dependency array

3. **No code splitting**: All routes loaded upfront
   Fix: Use React.lazy() + Suspense

Want me to implement these optimizations?
```

### Security Audit

```bash
dirgha> /start Do a security audit of this Node.js project

dirgha> /attach ./package.json
dirgha> /attach ./src/server.ts

dirgha> "Check for common security vulnerabilities"

[Agent analyzes code]

Security issues found:

⚠️ HIGH: No rate limiting on authentication routes
⚠️ MEDIUM: CORS allows all origins (`origin: '*'`)
⚠️ MEDIUM: No helmet middleware for security headers
⚠️ LOW: Dependency `old-lib@1.2.3` has known CVE

Recommendations:
1. Add express-rate-limit to /login and /register
2. Restrict CORS to specific origins
3. Install helmet middleware
4. Update old-lib to v2.0.0

Want me to create a PR with these fixes?
```

---

## Data Analysis

### CSV Analysis

```bash
dirgha> /attach ./sales-q3.csv
dirgha> "What's the trend in Q3 revenue? Show me month-over-month
> growth and identify the top 3 performing products."

[Agent analyzes data]

Q3 Revenue Analysis:
- July: $45,200 (+5% MoM)
- August: $52,800 (+17% MoM)
- September: $61,400 (+16% MoM)

Top 3 Products:
1. Enterprise Plan: $28,500 (46% of revenue)
2. Pro Plan: $19,200 (31% of revenue)
3. Starter Plan: $13,700 (22% of revenue)

Trend: Strong growth in Enterprise conversions
Recommendation: Focus marketing on Enterprise features
```

### Database Schema Design

```bash
dirgha> /start Design a database schema for a SaaS application

dirgha> "I need a schema for a project management SaaS with:
> - Organizations (multi-tenant)
> - Projects
> - Tasks with assignments
> - Comments on tasks
> - File attachments
> Use PostgreSQL with proper indexes and foreign keys."

[Agent creates SQL schema]

```sql
-- Organizations (multi-tenant root)
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  plan VARCHAR(20) DEFAULT 'free',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Users (belong to orgs via memberships)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  organization_id UUID REFERENCES organizations(id),
  role VARCHAR(20) DEFAULT 'member',
  UNIQUE(user_id, organization_id)
);

-- Projects
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_projects_org ON projects(organization_id);

-- Tasks
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(20) DEFAULT 'todo',
  priority VARCHAR(10) DEFAULT 'medium',
  assignee_id UUID REFERENCES users(id),
  due_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id);

-- Comments
CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id),
  author_id UUID REFERENCES users(id),
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_comments_task ON comments(task_id);

-- Attachments
CREATE TABLE attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id),
  uploader_id UUID REFERENCES users(id),
  filename VARCHAR(255) NOT NULL,
  size_bytes INTEGER,
  mime_type VARCHAR(100),
  storage_key VARCHAR(500) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_attachments_task ON attachments(task_id);
```

Indexes added for common query patterns:
- Organization-scoped queries
- Task filtering by project/assignee
- Comment pagination by task
```

### API Design

```bash
dirgha> /start Design a REST API for the project management app

dirgha> "Create OpenAPI spec for the core endpoints:
> - Auth (login, register, refresh)
> - Projects (CRUD)
> - Tasks (CRUD, filter, assign)
> - Comments (add, list)
> Include pagination, filtering, and error responses."

[Agent creates OpenAPI spec]
```

---

## DevOps & Automation

### CI/CD Pipeline

```bash
dirgha> /start Create a GitHub Actions workflow for this Node.js project

dirgha> "Requirements:
> - Run tests on Node 18, 20, 22
> - Lint with ESLint
> - Type check with TypeScript
> - Build and upload artifact
> - Publish to npm on tags
> Use pnpm for package management."

[Agent creates .github/workflows/ci.yml]
```

### Docker Setup

```bash
dirgha> /start Dockerize this Node.js application

dirgha> "Create Dockerfile and docker-compose.yml with:
> - Multi-stage build for smaller image
> - Development volume mounts
> - Production optimization
> - Health checks
> - Environment variable handling"

[Agent creates Docker files]

```dockerfile
# Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:20-alpine AS production
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s \
  CMD node -e "require('http').get('http://localhost:3000/health')"
CMD ["node", "dist/main.js"]
```

```yaml
# docker-compose.yml
version: '3.8'
services:
  app:
    build:
      context: .
      target: production
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgres://user:pass@db:5432/myapp
    depends_on:
      - db
    restart: unless-stopped
  
  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
      POSTGRES_DB: myapp
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  postgres_data:
```
```

### Terraform Infrastructure

```bash
dirgha> /start Create Terraform for AWS deployment

dirgha> "Infrastructure needed:
> - ECS Fargate for Node.js app
> - RDS PostgreSQL
> - Application Load Balancer
> - ECR repository
> - CloudWatch logging
> - SSM Parameter Store for secrets"

[Agent creates Terraform modules]
```

---

## Learning & Research

### Understanding New Libraries

```bash
# Read documentation inline
dirgha> /browse https://tanstack.com/query/latest/docs/react/overview
dirgha> "Summarize the key concepts of TanStack Query and when
> to use it vs SWR or Redux. Include code examples."

[Agent extracts docs and provides summary]

TanStack Query (React Query) Key Concepts:

1. **Server State Management**: Treats server data as state that needs
   syncing, not just a one-time fetch.

2. **Automatic Caching**: Results cached by key, stale-while-revalidate
   pattern by default.

3. **Background Updates**: Refetches in background when window regains
   focus or network reconnects.

Basic Example:
```typescript
import { useQuery } from '@tanstack/react-query'

function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['todos'],
    queryFn: fetchTodos
  })
  
  if (isLoading) return <Spinner />
  return <TodoList data={data} />
}
```

When to use:
- ✅ Data fetching with caching needs
- ✅ Real-time sync requirements
- ✅ Complex loading/error states

When not to use:
- ❌ Simple one-time fetches
- ❌ Client-only state (use Zustand/Jotai instead)
```

### Algorithm Explanation

```bash
dirgha> "Explain how React's Fiber architecture works and why
> it was introduced. Use diagrams if helpful."

[Agent explains with ASCII diagrams]

Before Fiber (Stack Reconciler):
┌─────────────────────────────────────┐
│  Update starts                      │
│    ↓                                │
│  Recursively process all components │
│    ↓                                │
│  Build entire tree (blocking)     │
│    ↓                                │
│  Commit to DOM                      │
└─────────────────────────────────────┘
Problem: Large trees = janky UI

After Fiber (Incremental Reconciler):
┌─────────────────────────────────────┐
│  Update starts                      │
│    ↓                                │
│  Process work in chunks           │
│    ↓ ← can pause here for high     │
│  priority work (user input)        │
│    ↓                                │
│  Resume processing                  │
│    ↓                                │
│  Commit complete tree               │
└─────────────────────────────────────┘

Key benefits:
1. Time-slicing: Work broken into 5ms chunks
2. Prioritization: User input > animations > data fetching
3. Suspense: Pause rendering, show fallback
```

---

## Project Management

### Task Planning

```bash
dirgha> /start Plan the implementation of a feature

dirgha> "I need to add real-time notifications to my app using
> WebSockets. Break this down into tasks and estimate complexity."

[Agent creates plan]

Real-time Notifications Implementation Plan:

**Phase 1: Infrastructure** (2 days, Medium)
- [ ] Set up Socket.io server
- [ ] Configure Redis adapter for multi-server
- [ ] Add connection authentication
- [ ] Implement presence tracking

**Phase 2: Backend Logic** (3 days, Medium)
- [ ] Create notification service
- [ ] Add event handlers for triggers
- [ ] Implement notification persistence
- [ ] Add batching for high-volume events

**Phase 3: Frontend** (2 days, Low)
- [ ] Create Socket.io client wrapper
- [ ] Add notification UI components
- [ ] Implement toast notifications
- [ ] Add notification history view

**Phase 4: Testing** (1 day, Low)
- [ ] Add WebSocket integration tests
- [ ] Test reconnection logic
- [ ] Load test with many connections

Total: 8 days
Dependencies: Redis, Socket.io
```

### Code Migration

```bash
dirgha> /start Migrate from JavaScript to TypeScript

dirgha> "I have a Node.js Express app in JS. Help me migrate
> to TypeScript incrementally without breaking anything."

[Agent creates migration plan]

Incremental TypeScript Migration Plan:

**Step 1: Setup** (1 hour)
1. Install TypeScript: `npm install -D typescript @types/node`
2. Create `tsconfig.json` with allowJs: true
3. Rename files: `.js` → `.ts` (one at a time)

**Step 2: Core Files First** (2 days)
- Start with utility functions (no Express deps)
- Add type annotations gradually
- Use `any` temporarily for complex types

**Step 3: Express Routes** (2 days)
- Install `@types/express`
- Type request/response handlers
- Create interfaces for request bodies

**Step 4: Strict Mode** (1 day)
- Enable strict options one by one
- Fix null checks
- Add return type annotations

Migration checklist created. Start with Step 1?
```

---

## Tips for Effective Use

### 1. Start with Clear Goals

```bash
# Good
dirgha> /start "Create a React component for file upload with
> drag-and-drop support, progress indicator, and error handling"

# Less effective
dirgha> /start "help with react"
```

### 2. Use Attachments for Context

```bash
# Attach relevant files before asking
dirgha> /attach ./package.json
dirgha> /attach ./src/App.tsx
dirgha> "Why is my bundle so large?"
```

### 3. Save Sessions at Milestones

```bash
dirgha> /save auth-flow-complete
dirgha> /save database-schema-final
```

### 4. Browse Current Docs

```bash
# Always get latest documentation
dirgha> /browse https://docs.example.com/latest/api
dirgha> "What changed in v3?"
```

### 5. Iterate on Solutions

```bash
dirgha> "Create a login form"
[Agent creates form]
dirgha> "Add form validation with Zod"
[Agent adds validation]
dirgha> "Also add 'forgot password' link"
[Agent adds link]
```

---

## More Examples Wanted?

Submit example requests at:
https://github.com/salikshah/dirgha-os-v1/issues

Or contribute your own workflows via PR!
