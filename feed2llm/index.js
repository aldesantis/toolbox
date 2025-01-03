// This code is intended to be run in Node.js environment with ES modules
import * as cheerio from 'cheerio';
import { promises as fs } from 'fs';
import { Parser } from 'xml2js';
import axios from 'axios';
import TurndownService from 'turndown';
import path from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';
import ProgressBar from 'progress';
import { program } from 'commander';
import chalk from 'chalk';

// Get current directory when using ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Constants and defaults
const DEFAULTS = {
  concurrent: 5,
  requestDelay: 200,
  retryDelay: 1000,
  maxRetryDelay: 60000,
  maxRetries: 5,
  selector: 'article',
  model: 'claude-3-haiku-20240307'
};

// CLI configuration
program
  .name('feed-processor')
  .description('Process any XML feed and generate article summaries using Claude AI')
  .requiredOption('-f, --feed <url>', 'URL of the XML feed to process')
  .option('-k, --key <string>', 'Anthropic API key (can also use ANTHROPIC_API_KEY env var)')
  .option('-c, --concurrent <number>', 'Maximum concurrent requests', DEFAULTS.concurrent)
  .option('-d, --delay <number>', 'Delay between requests in ms', DEFAULTS.requestDelay)
  .option('-o, --output <path>', 'Output directory', './output')
  .option('--cache <path>', 'Cache directory', './.cache')
  .option('--selector <string>', 'CSS selector for article content', DEFAULTS.selector)
  .option('--model <string>', 'Claude model to use', DEFAULTS.model)
  .parse();

const options = program.opts();

// Directory setup
const dirs = {
  cache: path.resolve(options.cache),
  output: path.resolve(options.output),
  get articles() { return path.join(this.output, 'articles') },
  get summaries() { return path.join(this.output, 'summaries') },
  get articlesCache() { return path.join(this.cache, 'articles') },
  get summariesCache() { return path.join(this.cache, 'summaries') }
};

// Initialize clients
const anthropic = new Anthropic({
  apiKey: options.key || process.env.ANTHROPIC_API_KEY
});

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced'
});

// Rate-limited axios instance
const http = axios.create();
let lastRequestTime = Date.now();

http.interceptors.request.use(async (config) => {
  const now = Date.now();
  const waitTime = options.delay - (now - lastRequestTime);
  if (waitTime > 0) {
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  lastRequestTime = Date.now();
  return config;
});

// Helper functions
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const getFileName = title => title.replace(/[^a-z0-9]/gi, '_').toLowerCase();

const ensureDirs = () => Promise.all(
  Object.values(dirs).map(dir => fs.mkdir(dir, { recursive: true }))
);

async function withCache(cacheDir, id, generator) {
  try {
    const cached = await fs.readFile(
      path.join(cacheDir, `${id}.json`), 
      'utf8'
    ).then(JSON.parse);
    return cached;
  } catch (error) {
    const result = await generator();
    await fs.writeFile(
      path.join(cacheDir, `${id}.json`),
      JSON.stringify({ 
        ...result, 
        timestamp: new Date().toISOString() 
      }, null, 2)
    );
    return result;
  }
}

async function withRetry(operation, { retryCount = 0, delay = DEFAULTS.retryDelay } = {}) {
  try {
    return await operation();
  } catch (error) {
    if (error.message.includes('rate_limit_error') && retryCount < DEFAULTS.maxRetries) {
      const nextDelay = Math.min(delay * 2, DEFAULTS.maxRetryDelay);
      console.log(`\n${chalk.yellow('⚠')} Rate limit hit. Waiting ${nextDelay/1000}s before retry ${retryCount + 1}/${DEFAULTS.maxRetries}`);
      await sleep(nextDelay);
      return withRetry(operation, { retryCount: retryCount + 1, delay: nextDelay });
    }
    throw error;
  }
}

async function getFeedMetadata(feed) {
  const channel = feed.rss?.channel?.[0] || feed.feed;
  return {
    title: channel.title?.[0] || channel.title || 'Unknown Feed',
    description: channel.description?.[0] || channel.subtitle || '',
    link: channel.link?.[0]?.href || channel.link?.[0] || ''
  };
}

async function extractContent(html, url) {
  const $ = cheerio.load(html);
  const content = $(options.selector).html();
  
  if (!content) {
    throw new Error(`No content found with selector: ${options.selector}`);
  }

  return turndownService.turndown(content)
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\[(?:Click here|Read more)\]\([^)]+\)/gi, '')
    .trim();
}

async function getSummary(content, title) {
  return withRetry(async () => {
    const response = await anthropic.messages.create({
      model: options.model,
      max_tokens: 1000,
      system: 'Provide a concise 2-3 paragraph summary of the article, focusing on the main points and key takeaways. Do not include any preamble or explanation - respond only with the summary content.',
      messages: [{
        role: 'user',
        content: `Title: ${title}\n\n${content}`
      }]
    });
    return response.content[0].text;
  });
}

