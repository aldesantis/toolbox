#!/usr/bin/env node

import { program } from 'commander';
import ora from 'ora';
import pLimit from 'p-limit';
import fs from 'fs/promises';
import path from 'path';
import FileProcessor from './src/fileProcessor.js';
import ResultReporter from './src/resultReporter.js';
import { CONFIG } from './src/config.js';
import { validateEnvironment, getFilePaths } from './src/utils.js';

async function main() {
  program
    .argument('<directory>', 'Directory containing files to process')
    .option('--content-prompt <prompt>', 'Prompt for content transformation')
    .option('--filename-prompt <prompt>', 'Prompt for filename transformation')
    .option('-c, --concurrency <number>', 'Number of files to process in parallel', CONFIG.DEFAULT_CONCURRENCY.toString())
    .option('-m, --model <model>', 'Claude model to use', CONFIG.DEFAULT_MODEL)
    .option('-t, --temperature <number>', 'Temperature for Claude responses', CONFIG.DEFAULT_TEMPERATURE.toString())
    .option('--max-tokens <number>', 'Maximum tokens in Claude response', CONFIG.DEFAULT_MAX_TOKENS.toString())
    .option('--dry-run', 'Show what would be processed without making changes')
    .option('--backup', 'Create backups of files before processing')
    .option('--pattern <pattern>', 'Glob pattern of files to process')
    .option('--recursive', 'Process subdirectories recursively', true)  // Set default to true
    .parse(process.argv);

  const options = program.opts();
  options.directory = program.args[0];

  try {
    await validateEnvironment(options);

    // Set up backup directory if needed
    if (options.backup) {
      options.backupDir = path.join(options.directory, CONFIG.BACKUP_DIR);
      await fs.mkdir(options.backupDir, { recursive: true });
      
      // Create backup directory structure that mirrors source
      if (options.recursive) {
        const createBackupDirStructure = async (sourceDir) => {
          const entries = await fs.readdir(sourceDir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory() && !entry.name.startsWith('.')) {
              const sourcePath = path.join(sourceDir, entry.name);
              const relativePath = path.relative(options.directory, sourcePath);
              const backupPath = path.join(options.backupDir, relativePath);
              await fs.mkdir(backupPath, { recursive: true });
              await createBackupDirStructure(sourcePath);
            }
          }
        };
        await createBackupDirStructure(options.directory);
      }
    }

    // Get files to process
    const spinner = ora('Reading directory...').start();
    const filePaths = await getFilePaths(options.directory, options.pattern, options.recursive);
    spinner.succeed(`Found ${filePaths.length} files`);

    // Handle dry run
    if (options.dryRun) {
      const processor = new FileProcessor(options);
      console.log('\nDry run - files that would be processed:');
      for (const filepath of filePaths) {
        const processable = options.contentPrompt ? await processor.isProcessableFile(filepath) : true;
        console.log(`  ${processable ? '✓' : '✗'} ${path.basename(filepath)}${!processable ? ' (would be skipped)' : ''}`);
      }
      return;
    }

    // Process files
    const processor = new FileProcessor(options);
    processor.initializeProgressBar(filePaths.length);

    const limit = pLimit(parseInt(options.concurrency));
    const tasks = filePaths.map((filepath, index) => 
      limit(() => processor.processFile(filepath, index + 1, filePaths.length))
    );

    const results = await Promise.all(tasks);
    processor.stopProgress();

    // Report results
    ResultReporter.report(results, options);

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Error handling
process.on('unhandledRejection', (error) => {
  console.error('An unexpected error occurred:', error);
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('\nProcess interrupted by user');
  process.exit(0);
});

main();
