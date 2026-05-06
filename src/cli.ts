#!/usr/bin/env bun

import { detectProvider, makeDynamic, parse, validate } from "./index";

function printHelp(): void {
  console.log(`qris-saurus CLI

Usage:
  qris-saurus validate <qris>
  qris-saurus parse <qris>
  qris-saurus detect <qris>
  qris-saurus dynamic <qris> --amount <number> [--merchant-ref <text>] [--terminal-label <text>]
`);
}

function readFlag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }

  return args[index + 1];
}

function requireValue(value: string | undefined, message: string): string {
  if (!value) {
    throw new Error(message);
  }

  return value;
}

function main(): void {
  const [command, input, ...rest] = process.argv.slice(2);

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (!input) {
    throw new Error("QRIS input is required");
  }

  switch (command) {
    case "validate": {
      console.log(JSON.stringify(validate(input), null, 2));
      return;
    }
    case "parse": {
      console.log(JSON.stringify(parse(input), null, 2));
      return;
    }
    case "detect": {
      const provider = detectProvider(input);
      console.log(JSON.stringify(provider?.info ?? null, null, 2));
      return;
    }
    case "dynamic": {
      const amount = Number.parseFloat(requireValue(readFlag(rest, "--amount"), "--amount is required"));
      const merchantRef = readFlag(rest, "--merchant-ref");
      const terminalLabel = readFlag(rest, "--terminal-label");

      const options: {
        amount: number;
        merchantRef?: string;
        terminalLabel?: string;
      } = { amount };

      if (merchantRef) {
        options.merchantRef = merchantRef;
      }

      if (terminalLabel) {
        options.terminalLabel = terminalLabel;
      }

      const result = makeDynamic(input, options);

      console.log(result.qrisString);
      return;
    }
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Unknown CLI error");
  process.exit(1);
}
