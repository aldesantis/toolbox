#!/usr/bin/env node

import { program } from 'commander';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import fetch from 'node-fetch';

const BASE_URL = 'https://readwise.io/api/v2';
const DEFAULT_BATCH_SIZE = 100;

program
  .name('readwise2md')
  .description('Export Readwise highlights for a given date range as Markdown')
  .requiredOption('-s, --start <date>', 'Start date (YYYY-MM-DD)')
  .requiredOption('-e, --end <date>', 'End date (YYYY-MM-DD)')
  .option('-o, --output <directory>', 'Output directory', './highlights')
  .option('-b, --batch-size <number>', 'Number of results per page', DEFAULT_BATCH_SIZE)
  .parse(process.argv);

const options = program.opts();

// Check for API token in environment
const READWISE_TOKEN = process.env.READWISE_TOKEN;
if (!READWISE_TOKEN) {
  console.error('Error: READWISE_TOKEN environment variable is required');
  process.exit(1);
}

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

async function fetchHighlights(pageToken = null) {
  try {
    const params = new URLSearchParams({
      page_size: options.batchSize,
    });

    if (pageToken) {
      params.set('pageCursor', pageToken);
    }

    const response = await fetch(`${BASE_URL}/export/?${params.toString()}`, {
      headers: {
        'Authorization': `Token ${READWISE_TOKEN}`,
        'Content-Type': 'application/json',
      }
    });

    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }

    return response.json();
  } catch (error) {
    console.error('Error fetching highlights:', error.message);
    process.exit(1);
  }
}

function formatHighlight(highlight) {
  const date = new Date(highlight.highlighted_at || highlight.created_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  let markdown = '';
  markdown += `## ${date}\n\n`;
  markdown += `> ${highlight.text}\n\n`;
  
  if (highlight.note) {
    markdown += `**Note:** ${highlight.note}\n\n`;
  }

  if (highlight.tags && highlight.tags.length > 0) {
    const tags = highlight.tags.map(tag => `#${tag.name}`).join(' ');
    markdown += `**Tags:** ${tags}\n\n`;
  }

  markdown += `---\n\n`;
  return markdown;
}

function formatBook(book) {
  let markdown = `# ${book.title}\n\n`;
  
  if (book.author) {
    markdown += `**Author:** ${book.author}\n\n`;
  }

  if (book.category) {
    markdown += `**Category:** ${book.category}\n`;
  }

  if (book.source) {
    markdown += `**Source:** ${book.source}\n`;
  }

  if (book.source_url) {
    markdown += `**URL:** ${book.source_url}\n`;
  }

  markdown += `\n---\n\n`;
  
  // Add highlights
  for (const highlight of book.highlights) {
    if (isHighlightInDateRange(highlight)) {
      markdown += formatHighlight(highlight);
    }
  }

  return markdown;
}

function isHighlightInDateRange(highlight) {
  const date = new Date(highlight.highlighted_at || highlight.created_at);
  return date >= startDate && date <= endDate;
}

async function saveToFile(content, filename) {
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9]/g, '_');
  const filePath = path.join(options.output, `${sanitizedFilename}.md`);
  
  try {
    await writeFile(filePath, content, 'utf-8');
    console.log(`Saved ${filePath}`);
  } catch (error) {
    console.error(`Error saving ${filePath}:`, error.message);
  }
}

async function exportHighlights() {
  console.log(`Exporting highlights from ${options.start} to ${options.end}...`);
  
  try {
    await mkdir(options.output, { recursive: true });
    
    let nextPageCursor = null;
    let totalBooks = 0;
    let totalHighlights = 0;
    
    do {
      const data = await fetchHighlights(nextPageCursor);
      
      for (const book of data.results) {
        const relevantHighlights = book.highlights.filter(isHighlightInDateRange);
        
        if (relevantHighlights.length > 0) {
          const markdown = formatBook({
            ...book,
            highlights: relevantHighlights
          });
          
          await saveToFile(markdown, `${book.title}`);
          totalBooks++;
          totalHighlights += relevantHighlights.length;
        }
      }
      
      nextPageCursor = data.nextPageCursor;
    } while (nextPageCursor);
    
    console.log('\nExport completed successfully:');
    console.log(`- Books processed: ${totalBooks}`);
    console.log(`- Highlights exported: ${totalHighlights}`);
    console.log(`- Output directory: ${options.output}`);
    
  } catch (error) {
    console.error('Error during export:', error.message);
    process.exit(1);
  }
}

exportHighlights().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
