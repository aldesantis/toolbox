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

// Configuration constants
const CONFIG = {
  DEFAULT_CONCURRENCY: 3,
  DEFAULT_MODEL: "claude-3-sonnet-20240229",
  MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB
  BACKUP_DIR: '.claude-backups',
  DEFAULT_MAX_TOKENS: 4096,
  DEFAULT_TEMPERATURE: 0,
  MAX_FILENAME_LENGTH: 255
};

// Improved Claude prompts
const PROMPTS = {
  filename: (oldName, content, transformPrompt) => `You are a file renaming tool. Your task is to transform the filename according to the instructions below.

CRITICAL INSTRUCTIONS:
1. You MUST output ONLY the new filename
2. Do NOT include ANY explanations, quotes, or additional text
3. Do NOT include file paths - only the filename
4. Preserve the file extension unless specifically instructed otherwise
5. All filenames must be valid (no < > : " / \\ | ? * characters)
6. If unsure about any aspect, preserve the original filename
7. Maximum filename length: 255 characters

Current filename: ${oldName}

${content ? `File content for context:
\`\`\`
${content}
\`\`\`
` : ''}

Transformation instructions: ${transformPrompt}

REMINDER: Respond with ONLY the new filename. Any additional text will break the system.`,

  content: (content, filename, transformPrompt) => `You are a file content transformation tool. Your task is to transform the file content according to the instructions below.

CRITICAL INSTRUCTIONS:
1. You MUST output ONLY the transformed content
2. Do NOT include ANY explanations, markdown formatting, or additional text
3. Do NOT include "\`\`\`" code blocks or any other formatting
4. Preserve the original format (indentation, line endings, etc.) unless instructed otherwise
5. If unsure about any aspect, preserve the original content
6. Maintain the same character encoding as the input

Current filename for context: ${filename}

Original content:
\`\`\`
${content}
\`\`\`

Transformation instructions: ${transformPrompt}

REMINDER: Respond with ONLY the transformed content. Any additional text, formatting, or explanations will break the system.

Begin transformed content below this line (no additional formatting or text):
`};

class FileProcessor {
  constructor(options) {
    this.options = options;
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    this.progressBar = null;
  }

  async isProcessableFile(filepath) {
    try {
      const stats = await fs.stat(filepath);
      if (stats.isDirectory() || stats.size > CONFIG.MAX_FILE_SIZE) return false;
      
      const fileType = await fileTypeFromFile(filepath);
      return !(fileType && !fileType.mime.startsWith('text/'));
    } catch (error) {
      console.error(`Error checking file ${filepath}:`, error);
      return false;
    }
  }

  async backupFile(filepath) {
    const relativePath = path.relative(this.options.directory, filepath);
    const filename = path.basename(filepath);
    const hash = createHash('md5').update(filename + Date.now()).digest('hex').slice(0, 8);
    
    let backupPath;
    if (this.options.recursive) {
      const dirStructure = path.dirname(relativePath);
      const backupDir = path.join(this.options.backupDir, dirStructure);
      await fs.mkdir(backupDir, { recursive: true });
      backupPath = path.join(backupDir, `${filename}.${hash}.backup`);
    } else {
      backupPath = path.join(this.options.backupDir, `${filename}.${hash}.backup`);
    }
    
    await fs.copyFile(filepath, backupPath);
    return backupPath;
  }

  async callClaude(prompt, model = CONFIG.DEFAULT_MODEL) {
    const message = await this.anthropic.messages.create({
      model: this.options.model || model,
      max_tokens: parseInt(this.options.maxTokens) || CONFIG.DEFAULT_MAX_TOKENS,
      temperature: parseFloat(this.options.temperature) || CONFIG.DEFAULT_TEMPERATURE,
      messages: [{ role: "user", content: prompt }]
    });
    return message.content[0].text.trim();
  }

