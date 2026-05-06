#!/usr/bin/env bun

import { readFile } from "node:fs/promises";
import { stdin as inputStream } from "node:process";
import { detectProvider, makeDynamic, parse, renderQrToFile, validate } from "./index";

function printHelp(): void {
  console.log(`qris-saurus CLI

Usage:
  qris-saurus validate [<qris>] [--input-file <file>]
  qris-saurus parse [<qris>] [--input-file <file>]
  qris-saurus detect [<qris>] [--input-file <file>]
  qris-saurus dynamic [<qris>] --amount <number> [--merchant-ref <text>] [--terminal-label <text>] [--input-file <file>]
  qris-saurus render [<qris>] --output <file.png> [--width <number>] [--margin <number>] [--input-file <file>]

Input priority:
  1. positional <qris>
  2. --input-file <file>
  3. stdin pipe
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

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of inputStream) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  return Buffer.concat(chunks).toString("utf8").trim();
}

async function resolveInput(positionalInput: string | undefined, args: string[]): Promise<string> {
  if (positionalInput) {
    return positionalInput.trim();
  }

  const inputFile = readFlag(args, "--input-file");
  if (inputFile) {
    const content = await readFile(inputFile, "utf8");
    return content.trim();
  }

  if (!inputStream.isTTY) {
    const piped = await readStdin();
    if (piped) {
      return piped;
    }
  }

  throw new Error("QRIS input is required via argument, --input-file, or stdin");
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  const maybeInput = args[0];
  const positionalInput = maybeInput && !maybeInput.startsWith("--") ? maybeInput : undefined;
  const flagArgs = positionalInput ? args.slice(1) : args;
  const input = await resolveInput(positionalInput, flagArgs);

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
      const amount = Number.parseFloat(requireValue(readFlag(flagArgs, "--amount"), "--amount is required"));
      const merchantRef = readFlag(flagArgs, "--merchant-ref");
      const terminalLabel = readFlag(flagArgs, "--terminal-label");

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
    case "render": {
      const output = requireValue(readFlag(flagArgs, "--output"), "--output is required");
      const width = readFlag(flagArgs, "--width");
      const margin = readFlag(flagArgs, "--margin");

      const renderOptions: {
        width?: number;
        margin?: number;
      } = {};

      if (width) {
        renderOptions.width = Number.parseInt(width, 10);
      }

      if (margin) {
        renderOptions.margin = Number.parseInt(margin, 10);
      }

      await renderQrToFile(input, output, renderOptions);

      console.log(output);
      return;
    }
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Unknown CLI error");
  process.exit(1);
});
