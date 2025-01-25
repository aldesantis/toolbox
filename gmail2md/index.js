#!/usr/bin/env node

import { google } from 'googleapis';
import { program } from 'commander';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import TurndownService from 'turndown';
import { authenticate } from '@google-cloud/local-auth';
import cliProgress from 'cli-progress';
import colors from 'ansi-colors';

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
const PAGE_SIZE = 100;
const BATCH_SIZE = 10;

// Configure Turndown with custom rules for email cleaning
const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced'
});

// Add rules to remove email quotes and signatures
turndown.addRule('removeQuotes', {
  filter: node => {
    // Check if this is a quoted section
    if (node.classList?.contains('gmail_quote') ||
        node.classList?.contains('yahoo_quoted') ||
        node.classList?.contains('gmail_extra') ||
        node.classList?.contains('ms-outlook-quote') ||
        node.getAttribute('type') === 'cite' ||
        node.classList?.contains('MsoNormal')) {
      return true;
    }
    
    // Check for Outlook/Exchange style quotes
    const style = node.getAttribute('style') || '';
    if (style.includes('margin-left: 40px') || 
        style.includes('border-left')) {
      return true;
    }

    return false;
  },
  replacement: () => '' // Remove the content entirely
});

turndown.addRule('removeSignatures', {
  filter: node => {
    return node.classList?.contains('signature') ||
           node.classList?.contains('gmail_signature');
  },
  replacement: () => ''
});

turndown.addRule('removeHidden', {
  filter: node => {
    const style = node.getAttribute('style') || '';
    return style.includes('display: none');
  },
  replacement: () => ''
});

program
  .name('gmail2md')
  .description('Export Gmail threads for a given date range as Markdown')
  .requiredOption('-s, --start <date>', 'Start date (YYYY-MM-DD)')
  .requiredOption('-e, --end <date>', 'End date (YYYY-MM-DD)')
  .option('-o, --output <directory>', 'Output directory', './emails')
  .option('-q, --query <string>', 'Additional Gmail search query')
  .option('-b, --batch-size <number>', 'Number of threads to process in parallel', BATCH_SIZE)
  .parse(process.argv);

const options = program.opts();

// Validate dates
function isValidDate(dateString) {
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date);
}

if (!isValidDate(options.start) || !isValidDate(options.end)) {
  console.error('Error: Invalid date format. Please use YYYY-MM-DD');
  process.exit(1);
}

const startDate = new Date(options.start);
const endDate = new Date(options.end);

if (endDate < startDate) {
  console.error('Error: End date must be after start date');
  process.exit(1);
}

async function getGmailClient() {
  try {
    const auth = await authenticate({
      scopes: SCOPES,
      keyfilePath: path.join(process.cwd(), 'credentials.json')
    });
    
    return google.gmail({ version: 'v1', auth });
  } catch (error) {
    console.error('Error authenticating with Gmail:', error.message);
    process.exit(1);
  }
}

async function listThreads(gmail, query, pageToken = null) {
  try {
    const dateQuery = `after:${options.start} before:${options.end}`;
    const fullQuery = options.query 
      ? `${dateQuery} ${options.query}`
      : dateQuery;

    const response = await gmail.users.threads.list({
      userId: 'me',
      q: fullQuery,
      maxResults: PAGE_SIZE,
      pageToken: pageToken
    });

    return response.data;
  } catch (error) {
    console.error('Error listing threads:', error.message);
    process.exit(1);
  }
}

async function getThread(gmail, threadId) {
  try {
    const response = await gmail.users.threads.get({
      userId: 'me',
      id: threadId,
      format: 'full'
    });

    return response.data;
  } catch (error) {
    console.error(`Error fetching thread ${threadId}:`, error.message);
    return null;
  }
}

function findBodyPart(parts) {
  if (!parts) return null;
  
  // First try to find HTML part
  const htmlPart = parts.find(part => part.mimeType === 'text/html');
  if (htmlPart) return htmlPart;

  // Then try to find plain text part
  const textPart = parts.find(part => part.mimeType === 'text/plain');
  if (textPart) return textPart;

  // If no direct match, search through multipart sections
  for (const part of parts) {
    if (part.parts) {
      const nestedPart = findBodyPart(part.parts);
      if (nestedPart) return nestedPart;
    }
  }

  return null;
}

function decodeMessagePart(part) {
  if (!part) return '';
  
  if (part.body.data) {
    return Buffer.from(part.body.data, 'base64').toString('utf-8');
  }
  
  if (part.parts) {
    const bodyPart = findBodyPart(part.parts);
    if (bodyPart) {
      return decodeMessagePart(bodyPart);
    }
  }
  
  return '';
}

