import fs from 'fs/promises';
import path from 'path';
import { CONFIG } from './config.js';
import { glob } from 'glob';

export async function validateFilenameResponse(response, originalName) {
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

export async function validateContentResponse(response, originalContent) {
  // Remove any potential markdown code block formatting
  response = response.replace(/^```[\s\S]*?\n/, '').replace(/\n```$/, '');
  
  // If response is empty or significantly shorter, return original
  if (!response.trim() || response.length < originalContent.length * 0.1) {
    throw new Error('Invalid content transformation: Response too short or empty');
  }
  
  return response;
}

export async function validateEnvironment(options) {
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

export async function getFilePaths(directory, pattern, recursive = true) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  let files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    
    if (entry.name.startsWith('.')) {
      continue;
    }

    if (entry.isDirectory() && recursive) {
      const subFiles = await getFilePaths(fullPath, pattern, recursive);
      files = files.concat(subFiles);
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  if (pattern) {
    files = files.filter(file => glob.sync(pattern, { cwd: directory }).includes(path.relative(directory, file)));
  }

  return files;
}
