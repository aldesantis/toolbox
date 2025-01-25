#!/usr/bin/env node

import fetch from 'node-fetch';
import { program } from 'commander';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

const FIREFLIES_API_KEY = process.env.FIREFLIES_API_KEY;
const BASE_URL = 'https://api.fireflies.ai/graphql';
const PAGE_SIZE = 50; // Maximum allowed by API

if (!FIREFLIES_API_KEY) {
  console.error('Error: FIREFLIES_API_KEY environment variable is not set');
  process.exit(1);
}

program
  .name('fireflies2md')
  .description('Download Fireflies transcripts for a given date range as Markdown')
  .requiredOption('-s, --start <date>', 'Start date (YYYY-MM-DD)')
  .requiredOption('-e, --end <date>', 'End date (YYYY-MM-DD)')
  .option('-o, --output <directory>', 'Output directory', './transcripts')
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

// GraphQL query with pagination parameters
const query = `
  query Transcripts($fromDate: DateTime!, $toDate: DateTime!, $limit: Int!, $skip: Int!) {
    transcripts(
      fromDate: $fromDate,
      toDate: $toDate,
      limit: $limit,
      skip: $skip
    ) {
      title
      date
      sentences {
        speaker_name
        text
        start_time
        end_time
      }
    }
  }
`;

async function fetchTranscriptsPage(startDate, endDate, skip) {
  try {
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${FIREFLIES_API_KEY}`,
      },
      body: JSON.stringify({
        query,
        variables: {
          fromDate: startDate.toISOString(),
          toDate: endDate.toISOString(),
          limit: PAGE_SIZE,
          skip: skip,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.errors) {
      throw new Error(data.errors[0].message);
    }

    return data.data.transcripts;
  } catch (error) {
    console.error('Error fetching transcripts:', error.message);
    process.exit(1);
  }
}

async function fetchAllTranscripts(startDate, endDate) {
  let allTranscripts = [];
  let skip = 0;
  let hasMore = true;

  while (hasMore) {
    console.log(`Fetching page ${skip / PAGE_SIZE + 1}...`);
    const transcripts = await fetchTranscriptsPage(startDate, endDate, skip);
    
    if (transcripts.length === 0) {
      hasMore = false;
    } else {
      allTranscripts = allTranscripts.concat(transcripts);
      skip += PAGE_SIZE;
    }
  }

  return allTranscripts;
}

function formatTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function convertToMarkdown(transcript) {
  const date = new Date(transcript.date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  let markdown = `# ${transcript.title} (${date})\n\n`;

  for (const sentence of transcript.sentences) {
    const time = formatTime(sentence.start_time);
    markdown += `[${time}] ${sentence.speaker_name}: ${sentence.text}\n`;
  }

  return markdown;
}

async function saveTranscripts(transcripts, outputDir) {
  try {
    await mkdir(outputDir, { recursive: true });
    let skippedCount = 0;

    for (const transcript of transcripts) {
      if (!transcript.sentences) {
        skippedCount++;
        continue;
      }

      const fileName = `${transcript.date}_${transcript.title.replace(/[^a-zA-Z0-9]/g, '_')}.md`;
      const filePath = path.join(outputDir, fileName);
      
      const markdown = convertToMarkdown(transcript);
      await writeFile(filePath, markdown);
      console.log(`Saved transcript: ${fileName}`);
    }

    const savedCount = transcripts.length - skippedCount;
    console.log(`\nSuccessfully downloaded ${savedCount} transcripts to ${outputDir}`);
    if (skippedCount > 0) {
      console.log(`Skipped ${skippedCount} transcripts with no content`);
    }
  } catch (error) {
    console.error('Error saving transcripts:', error.message);
    process.exit(1);
  }
}

async function main() {
  console.log(`Fetching transcripts from ${options.start} to ${options.end}...`);
  
  const transcripts = await fetchAllTranscripts(startDate, endDate);
  
  if (transcripts.length === 0) {
    console.log('No transcripts found for the specified date range.');
    process.exit(0);
  }

  await saveTranscripts(transcripts, options.output);
}

main().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
