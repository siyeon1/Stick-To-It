# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Artifacts

- **Sticky Wall** (`artifacts/sticky-wall`, web, served at `/`) — single-page React + Vite SPA. A tactile post-it todo board: pad of blank notes bottom-left, freeform draggable wall, "DONE" pile bottom-right. No backend; all state persists in `localStorage` under key `sticky-wall:v1` as `{ wall: PostIt[], done: PostIt[] }`. Drag-and-drop and animations both via `framer-motion` (`drag` + motion values; dnd-kit was removed during the Stage 1 drag-system migration), toasts via `sonner`. Color palette and `#F5F1E8` wall background mirror the iOS sister app `StickToIt/`.
- **API Server** (`artifacts/api-server`, mounted at `/api`) — scaffold only; not consumed by Sticky Wall.
