# fireflies2md

This Node.js script downloads Fireflies.ai meeting transcripts for a specified date range and converts them into Markdown files. It uses the Fireflies GraphQL API to fetch transcripts and formats them into readable Markdown documents with timestamps and speaker attribution.

## Installation

For now, you'll have to install fireflies2md from the GitHub repository:

```bash
$ git clone git://github.com/aldesantis/toolbox.git
$ cd fireflies2md
$ npm install -g
```

## Prerequisites

You'll need a Fireflies.ai API key to use this tool. Set it as an environment variable:

```bash
export FIREFLIES_API_KEY='your-api-key-here'
```

## Usage

The script requires start and end dates, and optionally accepts an output directory:

```bash
fireflies2md --start 2024-01-01 --end 2024-01-31 --output ./my-transcripts
```

### Command Line Options

- `-s, --start <date>` - Start date (YYYY-MM-DD) [required]
- `-e, --end <date>` - End date (YYYY-MM-DD) [required]
- `-o, --output <directory>` - Output directory (defaults to ./transcripts)

### Output Format

The script generates Markdown files with the following structure:

```markdown
# Meeting Title (January 1, 2024)

[00:00:00] Speaker Name: Transcript text
[00:00:15] Another Speaker: More transcript text
```

Files are named using the pattern: `YYYY-MM-DD_Meeting_Title.md`

## Contributing

Contributions are welcome! Please feel free to submit pull requests with improvements.

## License

This project is licensed under the MIT License - see the package.json file for details.
