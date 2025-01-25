# readwise2md

This Node.js script exports Readwise highlights for a specified date range and converts them into Markdown files. It uses the Readwise API to fetch highlights from books, articles, and other sources, formatting them into readable Markdown documents that preserve metadata and highlight structure.

## Prerequisites

1. Get your Readwise API token:

   - Log in to your Readwise account
   - Go to your account settings
   - Navigate to the "API Access" section
   - Copy your API token

2. Set up your environment:
   - Create an environment variable named `READWISE_TOKEN` with your API token
   - You can add this to your shell profile or use a `.env` file

## Installation

For now, you'll have to install readwise2md from the GitHub repository:

```bash
$ git clone git://github.com/aldesantis/toolbox.git
$ cd readwise2md
$ npm install
$ chmod +x index.js
```

For global installation:

```bash
$ npm install -g
```

## Usage

The script requires start and end dates, and optionally accepts an output directory and batch size:

```bash
readwise2md --start 2024-01-01 --end 2024-01-31 --output ./my-highlights
```

With custom batch size:

```bash
readwise2md --start 2024-01-01 --end 2024-01-31 --batch-size 50
```

### Command Line Options

- `-s, --start <date>` - Start date (YYYY-MM-DD) [required]
- `-e, --end <date>` - End date (YYYY-MM-DD) [required]
- `-o, --output <directory>` - Output directory (defaults to ./highlights)
- `-b, --batch-size <number>` - Number of results per page (defaults to 100)

### Output Format

The script generates Markdown files for each book or source that preserve highlights and metadata:

```markdown
# Book Title

**Author:** Author Name
**Category:** Book Category
**Source:** Source Name
**URL:** Source URL

---

## January 1, 2024, 09:00 AM

> Highlighted text content...

**Note:** User's note about the highlight

**Tags:** #tag1 #tag2 #tag3

---
```

Files are named using the sanitized version of the book or article title, where special characters are replaced with underscores.

## Features

- Downloads highlights from all Readwise sources
- Preserves highlight metadata:
  - Original creation/highlight date
  - User notes
  - Tags
  - Source information
- Smart date filtering:
  - Only exports highlights within specified date range
  - Uses either highlight date or creation date
- Batch processing with configurable page size
- Progress tracking with completion summary
- Maintains source attribution and URLs
- Creates organized directory structure
- Handles API pagination automatically

## Contributing

Contributions are welcome! Please feel free to submit pull requests with improvements.

## License

This project is licensed under the MIT License - see the package.json file for details.