async function getMetaSummary(summaries, feedTitle) {
  return withRetry(async () => {
    const prompt = `I have summaries from multiple articles from ${feedTitle}. 
    Please analyze these summaries and create a meta-summary that:
    1. Identifies the main themes and patterns across the articles
    2. Highlights the key insights that appear repeatedly
    3. Synthesizes the overall perspective and approach

    Here are the summaries:

    ${summaries.map(s => `Title: ${s.title}\n${s.summary}\n---\n`).join('\n')}`;

    const response = await anthropic.messages.create({
      model: options.model,
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }]
    });
    return response.content[0].text;
  });
}

async function processArticle(item, progressBar) {
  const title = item.title?.[0] || 'Untitled';
  const url = item.link?.[0]?.href || item.link?.[0] || '';
  const id = url.split('/').slice(-2)[0] || Buffer.from(url).toString('base64');

  try {
    // Get content (from cache or fetch)
    const { content } = await withCache(
      dirs.articlesCache,
      id,
      async () => {
        const response = await http.get(url);
        return {
          title,
          url,
          content: await extractContent(response.data, url)
        };
      }
    );

    // Get summary (from cache or generate)
    const { summary } = await withCache(
      dirs.summariesCache,
      id,
      async () => ({
        title,
        summary: await getSummary(content, title)
      })
    );

    // Save files
    const baseName = `${getFileName(title)}.md`;
    await Promise.all([
      fs.writeFile(path.join(dirs.articles, baseName), content),
      summary && fs.writeFile(path.join(dirs.summaries, baseName), summary)
    ]);

    progressBar.tick({ title: title.slice(0, 40).padEnd(40) });
    process.stdout.write('\x1B[?25l');

    return summary ? { title, summary, url } : null;

  } catch (error) {
    console.log(`\n${chalk.yellow('⚠')} Error processing "${title}": ${error.message}`);
    return null;
  }
}

async function processArticles(articles) {
  const progressBar = new ProgressBar('Processing articles [:bar] :current/:total :percent :etas [:title]', {
    complete: '=',
    incomplete: ' ',
    width: 30,
    total: articles.length,
    stream: process.stdout,
    clear: false,
    renderThrottle: 50
  });

  const results = [];
  for (let i = 0; i < articles.length; i += options.concurrent) {
    const chunk = articles.slice(i, i + options.concurrent);
    const chunkResults = await Promise.all(
      chunk.map(article => processArticle(article, progressBar))
    );
    results.push(...chunkResults.filter(Boolean));
  }

  process.stdout.write('\x1B[?25h');
  return results;
}

async function saveMetaSummary(metaSummary, feedMetadata, summaries) {
  const content = `# Meta-Summary of ${feedMetadata.title}

## Feed Information
- Title: ${feedMetadata.title}
- Description: ${feedMetadata.description}
- URL: ${feedMetadata.link}

## Content Analysis

${metaSummary}

## Individual Article Summaries

${summaries.map(s => `### ${s.title}\n${s.url}\n\n${s.summary}\n\n---\n`).join('\n')}`;

  await fs.writeFile(path.join(dirs.output, 'summary.md'), content);
  console.log(chalk.green('✓ Saved meta-summary'));
}

async function main() {
  try {
    if (!options.key && !process.env.ANTHROPIC_API_KEY) {
      throw new Error('Anthropic API key must be provided via --key option or ANTHROPIC_API_KEY environment variable');
    }

    console.log(chalk.blue('Fetching feed from', options.feed));
    const response = await http.get(options.feed);
    console.log(chalk.green('Feed fetched successfully, starting processing...\n'));

    await ensureDirs();

    const feed = await new Parser().parseStringPromise(response.data);
    const feedMetadata = await getFeedMetadata(feed);
    
    console.log(chalk.blue('\nFeed Information:'));
    console.log(`Title: ${chalk.bold(feedMetadata.title)}`);
    console.log(`Description: ${feedMetadata.description}\n`);

    const articles = feed.rss?.channel?.[0]?.item || feed.feed?.entry || [];
    console.log(chalk.blue(`Found ${articles.length} articles to process\n`));

    const summaries = await processArticles(articles);

    if (summaries.length > 0) {
      console.log('\nGenerating meta-summary...');
      const metaSummary = await getMetaSummary(summaries, feedMetadata.title);
      await saveMetaSummary(metaSummary, feedMetadata, summaries);
    }

    console.log(chalk.green('\nProcessing complete! ✨'));

  } catch (error) {
    console.error(chalk.red('Error:', error.message));
    process.exit(1);
  }
}

main();
