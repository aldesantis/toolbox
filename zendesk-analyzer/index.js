#!/usr/bin/env node

const fetch = require('node-fetch');
const commander = require('commander');
const fs = require('fs');
const ProgressBar = require('progress');

// Set up command line interface
const program = new commander.Command();
program
  .name('zendesk-analyzer')
  .description('Fetch and analyze tickets from Zendesk for the last 12 months')
  .argument('<subdomain>', 'your Zendesk subdomain (e.g., company in company.zendesk.com)')
  .requiredOption('-e, --email <email>', 'email address for Zendesk API authentication')
  .requiredOption('-k, --api-key <key>', 'API key for Zendesk API authentication')
  .option('-o, --output <file>', 'output file (default: stdout)')
  .option('-f, --format <format>', 'output format (json or markdown)', 'json')
  .option('-p, --page-size <size>', 'number of tickets per page', '100')
  .option('-m, --max-tickets <number>', 'maximum number of tickets to fetch (default: all)')
  .option('--start-date <date>', 'start date for ticket search (format: YYYY-MM-DD)')
  .option('--end-date <date>', 'end date for ticket search (format: YYYY-MM-DD, default: today)')
  .option('--audio', 'enable processing of audio tickets (default: false)')
  .version('1.0.0');

program.parse();

async function fetchTickets(subdomain, email, apiKey, pageSize, maxTickets, startDate, endDate, processAudio) {
  const allTickets = [];
  let hasMore = true;
  let nextPage = null;
  
  // Use provided start date or calculate date 12 months ago
  let dateString;
  if (startDate) {
    dateString = startDate;
  } else {
    const date = new Date();
    date.setMonth(date.getMonth() - 12);
    dateString = date.toISOString().split('T')[0];
  }
  
  // Add end date to query if provided
  let dateQuery = `created>${dateString}`;
  if (endDate) {
    dateQuery += ` created<=${endDate}`;
  }
  
  console.error('Starting to fetch tickets...');
  
  // Initialize progress bar with unknown total
  let progressBar;
  let totalTickets;
  
  while (hasMore) {
    let url;
    if (nextPage) {
      url = nextPage;
    } else {
      url = `https://${subdomain}.zendesk.com/api/v2/search.json?query=type:ticket ${dateQuery}&sort_by=created_at&sort_order=desc&per_page=${pageSize}`;
    }
    
    try {
      const auth = Buffer.from(`${email}/token:${apiKey}`).toString('base64');
      const response = await fetch(url, {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API request failed with status ${response.status}: ${errorText}`);
      }
      
      const data = await response.json();
      
      // Initialize progress bar with total count from first response
      if (!progressBar && data.count) {
        totalTickets = maxTickets ? Math.min(data.count, maxTickets) : data.count;
        progressBar = new ProgressBar('Fetching tickets [:bar] :current/:total (:percent) - :etas remaining', {
          complete: '=',
          incomplete: ' ',
          width: 30,
          total: totalTickets
        });
        console.error(`Found ${data.count} tickets in total, fetching up to ${totalTickets}...`);
      }
      
      if (data.results && data.results.length > 0) {
        // Check if we need to limit the results based on maxTickets
        let resultsToProcess = [...data.results];
        if (maxTickets && allTickets.length + resultsToProcess.length > maxTickets) {
          // Only process enough tickets to reach the max limit
          resultsToProcess = resultsToProcess.slice(0, maxTickets - allTickets.length);
        }
        
        // Only fetch comments if audio processing is enabled
        if (processAudio) {
          // Filter for tickets that have via.channel as "voice" or have voice-related tags
          const audioTickets = resultsToProcess.filter(ticket => 
            (ticket.via && ticket.via.channel === 'voice') || 
            (ticket.tags && ticket.tags.some(tag => tag.includes('voice') || tag.includes('call') || tag.includes('audio')))
          );
          
          if (audioTickets.length > 0) {
            // Create a separate progress bar for comments if we have audio tickets
            const commentsBar = new ProgressBar('Fetching comments for audio tickets [:bar] :current/:total (:percent)', {
              complete: '=',
              incomplete: ' ',
              width: 30,
              total: audioTickets.length
            });
            
            for (const ticket of audioTickets) {
              // Fetch comments for each audio ticket
              const commentsUrl = `https://${subdomain}.zendesk.com/api/v2/tickets/${ticket.id}/comments.json`;
              const commentsResponse = await fetch(commentsUrl, {
                headers: {
                  'Authorization': `Basic ${auth}`,
                  'Content-Type': 'application/json'
                }
              });
              
              if (commentsResponse.ok) {
                const commentsData = await commentsResponse.json();
                ticket.comments = commentsData.comments;
              }
              
              commentsBar.tick();
              
              // Add a small delay between comment requests
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          } else {
            console.error('No audio tickets found in this batch');
          }
        }
        
        allTickets.push(...resultsToProcess);
        
        // Update the main progress bar
        if (progressBar) {
          progressBar.tick(resultsToProcess.length);
        } else {
          console.error(`Fetched ${resultsToProcess.length} tickets. Total: ${allTickets.length}`);
        }
        
        // Check if we've reached the maximum number of tickets
        if (maxTickets && allTickets.length >= maxTickets) {
          hasMore = false;
          console.error(`\nReached maximum number of tickets (${maxTickets})`);
        } else if (data.next_page) {
          nextPage = data.next_page;
          // Add a small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          hasMore = false;
          console.error('\nNo more tickets to fetch');
        }
      } else {
        hasMore = false;
        console.error('No tickets found or empty response');
      }
    } catch (error) {
      console.error('\nError fetching tickets:', error.message);
      hasMore = false;
    }
  }
  
  return allTickets;
}

