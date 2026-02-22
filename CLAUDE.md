# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Node-RED is a low-code programming tool for event-driven applications. It provides a browser-based flow editor that makes it easy to wire together flows using nodes. The runtime is built on Node.js, taking advantage of its event-driven, non-blocking model.

## Development Commands

```bash
npm install          # Install dependencies
npm run build        # Build editor client (production)
npm run build-dev    # Build editor client (development, non-minified)
npm run dev          # Run with auto-rebuild on changes (nodemon + watch)
npm start            # Run Node-RED (after build)
npm test             # Run full test suite with coverage (grunt default task)
```

### Testing

```bash
# Run all tests with coverage
npm test

# Run tests without coverage
grunt no-coverage

# Run specific test suites
grunt simplemocha:core    # Core runtime tests only
grunt simplemocha:nodes   # Node tests only
grunt simplemocha:all     # All unit tests

# Run specific test file
./node_modules/.bin/mocha test/unit/@node-red/runtime/lib/flows/Flow_spec.js

# Run with coverage for specific suite
grunt nyc:core            # Core with coverage
grunt nyc:nodes           # Nodes with coverage
```

### Linting

```bash
grunt jshint:editor       # Lint editor code
grunt jshint:nodes        # Lint node code
grunt jshint:tests        # Lint test code
grunt jsonlint            # Validate JSON locale files
```

## Architecture

### Package Structure

The codebase uses a monorepo structure under `packages/node_modules/`:

- **`node-red`** - Main entry point, initializes and coordinates all components
- **`@node-red/runtime`** - Flow execution engine, node management, context storage
- **`@node-red/editor-api`** - REST API endpoints for the editor (Express-based)
- **`@node-red/editor-client`** - Browser-based visual flow editor (jQuery, D3.js)
- **`@node-red/nodes`** - Core built-in nodes (inject, debug, function, http, mqtt, etc.)
- **`@node-red/registry`** - Node module discovery, loading, and plugin management
- **`@node-red/util`** - Shared utilities (logging, i18n, JSONata, hooks)

### Key Component Interactions

1. **Startup flow**: `node-red/red.js` → `node-red/lib/red.js` → initializes runtime, editor-api, and util
2. **Runtime** (`@node-red/runtime/lib/index.js`): Manages flows, nodes, storage, and the execution context
3. **Editor API** (`@node-red/editor-api/lib/index.js`): Express app serving admin routes and editor UI
4. **Editor Client**: Built from source files in `src/js/` and `src/sass/`, concatenated and output to `public/`

### Editor Client Build

Source files in `@node-red/editor-client/src/` are processed by Grunt:
- JavaScript files are concatenated (order matters - see `Gruntfile.js` concat.build.src)
- SCSS compiled to CSS via sass
- Output goes to `@node-red/editor-client/public/`

### Test Structure

- `test/unit/` - Unit tests mirroring package structure
- `test/nodes/` - Tests for core nodes
- Tests use Mocha, Should.js, Sinon, and `node-red-node-test-helper`

## Coding Standards

- 4-space indentation, no tabs
- Opening brace on same line as control statement
- All files must have Apache 2.0 license header
- ES11 (ES2020) JavaScript features allowed (see `.jshintrc`)
- Use JSONata for expression evaluation where applicable

## Branch Strategy

- `master` - Current stable release, target for bug fixes
- `dev` - New feature development for next milestone
- `v1.x` - Maintenance branch for 1.x releases
