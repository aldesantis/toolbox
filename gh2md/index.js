#!/usr/bin/env node

import { Octokit } from '@octokit/rest';
import { program } from 'commander';
import colors from 'ansi-colors';
import cliProgress from 'cli-progress';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

const PAGE_SIZE = 100;

program
  .name('gh2md')
  .description('Export GitHub activity for a given date range')
  .requiredOption('-s, --start <date>', 'Start date (YYYY-MM-DD)')
  .requiredOption('-e, --end <date>', 'End date (YYYY-MM-DD)')
  .option('-o, --output <directory>', 'Output directory', './activity')
  .option('-b, --batch-size <number>', 'Number of items to process in parallel', 10)
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

function getGitHubClient() {
  if (!process.env.GITHUB_TOKEN) {
    console.error('Error: GITHUB_TOKEN environment variable is required');
    process.exit(1);
  }

  return new Octokit({
    auth: process.env.GITHUB_TOKEN
  });
}

async function fetchUserEvents(octokit, username, since, until, progressBar) {
  const events = [];
  let page = 1;
  
  try {
    while (true) {
      const response = await octokit.activity.listEventsForAuthenticatedUser({
        username,
        per_page: PAGE_SIZE,
        page
      });
      
      const filteredEvents = response.data.filter(event => {
        const eventDate = new Date(event.created_at);
        return eventDate >= since && eventDate <= until;
      });
      
      events.push(...filteredEvents);
      progressBar.increment(filteredEvents.length);
      
      if (response.data.length < PAGE_SIZE || 
          new Date(response.data[response.data.length - 1].created_at) < since) {
        break;
      }
      
      page++;
    }
    
    progressBar.setTotal(events.length);
    return events;
  } catch (error) {
    console.error('Error fetching events:', error.message);
    return [];
  }
}

async function fetchPullRequests(octokit, since, until, progressBar) {
  const prs = [];
  let page = 1;
  
  try {
    while (true) {
      const response = await octokit.search.issuesAndPullRequests({
        q: `is:pr author:@me created:${since.toISOString().split('T')[0]}..${until.toISOString().split('T')[0]}`,
        per_page: PAGE_SIZE,
        page
      });
      
      prs.push(...response.data.items);
      progressBar.increment(response.data.items.length);
      
      if (response.data.items.length < PAGE_SIZE) {
        break;
      }
      
      page++;
    }
    
    progressBar.setTotal(prs.length);
    return prs;
  } catch (error) {
    console.error('Error fetching pull requests:', error.message);
    return [];
  }
}

async function fetchCommitDetails(octokit, commit, progressBar) {
  try {
    if (!commit.repository || !commit.repository.full_name) {
      console.error('Invalid commit object:', commit);
      progressBar.increment();
      return null;
    }

    const [owner, repo] = commit.repository.full_name.split('/');
    const response = await octokit.repos.getCommit({
      owner,
      repo,
      ref: commit.sha,
    });
    
    progressBar.increment();

    if (!commit.commit || !commit.commit.message || !commit.html_url) {
      console.error('Commit is missing required properties:', {
        hasCommit: !!commit.commit,
        hasMessage: !!(commit.commit && commit.commit.message),
        hasUrl: !!commit.html_url
      });
      return null;
    }
    
    const ignoredFiles = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];
    const details = {
      message: commit.commit.message,
      url: commit.html_url,
      repository: commit.repository.full_name,
      date: commit.commit.author.date,
      diff: response.data.files
      .filter(file => !ignoredFiles.some(ignoredFile => file.filename.endsWith(ignoredFile)))
      .map(file => ({
        filename: file.filename,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        patch: file.patch || ''
      }))
    };

    return details;
  } catch (error) {
    console.error(`\nError fetching commit details for ${commit.sha} in ${commit.repository?.full_name}:`);
    console.error('Error message:', error.message);
    console.error('Error status:', error.response?.status);
    console.error('Error data:', error.response?.data);
    
    if (error.response?.status === 404) {
      console.error('This could be because:');
      console.error('1. The repository is private and your token lacks access');
      console.error('2. The repository has been deleted or archived');
      console.error('3. The commit no longer exists');
    }
    
    progressBar.increment();
    return null;
  }
}