  async validateFilenameResponse(response, originalName) {
    // Remove any markdown formatting or quotes if present
    response = response.replace(/^['"`]|['"`]$/g, '').trim();
    
    // Ensure extension is preserved unless explicitly changed
    const originalExt = path.extname(originalName);
    const newExt = path.extname(response);
    if (originalExt && !newExt) {
      response += originalExt;
    }
    
    // Enforce filename length limit
    if (response.length > CONFIG.MAX_FILENAME_LENGTH) {
      response = response.slice(0, CONFIG.MAX_FILENAME_LENGTH - 4) + originalExt;
    }
    
    // Replace invalid characters
    return response.replace(/[<>:"/\\|?*]/g, '_');
  }

  async validateContentResponse(response, originalContent) {
    // Remove any potential markdown code block formatting
    response = response.replace(/^```[\s\S]*?\n/, '').replace(/\n```$/, '');
    
    // If response is empty or significantly shorter, return original
    if (!response.trim() || response.length < originalContent.length * 0.1) {
      throw new Error('Invalid content transformation: Response too short or empty');
    }
    
    return response;
  }

  async transformFilename(filepath, fileContent = null) {
    const oldName = path.basename(filepath);
    const dirName = path.dirname(filepath);
    
    if (fileContent === null && this.options.filenamePrompt.toLowerCase().includes('content')) {
      try {
        fileContent = await fs.readFile(filepath, 'utf8');
      } catch (error) {
        console.warn(`Warning: Could not read file content for filename transformation: ${error.message}`);
        fileContent = '[Content could not be read]';
      }
    }
    
    const newName = await this.callClaude(
      PROMPTS.filename(oldName, fileContent || '[Content not required]', this.options.filenamePrompt)
    );
    
    const validatedName = await this.validateFilenameResponse(newName, oldName);
    return path.join(dirName, validatedName);
  }

  async transformContent(filepath) {
    const content = await fs.readFile(filepath, 'utf8');
    const filename = path.basename(filepath);
    const transformed = await this.callClaude(
      PROMPTS.content(content, filename, this.options.contentPrompt)
    );
    
    return this.validateContentResponse(transformed, content);
  }

  async processFile(filepath, currentFile, totalFiles) {
    const filename = path.basename(filepath);
    this.updateProgress(currentFile - 1, filename, totalFiles);
    
    try {
      if (this.options.contentPrompt && !await this.isProcessableFile(filepath)) {
        return { 
          success: false, 
          filepath, 
          error: 'File is not processable (may be binary or too large)' 
        };
      }

      if (this.options.backup) {
        await this.backupFile(filepath);
      }

      const result = await this.applyTransformations(filepath);
      this.updateProgress(currentFile, filename, totalFiles);
      return result;

    } catch (error) {
      return { success: false, filepath, error: error.message };
    }
  }

  async applyTransformations(filepath) {
    let contentChanged = false;
    let nameChanged = false;
    let newFilepath = filepath;
    let transformedContent = null;
    let originalContent;
    
    if (this.options.contentPrompt || 
        (this.options.filenamePrompt && this.options.filenamePrompt.toLowerCase().includes('content'))) {
      try {
        originalContent = await fs.readFile(filepath, 'utf8');
      } catch (error) {
        throw new Error(`Could not read file content: ${error.message}`);
      }
    }

    if (this.options.contentPrompt) {
      transformedContent = await this.transformContent(filepath);
      contentChanged = transformedContent !== originalContent;
    }

    if (this.options.filenamePrompt) {
      newFilepath = await this.transformFilename(filepath, originalContent);
      nameChanged = newFilepath !== filepath;
    }

    await this.applyChanges(filepath, newFilepath, transformedContent, contentChanged, nameChanged);

    return { 
      success: true,
      originalPath: filepath,
      newPath: newFilepath,
      status: { contentChanged, nameChanged }
    };
  }

  async applyChanges(filepath, newFilepath, transformedContent, contentChanged, nameChanged) {
    if (!contentChanged && !nameChanged) return;

    if (contentChanged && nameChanged) {
      await fs.writeFile(newFilepath, transformedContent, 'utf8');
      await fs.unlink(filepath);
    } else if (contentChanged) {
      await fs.writeFile(filepath, transformedContent, 'utf8');
    } else if (nameChanged) {
      await fs.rename(filepath, newFilepath);
    }
  }

  initializeProgressBar(total) {
    this.progressBar = new cliProgress.SingleBar({
      format: 'Processing |' + colors.cyan('{bar}') + '| {percentage}% | {current}/{total} files | Current: {filename}',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
    });
    this.progressBar.start(total, 0, { filename: 'Starting...', current: 0, total });
  }

  updateProgress(current, filename, total) {
    this.progressBar.update(current, { filename, current, total });
  }

  stopProgress() {
    this.progressBar.stop();
  }
}

class ResultReporter {
  static groupResultsByDirectory(results) {
    return results.reduce((acc, result) => {
      if (!result.success) return acc;
      
      const dir = path.dirname(result.originalPath);
      if (!acc[dir]) {
        acc[dir] = {
          contentChanged: 0,
          nameChanged: 0,
          unchanged: 0
        };
      }
      
      if (result.status.contentChanged) acc[dir].contentChanged++;
      if (result.status.nameChanged) acc[dir].nameChanged++;
      if (!result.status.contentChanged && !result.status.nameChanged) acc[dir].unchanged++;
      
      return acc;
    }, {});
  }

  static report(results, options) {
    const successful = results.filter(r => r.success);
    const contentChanged = successful.filter(r => r.status?.contentChanged);
    const nameChanged = successful.filter(r => r.status?.nameChanged);
    const unchanged = successful.filter(r => r.success && !r.status?.contentChanged && !r.status?.nameChanged);
    const failed = results.filter(r => !r.success);

    console.log('\nProcessing complete:');
    console.log(`✓ Successfully processed ${successful.length} files:`);
    
    if (options.recursive) {
      const groupedResults = this.groupResultsByDirectory(results);
      
      for (const [dir, stats] of Object.entries(groupedResults)) {
        console.log(`\nDirectory: ${dir}`);
        if (options.contentPrompt && stats.contentChanged > 0) {
          console.log(`  - ${stats.contentChanged} files had content changed`);
        }
        if (options.filenamePrompt && stats.nameChanged > 0) {
          console.log(`  - ${stats.nameChanged} files were renamed`);
        }
        console.log(`  - ${stats.unchanged} files unchanged`);
      }
    } else {
      if (options.contentPrompt) {
        console.log(`  - ${contentChanged.length} files had content changed`);
      }
      if (options.filenamePrompt) {
        console.log(`  - ${nameChanged.length} files were renamed`);
      }
      console.log(`  - ${unchanged.length} files unchanged`);
    }
    
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
      console.log(`\nBackups created in ${CONFIG.BACKUP_DIR}/`);
    }
  }
}

async function validateEnvironment(options) {
  if (!options.contentPrompt && !options.filenamePrompt) {
    throw new Error('Must specify at least one of --content-prompt or --filename-prompt');
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set');
  }

  try {
    await fs.access(options.directory);
  } catch {
    throw new Error(`Directory ${options.directory} does not exist`);
  }
}

async function getFilePaths(directory, ignorePattern, recursive = true) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  let files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    
    if (entry.name.startsWith('.') || (ignorePattern && entry.name.match(ignorePattern))) {
      continue;
    }

    if (entry.isDirectory() && recursive) {
      const subFiles = await getFilePaths(fullPath, ignorePattern, recursive);
      files = files.concat(subFiles);
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

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
    .option('--ignore <pattern>', 'Glob pattern of files to ignore')
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
    const filePaths = await getFilePaths(options.directory, options.ignore, options.recursive);
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
