#!/usr/bin/env node

const fetch = require('node-fetch');
const cheerio = require('cheerio');
const commander = require('commander');

// Set up command line interface
const program = new commander.Command();
program
  .name('trustpilot-scraper')
  .description('Scrape reviews from Trustpilot for a specific domain')
  .argument('<domain>', 'domain to scrape (e.g., example.com)')
  .option('-o, --output <file>', 'output file (default: stdout)')
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

// Main execution
(async () => {
  try {
    const domain = program.args[0];
    const reviews = await getAllReviews(domain);
    
    // Output results
    const output = {
      domain,
      total_reviews: reviews.length,
      reviews
    };
    
    if (program.opts().output) {
      const fs = require('fs');
      fs.writeFileSync(program.opts().output, JSON.stringify(output, null, 2));
      console.error(`Wrote ${reviews.length} reviews to ${program.opts().output}`);
    } else {
      console.log(JSON.stringify(output, null, 2));
    }
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
})();
