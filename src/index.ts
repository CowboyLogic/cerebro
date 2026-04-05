#!/usr/bin/env node

// Entry point — Phase 4 (SPEC-0007 TUI + SPEC-0008 CLI + SPEC-0009 MCP implemented)

// Required to make this file an ES module so top-level await is allowed.
export {};

// MCP-REQ-0013: detect --mcp BEFORE Commander initialises or processes any
// arguments. Commander writes help/errors to stdout by default — if it runs
// first it can corrupt the JSON-RPC stream before the server starts.
if (process.argv.includes('--mcp')) {
  const { runMcpServer } = await import('./mcp/server.js');
  runMcpServer().catch((err: Error) => {
    process.stderr.write(`[cerebro:mcp] Fatal: ${err.message}\n`);
    process.exit(1);
  });
} else {
  const { Command } = await import('commander');
  const { registerInstallCommand } = await import('./cli/install.js');
  const { registerListCommand } = await import('./cli/list.js');
  const { registerSourcesCommand } = await import('./cli/sources.js');
  const { registerStatusCommand } = await import('./cli/status.js');

  const program = new Command();

  program
    .name('cerebro')
    .description('Install AI artifacts (skills, agents, prompts) from GitHub into your IDE')
    .version('0.1.0');

  registerInstallCommand(program);
  registerListCommand(program);
  registerSourcesCommand(program);
  registerStatusCommand(program);

  // Default action (no subcommand): launch the TUI (SPEC-0007 / TUI-REQ-0001)
  program.action(async () => {
    const { runTui } = await import('./tui/app.js');
    await runTui();
  });

  // Guard: do not auto-parse when running under Vitest
  if (!process.env.VITEST) {
    program.parseAsync().catch((err: Error) => {
      process.stderr.write(`[cerebro] Fatal: ${err.message}\n`);
      process.exit(1);
    });
  }

  // Export program for tests that import it directly
  // (dynamic exports aren't possible — tests that need `program` should import
  //  the CLI sub-modules directly)
}
