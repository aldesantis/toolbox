#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import glob from 'glob-promise';
import chalk from 'chalk';
import { Command } from 'commander';
import cliProgress from 'cli-progress';

const program = new Command();

program
  .name('nugget')
  .description('Analyzes Markdown files to generate content suggestions using Claude')
  .version('1.0.0')
  .argument('<directory>', 'Directory containing Markdown files')
  .option('-m, --model <model>', 'Claude model to use', 'claude-3-5-sonnet-20241022')
  .option('-i, --instructions <path>', 'Path to instructions file (defaults to ~/.nuggetrc)')

program.parse();
const options = program.opts();
const directory = program.args[0];

// Default instructions that can be overridden
const PROMPT_TEMPLATE = `{instructions}

Based on these instructions, analyze this content and suggest 2-3 interesting LinkedIn posts or blog topics that would be valuable for my audience.

Content to analyze:
{content}

For each suggestion, provide your response in this exact markdown format:

## 1. [Title]

### Inspiration

[What piece of the content inspired this suggestion]

### Key Points

- [Point 1]
- [Point 2]
- [Point 3]

### Audience Value

[Why this resonates with the audience]

## 2. [Title]
[Same format as above]

## 3. [Title] (optional)
[Same format as above]`;

if (!process.env.ANTHROPIC_API_KEY) {
  console.error(chalk.red('Error: ANTHROPIC_API_KEY environment variable is required'));
  process.exit(1);
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function loadAnalysisInstructions() {
  try {
    let instructionsPath;
    
    if (options.instructions) {
      instructionsPath = path.resolve(options.instructions);
    } else {
      instructionsPath = path.join(process.env.HOME || process.env.USERPROFILE, '.nuggetrc');
    }

    try {
      const instructions = await fs.readFile(instructionsPath, 'utf8');
      return instructions.trim();
    } catch (error) {
      if (!options.instructions && error.code === 'ENOENT') {
        console.error(chalk.red('Error: No instructions found. Please create ~/.nuggetrc or specify instructions file with -i'));
        process.exit(1);
      }
      throw error;
    }
  } catch (error) {
    console.error(chalk.red(`Error reading instructions file: ${error.message}`));
    process.exit(1);
  }
}

async function findMarkdownFiles(directory) {
  const pattern = path.join(directory, '**/*.md');
  return await glob(pattern);
}

async function analyzeContent(filePath, instructions, progressBar) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const fileName = path.basename(filePath);

    const prompt = PROMPT_TEMPLATE
      .replace('{instructions}', instructions)
      .replace('{content}', content);

    const message = await anthropic.messages.create({
      model: options.model,
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: prompt
      }]
    });

    progressBar.increment(1);
    return {
      file: fileName,
      suggestions: message.content[0].text,
      error: null
    };

  } catch (error) {
    progressBar.increment(1);
    if (error.type === 'invalid_request_error' && error.message.includes('context_length')) {
      console.error(chalk.yellow(`\nSkipping ${path.basename(filePath)} - File too large for analysis`));
    } else {
      console.error(chalk.red(`\nError analyzing ${filePath}:`), error.message);
    }
    return {
      file: path.basename(filePath),
      suggestions: null,
      error: error.message
    };
  }
}

async function main() {
  try {
    const instructions = await loadAnalysisInstructions();
    
    console.error(chalk.green(`Searching for Markdown files in ${directory}...`));

    const files = await findMarkdownFiles(directory);

    if (files.length === 0) {
      console.error(chalk.yellow('No Markdown files found.'));
      return;
    }

    console.error(chalk.green(`Found ${files.length} Markdown files.\n`));

    const progressBar = new cliProgress.SingleBar({
      format: 'Analyzing files |' + chalk.cyan('{bar}') + '| {percentage}% ({value}/{total} files)',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true
    });

    progressBar.start(files.length, 0);

    const results = await Promise.all(
      files.map(file => analyzeContent(file, instructions, progressBar))
    );
    
    progressBar.stop();
    console.error('\n');
    results
      .filter(result => result && result.suggestions)
      .forEach(result => {
        console.log(`# ${result.file}\n`);
        console.log(`${result.suggestions}\n`);
      });

  } catch (error) {
    console.error(chalk.red('\nError:', error.message));
    process.exit(1);
  }
}

main();
