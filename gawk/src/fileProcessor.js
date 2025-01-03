import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';
import path from 'path';
import { fileTypeFromFile } from 'file-type';
import { createHash } from 'crypto';
import { CONFIG } from './config.js';
import { PROMPTS } from './prompts.js';
import cliProgress from 'cli-progress';
import colors from 'ansi-colors';

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

export default FileProcessor;
