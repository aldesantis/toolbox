#!/usr/bin/env node

import { program } from 'commander';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';
import path from 'path';
import ora from 'ora';
import cliProgress from 'cli-progress';
import colors from 'ansi-colors';
import pLimit from 'p-limit';
import { fileTypeFromFile } from 'file-type';
import { createHash } from 'crypto';

// Configuration
const DEFAULT_CONCURRENCY = 3;
const DEFAULT_MODEL = "claude-3-sonnet-20240229";
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const BACKUP_DIR = '.claude-backups';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// File filtering and validation
async function isProcessableFile(filepath) {
  try {
    const stats = await fs.stat(filepath);
    
    // Skip directories
    if (stats.isDirectory()) return false;
    
    // Skip files that are too large
    if (stats.size > MAX_FILE_SIZE) return false;
    
    // Skip binary files (only for content processing)
    const fileType = await fileTypeFromFile(filepath);
    if (fileType && !fileType.mime.startsWith('text/')) return false;
    
    return true;
  } catch (error) {
    console.error(`Error checking file ${filepath}:`, error);
    return false;
  }
}

// Backup functionality
async function backupFile(filepath, backupDir) {
  const filename = path.basename(filepath);
  const hash = createHash('md5').update(filename + Date.now()).digest('hex').slice(0, 8);
  const backupPath = path.join(backupDir, `${filename}.${hash}.backup`);
  await fs.copyFile(filepath, backupPath);
  return backupPath;
}