async function fetchCommits(octokit, since, until, progressBar) {
  const commits = [];
  let page = 1;
  
  try {
    const { data: user } = await octokit.users.getAuthenticated();
    
    while (true) {
      const searchQuery = `author:${user.login} committer:${user.login} committer-date:${since.toISOString().split('T')[0]}..${until.toISOString().split('T')[0]}`;
      
      const response = await octokit.rest.search.commits({
        q: searchQuery,
        sort: 'committer-date',
        order: 'desc',
        per_page: PAGE_SIZE,
        page
      });
      
      if (response.data.items.length > 0) {
        commits.push(...response.data.items);
        progressBar.increment(response.data.items.length);
      }
      
      if (response.data.items.length < PAGE_SIZE) {
        break;
      }
      
      page++;
    }
    
    progressBar.setTotal(commits.length);
    progressBar.update(0, { status: colors.cyan('Fetching commit details...') });

    const batchSize = 10;
    const commitDetails = [];
    
    for (let i = 0; i < commits.length; i += batchSize) {
      const batch = commits.slice(i, i + batchSize);
      const batchDetails = await Promise.all(
        batch.map(commit => fetchCommitDetails(octokit, commit, progressBar))
      );
      commitDetails.push(...batchDetails.filter(Boolean));
      
      if (i + batchSize < commits.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    return commitDetails;
  } catch (error) {
    console.error('\nError fetching commits:', error.message);
    if (error.response?.data?.errors) {
      console.error('Search API errors:', error.response.data.errors);
    }
    if (error.response?.data?.documentation_url) {
      console.error('API documentation:', error.response.data.documentation_url);
    }
    return [];
  }
}

async function fetchIssues(octokit, since, until, progressBar) {
  const issues = [];
  let page = 1;
  
  try {
    while (true) {
      const response = await octokit.search.issuesAndPullRequests({
        q: `is:issue author:@me created:${since.toISOString().split('T')[0]}..${until.toISOString().split('T')[0]}`,
        per_page: PAGE_SIZE,
        page
      });
      
      issues.push(...response.data.items);
      progressBar.increment(response.data.items.length);
      
      if (response.data.items.length < PAGE_SIZE) {
        break;
      }
      
      page++;
    }
    
    progressBar.setTotal(issues.length);
    return issues;
  } catch (error) {
    console.error('Error fetching issues:', error.message);
    return [];
  }
}

function createActivityMarkdown(summary, date) {
  const dateRange = `${date}`;
  let markdown = `# GitHub Activity Summary (${dateRange})\n\n`;

  markdown += `## Pull Requests\n\n`;
  markdown += `**Total:** ${summary.pullRequests.total} `;
  markdown += `(${summary.pullRequests.merged} merged, `;
  markdown += `${summary.pullRequests.open} open, `;
  markdown += `${summary.pullRequests.closed} closed)\n\n`;
  
  summary.pullRequests.details.forEach(pr => {
    markdown += `### ${pr.title}\n`;
    markdown += `- Repository: ${pr.repository}\n`;
    markdown += `- Status: ${pr.state}\n`;
    markdown += `- URL: ${pr.url}\n\n`;
  });

  markdown += `## Commits\n\n`;
  markdown += `**Total:** ${summary.commits.total}\n\n`;
  
  summary.commits.details.forEach(commit => {
    markdown += `### ${commit.repository}: ${commit.message.split('\n')[0]}\n`;
    markdown += `URL: ${commit.url}\n\n`;
    
    if (commit.diff && commit.diff.length > 0) {
      markdown += `#### Changes\n\n`;
      commit.diff.forEach(file => {
        markdown += `**${file.filename}** (${file.additions} additions, ${file.deletions} deletions)\n`;
        if (file.patch) {
          markdown += '```diff\n' + file.patch + '\n```\n\n';
        }
      });
    }
    markdown += '\n';
  });

  markdown += `## Issues\n\n`;
  markdown += `**Total:** ${summary.issues.total} `;
  markdown += `(${summary.issues.open} open, ${summary.issues.closed} closed)\n\n`;
  
  summary.issues.details.forEach(issue => {
    markdown += `### ${issue.title}\n`;
    markdown += `- Repository: ${issue.repository}\n`;
    markdown += `- Status: ${issue.state}\n`;
    markdown += `- URL: ${issue.url}\n\n`;
  });

  markdown += `## Starred Repositories\n\n`;
  markdown += `**Total:** ${summary.stars.total}\n\n`;
  
  summary.stars.repositories.forEach(repo => {
    markdown += `### ${repo.name}\n`;
    if (repo.description) {
      markdown += `${repo.description}\n\n`;
    }
    markdown += `URL: ${repo.url}\n\n`;
  });

  return markdown;
}

async function saveOutput(content, outputDir, date) {
  const fileName = `${date}.md`;
  const filePath = path.join(outputDir, fileName);
  await writeFile(filePath, content);
  return fileName;
}

async function exportGitHubActivity() {
  console.log(`Exporting GitHub activity from ${options.start} to ${options.end}...`);
  
  const octokit = getGitHubClient();
  
  const progressBars = new cliProgress.MultiBar({
    format: '{bar} {percentage}% | {value}/{total} {type} | {status}',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true,
    clearOnComplete: false
  }, cliProgress.Presets.shades_classic);

  try {
    await mkdir(options.output, { recursive: true });

    const eventsProgress = progressBars.create(0, 0, { type: 'Events', status: colors.cyan('Fetching...') });
    const prsProgress = progressBars.create(0, 0, { type: 'PRs', status: colors.cyan('Fetching...') });
    const commitsProgress = progressBars.create(0, 0, { type: 'Commits', status: colors.cyan('Fetching...') });
    const issuesProgress = progressBars.create(0, 0, { type: 'Issues', status: colors.cyan('Fetching...') });
    
    const [events, prs, commits, issues] = await Promise.all([
      fetchUserEvents(octokit, process.env.GITHUB_USERNAME, startDate, endDate, eventsProgress),
      fetchPullRequests(octokit, startDate, endDate, prsProgress),
      fetchCommits(octokit, startDate, endDate, commitsProgress),
      fetchIssues(octokit, startDate, endDate, issuesProgress)
    ]);

    eventsProgress.setTotal(events.length);
    prsProgress.setTotal(prs.length);
    commitsProgress.setTotal(commits.length);
    issuesProgress.setTotal(issues.length);

    progressBars.stop();

    const summary = {
      pullRequests: {
        total: prs.length,
        merged: prs.filter(pr => pr.merged_at).length,
        open: prs.filter(pr => !pr.merged_at && !pr.closed_at).length,
        closed: prs.filter(pr => pr.closed_at && !pr.merged_at).length,
        details: prs.map(pr => ({
          title: pr.title,
          url: pr.html_url,
          state: pr.merged_at ? 'merged' : (pr.closed_at ? 'closed' : 'open'),
          repository: pr.repository_url.split('/').slice(-1)[0]
        }))
      },
      commits: {
        total: commits.length,
        details: commits
      },
      issues: {
        total: issues.length,
        open: issues.filter(issue => !issue.closed_at).length,
        closed: issues.filter(issue => issue.closed_at).length,
        details: issues.map(issue => ({
          title: issue.title,
          url: issue.html_url,
          state: issue.state,
          repository: issue.repository_url.split('/').slice(-1)[0]
        }))
      },
      stars: {
        total: events.filter(event => event.type === 'WatchEvent').length,
        repositories: events
          .filter(event => event.type === 'WatchEvent')
          .map(event => ({
            name: event.repo.name,
            url: `https://github.com/${event.repo.name}`,
            description: event.repo.description
          }))
      }
    };

    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split('T')[0];
      
      const dailySummary = {
        pullRequests: {
          total: summary.pullRequests.details.filter(pr => new Date(pr.created_at).toISOString().split('T')[0] === dateStr).length,
          merged: summary.pullRequests.details.filter(pr => pr.merged_at && new Date(pr.merged_at).toISOString().split('T')[0] === dateStr).length,
          open: summary.pullRequests.details.filter(pr => !pr.merged_at && !pr.closed_at && new Date(pr.created_at).toISOString().split('T')[0] === dateStr).length,
          closed: summary.pullRequests.details.filter(pr => pr.closed_at && !pr.merged_at && new Date(pr.closed_at).toISOString().split('T')[0] === dateStr).length,
          details: summary.pullRequests.details.filter(pr => new Date(pr.created_at).toISOString().split('T')[0] === dateStr)
        },
        commits: {
          total: summary.commits.details.filter(commit => new Date(commit.date).toISOString().split('T')[0] === dateStr).length,
          details: summary.commits.details.filter(commit => new Date(commit.date).toISOString().split('T')[0] === dateStr)
        },
        issues: {
          total: summary.issues.details.filter(issue => new Date(issue.created_at).toISOString().split('T')[0] === dateStr).length,
          open: summary.issues.details.filter(issue => !issue.closed_at && new Date(issue.created_at).toISOString().split('T')[0] === dateStr).length,
          closed: summary.issues.details.filter(issue => issue.closed_at && new Date(issue.closed_at).toISOString().split('T')[0] === dateStr).length,
          details: summary.issues.details.filter(issue => new Date(issue.created_at).toISOString().split('T')[0] === dateStr)
        },
        stars: {
          total: summary.stars.repositories.filter(repo => new Date(repo.created_at).toISOString().split('T')[0] === dateStr).length,
          repositories: summary.stars.repositories.filter(repo => new Date(repo.created_at).toISOString().split('T')[0] === dateStr)
        }
      };

      const markdown = createActivityMarkdown(dailySummary, dateStr);
      const fileName = await saveOutput(markdown, options.output, dateStr);

      console.log(`\nExport completed successfully for ${dateStr}:`);
      console.log(`- Pull Requests: ${dailySummary.pullRequests.total}`);
      console.log(`- Commits: ${dailySummary.commits.total}`);
      console.log(`- Issues: ${dailySummary.issues.total}`);
      console.log(`- Starred Repositories: ${dailySummary.stars.total}`);
      console.log(`- Output file: ${path.join(options.output, fileName)}`);

      currentDate.setDate(currentDate.getDate() + 1);
    }
  } catch (error) {
    console.error('Error exporting GitHub activity:', error.message);
    process.exit(1);
  }
}

exportGitHubActivity().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
