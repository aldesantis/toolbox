#!/usr/bin/env node

const fetch = require('node-fetch');
const cheerio = require('cheerio');
const commander = require('commander');
const fs = require('fs');

// Set up command line interface
const program = new commander.Command();
program
  .name('trustpilot2json')
  .description('Scrape reviews from Trustpilot for a specific domain')
  .argument('<domain>', 'domain to scrape (e.g., example.com)')
  .option('-o, --output <file>', 'output file (default: stdout)')
  .option('-f, --format <format>', 'output format (json or markdown)', 'json')
  .version('1.0.0');

program.parse();

async function fetchPage(domain, page) {
  const url = `https://it.trustpilot.com/review/${domain}?date=last12months&sort=recency&page=${page}`;
  
  try {
    const response = await fetch(url);
    if (response.status === 404) {
      return null;
    }
    
    const html = await response.text();
    const $ = cheerio.load(html);
    
    // Find the script tag with business unit data
    const scriptContent = $('script[data-business-unit-json-ld]').html();
    if (!scriptContent) {
      console.error(`No business unit data found on page ${page}`);
      return null;
    }
    
    try {
      const data = JSON.parse(scriptContent);
      const reviews = data['@graph'].filter((entity) => entity['@type'] === 'Review');

      // Find all review entities
      const reviewMap = new Map();
      reviews.forEach(entity => {
        if (entity['@type'] === 'Review') {
          reviewMap.set(entity['@id'], entity);
        }
      });
      
      // Map review references to actual review data
      return reviews
        .map(review => ({
          id: review['@id'],
          author: review.author.name,
          author_url: review.author.url,
          date: review.datePublished,
          title: review.headline,
          content: review.reviewBody,
          rating: review.reviewRating.ratingValue,
          language: review.inLanguage
        }));
    } catch (error) {
      console.error(`Failed to parse JSON on page ${page}:`, error);
      return null;
    }
  } catch (error) {
    console.error(`Failed to fetch page ${page}:`, error);
    return null;
  }
}

async function getAllReviews(domain) {
  const allReviews = [];
  let page = 1;
  let hasMore = true;
  
  console.error('Starting to fetch reviews...');
  
  while (hasMore) {
    console.error(`Fetching page ${page}...`);
    const reviews = await fetchPage(domain, page);
    
    if (!reviews) {
      hasMore = false;
    } else {
      allReviews.push(...reviews);
      page++;
      
      // Add a small delay to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  return allReviews;
}

function formatAsMarkdown(data) {
  const { domain, total_reviews, reviews } = data;
  let markdown = `# Trustpilot Reviews for ${domain}\n\n`;
  markdown += `Total reviews: ${total_reviews}\n\n`;
  
  reviews.forEach(review => {
    const stars = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating);
    markdown += `## ${review.title}\n\n`;
    markdown += `**Author:** [${review.author}](${review.author_url})  \n`;
    markdown += `**Date:** ${review.date}  \n`;
    markdown += `**Rating:** ${stars} (${review.rating}/5)  \n`;
    markdown += `**Language:** ${review.language}  \n\n`;
    markdown += `${review.content}\n\n`;
    markdown += `---\n\n`;
  });
  
  return markdown;
}

// Main execution
(async () => {
  try {
    const domain = program.args[0];
    const reviews = await getAllReviews(domain);
    const format = program.opts().format.toLowerCase();
    
    // Output results
    const output = {
      domain,
      total_reviews: reviews.length,
      reviews
    };
    
    let formattedOutput;
    if (format === 'markdown') {
      formattedOutput = formatAsMarkdown(output);
    } else if (format === 'json') {
      formattedOutput = JSON.stringify(output, null, 2);
    } else {
      console.error(`Unsupported format: ${format}. Using JSON as default.`);
      formattedOutput = JSON.stringify(output, null, 2);
    }
    
    if (program.opts().output) {
      fs.writeFileSync(program.opts().output, formattedOutput);
      console.error(`Wrote ${reviews.length} reviews to ${program.opts().output} in ${format} format`);
    } else {
      console.log(formattedOutput);
    }
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
})();