// Transform filename using Claude
async function transformFilename(filepath, transformPrompt, options) {
  const oldName = path.basename(filepath);
  const dirName = path.dirname(filepath);
  
  const message = await anthropic.messages.create({
    model: options.model || DEFAULT_MODEL,
    max_tokens: parseInt(options.maxTokens) || 4096,
    temperature: parseFloat(options.temperature) || 0,
    messages: [
      {
        role: "user",
        content: `You are a filename transformation tool. Below is a filename that needs to be transformed.

IMPORTANT: Your response must contain ONLY the new filename, with no preamble, quotes, explanation, or commentary.

Current filename: ${oldName}

Transformation instructions: ${transformPrompt}

Remember: Respond with ONLY the new filename.`
      }
    ]
  });

  let newName = message.content[0].text.trim();
  
  // Ensure file extension is preserved
  const oldExt = path.extname(oldName);
  const newExt = path.extname(newName);
  if (oldExt && (!newExt || newExt !== oldExt)) {
    newName = newName + oldExt;
  }
  
  // Replace invalid characters
  newName = newName.replace(/[<>:"/\\|?*]/g, '_');
  
  return path.join(dirName, newName);
}

async function processFile(filepath, options, progressBar, currentFile, totalFiles) {
  const filename = path.basename(filepath);
  progressBar.update(currentFile - 1, {
    filename: filename,
    current: currentFile,
    total: totalFiles
  });
  
  try {
    // Check if file is processable (only for content transformation)
    if (options.contentPrompt && !await isProcessableFile(filepath)) {
      return { 
        success: false, 
        filepath, 
        error: 'File is not processable (may be binary or too large)' 
      };
    }

    // Create backup if enabled
    if (options.backup) {
      await backupFile(filepath, options.backupDir);
    }

    let contentChanged = false;
    let nameChanged = false;
    let newFilepath = filepath;
    let transformedContent = null;

    // Transform content if requested
    if (options.contentPrompt) {
      const content = await fs.readFile(filepath, 'utf8');
      
      const message = await anthropic.messages.create({
        model: options.model || DEFAULT_MODEL,
        max_tokens: parseInt(options.maxTokens) || 4096,
        temperature: parseFloat(options.temperature) || 0,
        messages: [
          {
            role: "user",
            content: `You are a file content transformation tool. Below is the content of a file that needs to be transformed.

IMPORTANT: Your response must contain ONLY the transformed content, with no preamble, quotes, explanation, or commentary.

Current content:
${content}

Transformation instructions:
${options.contentPrompt}

Remember: Respond with ONLY the transformed content.`
          }
        ]
      });

      transformedContent = message.content[0].text;
      contentChanged = transformedContent !== content;
    }

    // Transform filename if requested
    if (options.filenamePrompt) {
      const newPath = await transformFilename(filepath, options.filenamePrompt, options);
      if (newPath !== filepath) {
        newFilepath = newPath;
        nameChanged = true;
      }
    }

    // Apply changes
    if (contentChanged || nameChanged) {
      // If we're changing the filename and content, write content to new file
      if (contentChanged && nameChanged) {
        await fs.writeFile(newFilepath, transformedContent, 'utf8');
        await fs.unlink(filepath);
      }
      // If only changing content, write to existing file
      else if (contentChanged) {
        await fs.writeFile(filepath, transformedContent, 'utf8');
      }
      // If only changing filename, rename file
      else if (nameChanged) {
        await fs.rename(filepath, newFilepath);
      }
    }
    
    progressBar.update(currentFile, {
      filename: filename,
      current: currentFile,
      total: totalFiles
    });

    return { 
      success: true,
      originalPath: filepath,
      newPath: newFilepath,
      status: {
        contentChanged,
        nameChanged
      }
    };
  } catch (error) {
    return { 
      success: false, 
      filepath, 
      error: error.message 
    };
  }
}

async function main() {
  // Set up CLI with more options
  program
    .requiredOption('-d, --directory <path>', 'Directory containing files to process')
    .option('--content-prompt <prompt>', 'Prompt for content transformation')
    .option('--filename-prompt <prompt>', 'Prompt for filename transformation')
    .option('-c, --concurrency <number>', 'Number of files to process in parallel', DEFAULT_CONCURRENCY.toString())
    .option('-m, --model <model>', 'Claude model to use', DEFAULT_MODEL)
    .option('-t, --temperature <number>', 'Temperature for Claude responses', '0')
    .option('--max-tokens <number>', 'Maximum tokens in Claude response', '4096')
    .option('--dry-run', 'Show what would be processed without making changes')
    .option('--backup', 'Create backups of files before processing')
    .option('--ignore <pattern>', 'Glob pattern of files to ignore')
    .parse(process.argv);

  const options = program.opts();

  // Validate options
  if (!options.contentPrompt && !options.filenamePrompt) {
    console.error('Error: Must specify at least one of --content-prompt or --filename-prompt with a prompt');
    process.exit(1);
  }

  // Validate API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY environment variable is not set');
    process.exit(1);
  }

  // Validate directory
  try {
    await fs.access(options.directory);
  } catch {
    console.error(`Error: Directory ${options.directory} does not exist`);
    process.exit(1);
  }

  // Set up backup directory if needed
  if (options.backup) {
    options.backupDir = path.join(options.directory, BACKUP_DIR);
    await fs.mkdir(options.backupDir, { recursive: true });
  }

  // Get all files
  const spinner = ora('Reading directory...').start();
  const files = await fs.readdir(options.directory);
  const filePaths = files
    .filter(file => !file.startsWith('.')) // Skip hidden files
    .filter(file => !options.ignore || !file.match(options.ignore))
    .map(file => path.join(options.directory, file));

  spinner.succeed(`Found ${files.length} files`);

  // Dry run information
  if (options.dryRun) {
    console.log('\nDry run - files that would be processed:');
    for (const filepath of filePaths) {
      const processable = options.contentPrompt ? await isProcessableFile(filepath) : true;
      if (processable) {
        console.log(`  ✓ ${path.basename(filepath)}`);
      } else {
        console.log(`  ✗ ${path.basename(filepath)} (would be skipped)`);
      }
    }
    process.exit(0);
  }

  // Set up single progress bar
  const progressBar = new cliProgress.SingleBar({
    format: 'Processing |' + colors.cyan('{bar}') + '| {percentage}% | {current}/{total} files | Current: {filename}',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
  });

  // Initialize the progress bar
  progressBar.start(filePaths.length, 0, {
    filename: 'Starting...',
    current: 0,
    total: filePaths.length
  });

  // Process files in parallel with concurrency limit
  const limit = pLimit(parseInt(options.concurrency));
  const tasks = filePaths.map((filepath, index) => 
    limit(() => processFile(filepath, options, progressBar, index + 1, filePaths.length))
  );

  const results = await Promise.all(tasks);
  
  progressBar.stop();

  // Report results
  const successful = results.filter(r => r.success);
  const contentChanged = successful.filter(r => r.status.contentChanged);
  const nameChanged = successful.filter(r => r.status.nameChanged);
  const unchanged = successful.filter(r => r.success && !r.status.contentChanged && !r.status.nameChanged);
  const failed = results.filter(r => !r.success);

  console.log('\nProcessing complete:');
  console.log(`✓ Successfully processed ${successful.length} files:`);
  if (options.contentPrompt) {
    console.log(`  - ${contentChanged.length} files had content changed`);
  }
  if (options.filenamePrompt) {
    console.log(`  - ${nameChanged.length} files were renamed`);
  }
  console.log(`  - ${unchanged.length} files unchanged`);
  
  if (nameChanged.length > 0) {
    console.log('\nRenamed files:');
    nameChanged.forEach(result => {
      console.log(`  ${path.basename(result.originalPath)} -> ${path.basename(result.newPath)}`);
    });
  }
  
  if (failed.length > 0) {
    console.log(`\n✗ Failed to process ${failed.length} files:`);
    failed.forEach(result => {
      console.log(`  - ${path.basename(result.filepath)}: ${result.error}`);
    });
  }

  if (options.backup) {
    console.log(`\nBackups created in ${BACKUP_DIR}/`);
  }
}

// Enhanced error handling
process.on('unhandledRejection', (error) => {
  console.error('An unexpected error occurred:', error);
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('\nProcess interrupted by user');
  process.exit(0);
});

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