function extractMessageContent(message) {
  const headers = message.payload.headers;
  const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
  const from = headers.find(h => h.name === 'From')?.value || 'Unknown Sender';
  const to = headers.find(h => h.name === 'To')?.value || 'Unknown Recipient';
  const date = headers.find(h => h.name === 'Date')?.value || '';
  
  // Get the message content from the payload
  let content = decodeMessagePart(message.payload);
  
  // If the content is HTML, convert it to Markdown
  if (message.payload.mimeType === 'text/html' || 
      content.trim().startsWith('<')) {
    content = turndown.turndown(content);
  } else {
    // For plain text, just clean up quoted content
    content = content.split(/^On .+ wrote:$/m)[0].trim();
  }

  return {
    subject,
    from,
    to,
    date,
    content
  };
}

function createThreadMarkdown(thread) {
  if (!thread.messages || thread.messages.length === 0) {
    return null;
  }

  const firstMessage = extractMessageContent(thread.messages[0]);
  const threadDate = new Date(firstMessage.date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  let markdown = `# ${firstMessage.subject}\n\n`;
  markdown += `**Thread Date:** ${threadDate}\n`;
  markdown += `**Messages:** ${thread.messages.length}\n\n`;
  markdown += `---\n\n`;

  // Process each message in the thread
  for (const message of thread.messages) {
    const email = extractMessageContent(message);
    const messageDate = new Date(email.date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    markdown += `## ${messageDate}\n\n`;
    markdown += `**From:** ${email.from}\n`;
    markdown += `**To:** ${email.to}\n\n`;
    markdown += `${email.content}\n\n`;
    markdown += `---\n\n`;
  }

  return {
    subject: firstMessage.subject,
    date: firstMessage.date,
    content: markdown
  };
}

async function saveThread(thread, outputDir) {
  const date = new Date(thread.date);
  const baseFileName = `${date.toISOString().split('T')[0]}_${thread.subject.replace(/[^a-zA-Z0-9]/g, '_')}`;
  const filePath = path.join(outputDir, `${baseFileName}.md`);
  await writeFile(filePath, thread.content);
  return baseFileName;
}

async function processThreadBatch(gmail, threadInfos, outputDir) {
  const results = await Promise.all(
    threadInfos.map(async (threadInfo) => {
      try {
        const fullThread = await getThread(gmail, threadInfo.id);
        if (!fullThread) return { success: false };

        const threadData = createThreadMarkdown(fullThread);
        if (!threadData) return { success: false };

        const fileName = await saveThread(threadData, outputDir);
        return { success: true, fileName };
      } catch (error) {
        console.error(`Error processing thread ${threadInfo.id}:`, error.message);
        return { success: false };
      }
    })
  );

  return results.reduce(
    (acc, result) => ({
      processed: acc.processed + (result.success ? 1 : 0),
      skipped: acc.skipped + (result.success ? 0 : 1)
    }),
    { processed: 0, skipped: 0 }
  );
}

async function exportThreads() {
  console.log(`Exporting email threads from ${options.start} to ${options.end}...`);
  
  const gmail = await getGmailClient();
  let pageToken = null;
  let totalProcessed = 0;
  let totalSkipped = 0;
  
  // Create progress bar
  const progressBar = new cliProgress.MultiBar({
    format: '{bar} {percentage}% | {value}/{total} Threads | {status}',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true,
    clearOnComplete: false
  }, cliProgress.Presets.shades_classic);

  try {
    // Get total thread count first
    const initialThreads = await listThreads(gmail, null);
    const totalThreads = initialThreads.threads?.length || 0;
    
    // Create progress bars for processed and skipped threads
    const mainProgress = progressBar.create(totalThreads, 0, { status: colors.cyan('Processing...') });
    
    await mkdir(options.output, { recursive: true });
    
    do {
      const threads = await listThreads(gmail, pageToken);
      const threadList = threads.threads || [];
      
      // Process threads in batches
      for (let i = 0; i < threadList.length; i += options.batchSize) {
        const batch = threadList.slice(i, i + options.batchSize);
        const { processed, skipped } = await processThreadBatch(gmail, batch, options.output);
        
        totalProcessed += processed;
        totalSkipped += skipped;
        
        // Update progress bar
        mainProgress.update(totalProcessed, { 
          status: colors.cyan(`Processed: ${totalProcessed} | Skipped: ${totalSkipped}`)
        });
      }
      
      pageToken = threads.nextPageToken;
    } while (pageToken);

    // Stop progress bar
    progressBar.stop();
    
    console.log(`\nExport completed successfully:`);
    console.log(`- Exported threads: ${totalProcessed}`);
    console.log(`- Skipped threads: ${totalSkipped}`);
    console.log(`- Output directory: ${options.output}`);
  } catch (error) {
    console.error('Error exporting threads:', error.message);
    process.exit(1);
  }
}

exportThreads().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
