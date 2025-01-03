# linear2llm

A command-line tool for exporting Linear projects and issues to a format suitable for LLM consumption. The tool exports project and issue data in a structured text format with clear markers and relationships, making it ideal for analysis by language models.

## Features

- Exports all projects and their associated issues from Linear
- Filters projects by team and status
- Structures data hierarchically with clear XML-style markers
- Maintains relationships between projects and issues
- Generates an index file for easy navigation
- Supports pagination for large datasets
- Normalizes priorities and handles missing values consistently

## Configuration

Before using the tool, you need to set your Linear API key as an environment variable:

```bash
export LINEAR_API_KEY=your_api_key_here
```

You can find your Linear API key in your Linear account settings under "API" section.

## Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install commander graphql-request ora chalk
```

## Usage

Basic usage with default settings (exports 'planned' and 'started' projects):
```bash
node index.js -t <team-key> <output-directory>
```

Example:
```bash
node index.js -t ENG ./exports
```

### Options

- `-t, --team <teamId>`: Required. Filter projects by team key (e.g., "ENG", "PROD")
- `-s, --statuses <statuses>`: Optional. Comma-separated list of project statuses to include (default: "planned,started")
- `-h, --help`: Display help information

### Examples

Export planned and started projects (default):
```bash
node index.js -t ENG ./exports
```

Export only completed projects:
```bash
node index.js -t ENG -s "completed" ./exports
```

Export projects with multiple statuses:
```bash
node index.js -t ENG -s "planned,started,completed" ./exports
```

## Output format

The tool generates:
1. An index file (`index.txt`) containing a summary of all exported projects
2. Individual project files (named `<project-slug>.txt`) containing:
   - Project metadata
   - Project description
   - All associated issues
   - Issue metadata and descriptions

The data is structured with:
- Clear XML-style tags for sections
- KEY: VALUE format for fields
- ISO 8601 dates
- Explicit markers for empty values
- Normalized priority levels
- Clear relationship markers between projects and issues

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
