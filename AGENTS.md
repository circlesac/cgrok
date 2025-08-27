# AGENTS.ms

## Verify

- Always run `bun run build`, `bun lint` and `bun run test` to verify your work.
- When you need to verify the tunnel, run the program in the background and test it.
- When testing tunnel, you should test the tunnel endpoint not the local server.

## Coding Rules

- Rely on TypeScript’s type inference instead of redundant type annotations. This also applies to return types.
- When returning undefined, you can just use `return` instead of `return undefined`.
- Prefer undefined for optional values, reserve null only for explicit emptiness in external data.
- When type alias is defined in `tsconfig.json`, always use imports using type alias.
- When using import, import modules first and then import internal modules. Create a space between them.
- Creating Commander.js commands by extending Command class.
