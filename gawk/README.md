# gawk

gawk is AWK for human beings. It allows you to transform filenames and file contents using natural language prompts via Claude's AI.

## Setup

Make sure to set up your Anthropic API key before using:
```bash
export ANTHROPIC_API_KEY='your-api-key'
```

## Usage

> [!WARNING]  
> This tool modifies files in place. Always use the `--backup` option or create manual backups before processing important files.

Basic usage:
```bash
node index.js -d <directory> [options]
```

### Required arguments

- `-d, --directory <path>`: Directory containing files to process

### Transformation options (at least one required)

- `--content-prompt <prompt>`: Transform file contents using this prompt
- `--filename-prompt <prompt>`: Transform filenames using this prompt

### Additional options

- `-c, --concurrency <number>`: Number of files to process in parallel (default: 3)
- `-m, --model <model>`: Claude model to use (default: claude-3-sonnet-20240229)
- `-t, --temperature <number>`: Temperature for responses (default: 0)
- `--max-tokens <number>`: Maximum tokens in response (default: 4096)
- `--dry-run`: Show what would be processed without making changes
- `--backup`: Create backups of files before processing
- `--ignore <pattern>`: Glob pattern of files to ignore
- `--recursive`: Process subdirectories recursively (default: true)

### Examples

Transform file contents:
```bash
node index.js -d ./docs \
  --content-prompt "Convert this text into a professional technical document" \
  --backup
```

Transform filenames based on content:
```bash
node index.js -d ./docs \
  --filename-prompt "Generate a descriptive filename based on the content. Keep it concise and use kebab-case." \
  --backup
```

Combined transformation with custom settings:
```bash
node index.js -d ./docs \
  --content-prompt "Enhance this text with more technical details" \
  --filename-prompt "Create a descriptive filename based on the content" \
  --concurrency 5 \
  --model claude-3-opus-20240229 \
  --temperature 0.7 \
  --backup
```

Process specific file types:
```bash
node index.js -d ./src \
  --content-prompt "Add comprehensive JSDoc comments to this code" \
  --ignore "*.test.js" \
  --backup
```

## License

This project is licensed under the MIT License.
