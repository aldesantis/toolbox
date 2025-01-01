# Claude Batch Processor

A command-line tool for batch processing files using Claude AI. This tool can transform both file contents and filenames using Claude, with the ability to process multiple files in parallel.

## Prerequisites

- Node.js >= 18.0.0
- An Anthropic API key

## Installation

1. Clone this repository:
```bash
git clone <repository-url>
cd claude-batch-processor
```

2. Install dependencies:
```bash
npm install
```

3. Set up your Anthropic API key:
```bash
export ANTHROPIC_API_KEY='your-api-key'
```

## Usage

⚠️ This tool modifies files in place. Use the `--backup` option or make manual backups before processing important files.

```bash
node index.js -d <directory> [options]
```

### Required Arguments
- `-d, --directory <path>`: Directory containing files to process

### Transformation Options (at least one required)
- `--content-prompt <prompt>`: Transform file contents using this prompt
- `--filename-prompt <prompt>`: Transform filenames using this prompt

### Additional Options
- `-c, --concurrency <number>`: Number of files to process in parallel (default: 3)
- `-m, --model <model>`: Claude model to use (default: claude-3-sonnet-20240229)
- `-t, --temperature <number>`: Temperature for responses (default: 0)
- `--max-tokens <number>`: Maximum tokens in response (default: 4096)
- `--dry-run`: Show what would be processed without making changes
- `--backup`: Create backups of files before processing
- `--ignore <pattern>`: Glob pattern of files to ignore

### Examples

Transform file contents:
```bash
node index.js -d ./docs \
  --content-prompt "Summarize this text in bullet points"
```

Transform filenames:
```bash
node index.js -d ./docs \
  --filename-prompt "Make the filename more descriptive based on the content"
```

Transform both contents and filenames:
```bash
node index.js -d ./docs \
  --content-prompt "Summarize this text in bullet points" \
  --filename-prompt "Make the filename more descriptive based on the content" \
  --backup
```

Process with custom settings:
```bash
node index.js -d ./docs \
  --content-prompt "Convert to markdown" \
  --concurrency 5 \
  --model claude-3-opus-20240229 \
  --temperature 0.7 \
  --backup
```

## Features

Content Processing:
- Transforms file contents based on provided prompt
- Automatically skips binary files
- Preserves file if Claude returns unchanged content
- Size limit protection (skips files > 100MB)

Filename Processing:
- Transforms filenames based on provided prompt
- Preserves file extensions
- Sanitizes generated filenames
- Handles file renaming conflicts

General Features:
- Parallel processing with configurable concurrency
- Real-time progress bars for each file
- Detailed success/failure reporting
- Backup functionality with unique timestamps
- Dry run mode for safety
- Binary file detection
- Hidden file skipping
- Error handling and recovery

## License

This project is licensed under the MIT License.
