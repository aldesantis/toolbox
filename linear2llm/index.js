#!/usr/bin/env node

import { GraphQLClient } from 'graphql-request';
import { program } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';

// GraphQL Fragments
const PROJECT_FIELDS = `
  fragment ProjectFields on Project {
    id
    name
    description
    slugId
    startDate
    targetDate
    state
    progress
    url
    creator {
      name
    }
    lead {
      name
    }
    teams {
      nodes {
        id
        name
        key
      }
    }
  }
`;

const ISSUE_FIELDS = `
  fragment IssueFields on Issue {
    id
    identifier
    title
    description
    state {
      name
      type
    }
    priority
    dueDate
    estimate
    createdAt
    updatedAt
    completedAt
    assignee {
      name
    }
    creator {
      name
    }
  }
`;

// GraphQL Queries
const GET_PROJECTS = `
  ${PROJECT_FIELDS}
  query GetProjects($after: String, $teamId: String, $statuses: [String!]) {
    projects(
      filter: { 
        status: { type: { in: $statuses } }, 
        accessibleTeams: { 
          some: { key: { eq: $teamId } }
        } 
      }
      after: $after
      first: 10
    ) {
      nodes {
        ...ProjectFields
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const GET_PROJECT_ISSUES = `
  ${ISSUE_FIELDS}
  query GetProjectIssues($projectId: String!, $after: String) {
    project(id: $projectId) {
      issues(after: $after, first: 25) {
        nodes {
          ...IssueFields
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`;

// Utility functions
const formatDate = (dateStr) => {
  if (!dateStr) return "NONE";
  return dateStr;  // Keep ISO format for better parsing
};

const formatPriority = (priority) => {
  const priorities = {
    0: "NO_PRIORITY",
    1: "URGENT",
    2: "HIGH",
    3: "MEDIUM",
    4: "LOW"
  };
  return priorities[priority] || "UNKNOWN";
};

const getLLMInstructions = () => {
  return [
    '### INSTRUCTIONS FOR LANGUAGE MODEL ###',
    'This document contains exported project and issue data from Linear, structured for analysis.',
    'The format follows these rules:',
    '1. Data is organized hierarchically: PROJECT > PROJECT_ISSUES > ISSUE',
    '2. Each section is clearly marked with XML-style tags (e.g., <PROJECT>, </PROJECT>)',
    '3. Fields are in KEY: VALUE format, one per line',
    '4. Dates are in ISO 8601 format',
    '5. Missing or empty values are marked as "NONE"',
    '6. Long text fields are wrapped in _START and _END markers',
    '7. Priorities are normalized to: NO_PRIORITY, URGENT, HIGH, MEDIUM, LOW',
    '8. Relationships are marked explicitly (e.g., PROJECT_ID in issues links to parent project)',
    '9. All counts are explicit (ISSUE_COUNT)',
    '',
    'When analyzing this data, you should:',
    '1. Consider relationships between projects and their issues',
    '2. Pay attention to temporal aspects (created, updated, completed dates)',
    '3. Look for patterns in priority distributions and state changes',
    '4. Consider both quantitative metrics (counts, progress) and qualitative data (descriptions)',
    ''
  ].join('\n');
};

// Generate structured text for a single issue
const generateIssueText = (issue, projectId) => {
  const sections = [
    '<ISSUE>',
    `ID: ${issue.id}`,
    `PROJECT_ID: ${projectId}`,
    `IDENTIFIER: ${issue.identifier}`,
    `TITLE: ${issue.title}`,
    `STATE: ${issue.state.name}`,
    `STATE_TYPE: ${issue.state.type}`,
    `PRIORITY: ${formatPriority(issue.priority)}`,
    `DUE_DATE: ${formatDate(issue.dueDate)}`,
    `ESTIMATE: ${issue.estimate || 'NONE'}`,
    `CREATED_AT: ${formatDate(issue.createdAt)}`,
    `UPDATED_AT: ${formatDate(issue.updatedAt)}`,
    `COMPLETED_AT: ${formatDate(issue.completedAt)}`,
    `CREATOR: ${issue.creator ? issue.creator.name : 'NONE'}`,
    `ASSIGNEE: ${issue.assignee ? issue.assignee.name : 'NONE'}`,
    'DESCRIPTION_START',
    issue.description || 'NONE',
    'DESCRIPTION_END',
    '</ISSUE>'
  ];

  return sections.join('\n');
};

// Generate structured text for a single project
const generateProjectText = (project, issues) => {
  const sections = [
    getLLMInstructions(),
    '<PROJECT>',
    `ID: ${project.id}`,
    `NAME: ${project.name}`,
    `SLUG: ${project.slugId}`,
    `STATE: ${project.state}`,
    `PROGRESS: ${project.progress}`,
    `START_DATE: ${formatDate(project.startDate)}`,
    `TARGET_DATE: ${formatDate(project.targetDate)}`,
    `CREATOR: ${project.creator ? project.creator.name : 'NONE'}`,
    `LEAD: ${project.lead ? project.lead.name : 'NONE'}`,
    `URL: ${project.url}`,
    `TEAM_ID: ${project.teams.nodes[0]?.id || 'NONE'}`,
    `TEAM_NAME: ${project.teams.nodes[0]?.name || 'NONE'}`,
    `TEAM_KEY: ${project.teams.nodes[0]?.key || 'NONE'}`,
    'DESCRIPTION_START',
    project.description || 'NONE',
    'DESCRIPTION_END',
    `ISSUE_COUNT: ${issues.length}`,
    '</PROJECT>',
    '',
    '<PROJECT_ISSUES>'
  ];

  // Sort issues by identifier for consistency
  const sortedIssues = [...issues].sort((a, b) => 
    a.identifier.localeCompare(b.identifier, undefined, { numeric: true }));
  
  sections.push(sortedIssues.map(issue => generateIssueText(issue, project.id)).join('\n\n'));
  sections.push('</PROJECT_ISSUES>');

  return sections.join('\n');
};

// Generate index file content
const generateIndexText = (projects) => {
  const sections = [
    getLLMInstructions(),
    '<LINEAR_EXPORT_INDEX>',
    `EXPORT_DATE: ${new Date().toISOString()}`,
    `PROJECT_COUNT: ${projects.length}`,
    '',
    '<PROJECTS_SUMMARY>'
  ];

  // Group projects by team
  const projectsByTeam = {};
  projects.forEach(project => {
    const team = project.teams.nodes[0];
    const teamKey = team?.key || 'NO_TEAM';
    if (!projectsByTeam[teamKey]) {
      projectsByTeam[teamKey] = {
        name: team?.name || 'No Team',
        id: team?.id || 'NONE',
        projects: []
      };
    }
    projectsByTeam[teamKey].projects.push(project);
  });

  // Add team-based organization to index
  Object.entries(projectsByTeam).forEach(([teamKey, team]) => {
    sections.push(`<TEAM>`);
    sections.push(`ID: ${team.id}`);
    sections.push(`NAME: ${team.name}`);
    sections.push(`KEY: ${teamKey}`);
    sections.push(`PROJECT_COUNT: ${team.projects.length}`);
    sections.push('');

    team.projects.forEach(project => {
      sections.push(`<PROJECT_REFERENCE>`);
      sections.push(`ID: ${project.id}`);
      sections.push(`NAME: ${project.name}`);
      sections.push(`FILENAME: ${project.slugId}.txt`);
      sections.push(`STATE: ${project.state}`);
      sections.push(`PROGRESS: ${project.progress}`);
      sections.push('</PROJECT_REFERENCE>');
      sections.push('');
    });

    sections.push('</TEAM>');
    sections.push('');
  });

  sections.push('</PROJECTS_SUMMARY>');
  sections.push('</LINEAR_EXPORT_INDEX>');

  return sections.join('\n');
};

// Fetch all issues for a project with pagination
async function fetchProjectIssues(client, projectId, spinner) {
  const issues = [];
  let hasNextPage = true;
  let cursor = null;

  while (hasNextPage) {
    spinner.text = `Fetching issues for project${cursor ? ' (continuing)' : ''}...`;
    
    const data = await client.request(GET_PROJECT_ISSUES, {
      projectId,
      after: cursor
    });

    const projectIssues = data.project.issues;
    issues.push(...projectIssues.nodes);
    
    hasNextPage = projectIssues.pageInfo.hasNextPage;
    cursor = projectIssues.pageInfo.endCursor;
  }

  return issues;
}

// Main function
async function exportProjects(outputDir, teamId, statuses = ['planned', 'started']) {
  // Check for API key
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) {
    console.error(chalk.red('Error: LINEAR_API_KEY environment variable is not set'));
    console.error(chalk.yellow('\nPlease set your Linear API key:'));
    console.error('export LINEAR_API_KEY=your_api_key');
    process.exit(1);
  }

  const spinner = ora('Initializing...').start();
  let allProjects = [];
  
  try {
    // Create output directory if it doesn't exist
    await fs.mkdir(outputDir, { recursive: true });

    const client = new GraphQLClient('https://api.linear.app/graphql', {
      headers: { authorization: apiKey },
    });

    // Fetch projects with pagination
    let hasNextPage = true;
    let cursor = null;

    while (hasNextPage) {
      spinner.text = `Fetching projects${cursor ? ' (continuing)' : ''}...`;
      
      const data = await client.request(GET_PROJECTS, { after: cursor, teamId, statuses });
      const { nodes, pageInfo } = data.projects;
      
      allProjects.push(...nodes);
      hasNextPage = pageInfo.hasNextPage;
      cursor = pageInfo.endCursor;
    }

    if (!allProjects.length) {
      spinner.warn('No active projects found.');
      return;
    }

    // Create index file
    const indexContent = generateIndexText(allProjects);
    await fs.writeFile(path.join(outputDir, 'index.txt'), indexContent);
    spinner.succeed(`Created index file`);

    // Process each project
    for (const project of allProjects) {
      spinner.start(`Processing project: ${project.name}`);
      
      const issues = await fetchProjectIssues(client, project.id, spinner);
      const projectContent = generateProjectText(project, issues);
      
      const filename = `${project.slugId}.txt`;
      await fs.writeFile(path.join(outputDir, filename), projectContent);
      
      spinner.succeed(`Exported project: ${project.name} -> ${filename}`);
    }

    spinner.succeed(chalk.green(
      `Successfully exported ${allProjects.length} projects to ${outputDir}`
    ));

  } catch (error) {
    spinner.fail('Error occurred during export');
    console.error(chalk.red('Error details:'), error.message);
    if (error.response?.errors) {
      console.error(chalk.red('GraphQL Errors:'), 
        JSON.stringify(error.response.errors, null, 2));
    }
    process.exit(1);
  }
}

// CLI setup
program
  .description('Export Linear projects and issues in LLM-friendly format')
  .argument('<output-dir>', 'directory to store the exported files')
  .option('-t, --team <teamId>', 'filter projects by team ID')
  .option('-s, --statuses <statuses>', 'comma-separated list of project statuses to include', 'planned,started')
  .action(async (outputDir, options) => {
    const statuses = options.statuses.split(',').map(s => s.trim());
    await exportProjects(outputDir, options.team, statuses);
  });

program.parse();
