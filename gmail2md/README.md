# gmail2md

This Node.js script exports Gmail threads for a specified date range and converts them into Markdown files. It uses the Gmail API to fetch entire email conversations and formats them into readable Markdown documents that preserve the thread structure and message metadata.

## Prerequisites

1. Create a Google Cloud Project and enable the Gmail API:

   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Create a new project or select an existing one
   - Navigate to "APIs & Services" > "Library"
   - Search for and enable "Gmail API"

2. Set up OAuth credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth client ID"
   - Choose "Desktop application"
   - Download the credentials file and save it as `credentials.json` in your project directory

## Installation

For now, you'll have to install gmail2md from the GitHub repository:

```bash
$ git clone [your-repository-url]
$ cd gmail2md
$ npm install
$ chmod +x index.js
```

For global installation:

```bash
$ npm install -g
```

## Usage

The script requires start and end dates, and optionally accepts an output directory and search query:

```bash
gmail2md --start 2024-01-01 --end 2024-01-31 --output ./my-emails
```

With additional search query:

```bash
gmail2md --start 2024-01-01 --end 2024-01-31 --query "from:example@gmail.com"
```

### Command Line Options

- `-s, --start <date>` - Start date (YYYY-MM-DD) [required]
- `-e, --end <date>` - End date (YYYY-MM-DD) [required]
- `-o, --output <directory>` - Output directory (defaults to ./emails)
- `-q, --query <string>` - Additional Gmail search query (optional)
- `-b, --batch-size <number>` - Number of threads to process in parallel (defaults to 10)

### Output Format

The script generates Markdown files that preserve the entire email thread:

```markdown
# Thread Subject

**Thread Date:** January 1, 2024
**Messages:** 3

---

## January 1, 2024, 09:00 AM

**From:** Sender Name <sender@example.com>
**To:** Recipient Name <recipient@example.com>

Initial message content...

---

## January 1, 2024, 09:15 AM

**From:** Recipient Name <recipient@example.com>
**To:** Sender Name <sender@example.com>

Reply content...

---
```

Files are named using the pattern: `YYYY-MM-DD_Thread_Subject.md`, where special characters in the subject are replaced with underscores.

### Search Query Examples

You can use Gmail's search operators in the --query option:

```bash
# Threads from a specific sender
gmail2md -s 2024-01-01 -e 2024-01-31 -q "from:example@gmail.com"

# Threads with attachments
gmail2md -s 2024-01-01 -e 2024-01-31 -q "has:attachment"

# Important threads
gmail2md -s 2024-01-01 -e 2024-01-31 -q "label:important"

# Threads with specific subject
gmail2md -s 2024-01-01 -e 2024-01-31 -q "subject:meeting"
```

## First Run

The first time you run the script, it will:

1. Open your default browser
2. Ask you to sign in to your Google account
3. Request permission to read your Gmail messages
4. Save the authorization for future use

## Features

- Downloads complete email threads instead of individual messages
- Preserves conversation context and chronological order
- Maintains rich text formatting through Markdown conversion
- Smart email cleaning:
  - Removes quoted text sections
  - Strips email signatures
  - Handles both HTML and plain text formats
  - Removes hidden content
- Batch processing with configurable parallel execution
- Progress bar with real-time status updates
- Supports Gmail search operators for filtering
- Preserves message metadata (sender, recipient, dates)

## Contributing

Contributions are welcome! Please feel free to submit pull requests with improvements.

## License

This project is licensed under the MIT License - see the package.json file for details.