function formatAsMarkdown(data) {
  const { subdomain, total_tickets, tickets, processAudio } = data;
  let markdown = `# Zendesk Voice Tickets for ${subdomain}.zendesk.com\n\n`;
  markdown += `Total tickets: ${total_tickets}\n\n`;
  
  tickets.forEach(ticket => {
    markdown += `## Ticket #${ticket.id}: ${ticket.subject}\n\n`;
    markdown += `**Status:** ${ticket.status}  \n`;
    markdown += `**Priority:** ${ticket.priority || 'None'}  \n`;
    markdown += `**Created:** ${new Date(ticket.created_at).toLocaleString()}  \n`;
    markdown += `**Updated:** ${new Date(ticket.updated_at).toLocaleString()}  \n`;
    
    if (ticket.assignee_id) {
      markdown += `**Assignee ID:** ${ticket.assignee_id}  \n`;
    }
    
    if (ticket.requester_id) {
      markdown += `**Requester ID:** ${ticket.requester_id}  \n`;
    }
    
    if (ticket.tags && ticket.tags.length > 0) {
      markdown += `**Tags:** ${ticket.tags.join(', ')}  \n`;
    }
    
    markdown += `\n### Description\n\n`;
    markdown += `${ticket.description || 'No description provided'}\n\n`;
    
    // Add comments/transcripts section if audio processing is enabled
    if (processAudio && ticket.comments && ticket.comments.length > 0) {
      markdown += `### Call Transcript\n\n`;
      ticket.comments.forEach(comment => {
        if (comment.voice_comment) {
          markdown += `**${new Date(comment.created_at).toLocaleString()}**\n`;
          markdown += `Duration: ${comment.voice_comment.duration} seconds\n`;
          markdown += `Recording URL: ${comment.voice_comment.recording_url || 'Not available'}\n`;
          markdown += `Transcription: ${comment.voice_comment.transcription_text || 'Not available'}\n\n`;
        }
      });
    }
    
    markdown += `---\n\n`;
  });
  
  return markdown;
}

// Main execution
(async () => {
  try {
    const options = program.opts();
    const subdomain = program.args[0];
    const email = options.email;
    const apiKey = options.apiKey;
    const pageSize = parseInt(options.pageSize, 10);
    const maxTickets = options.maxTickets ? parseInt(options.maxTickets, 10) : null;
    const format = options.format.toLowerCase();
    const startDate = options.startDate;
    const endDate = options.endDate;
    const processAudio = options.audio || false;
    
    if (processAudio) {
      console.error('Audio processing enabled - will fetch and process voice comments');
    } else {
      console.error('Audio processing disabled - skipping voice comments');
    }
    
    const tickets = await fetchTickets(subdomain, email, apiKey, pageSize, maxTickets, startDate, endDate, processAudio);
    
    console.error(`\nFound ${tickets.length} tickets. Processing export...`);
    
    // Output results
    const output = {
      subdomain,
      total_tickets: tickets.length,
      tickets,
      processAudio
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
    
    if (options.output) {
      fs.writeFileSync(options.output, formattedOutput);
      console.error(`Wrote ${tickets.length} tickets to ${options.output} in ${format} format`);
    } else {
      console.log(formattedOutput);
    }
    
    // Explicitly exit the process when done
    process.exit(0);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
})();
