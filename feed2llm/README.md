# feed2llm

A Node.js tool that processes XML/RSS feeds and converts them into an LLM-compatible knowledge base.

The tool automatically extracts article content using CSS selectors, converts it to clean Markdown, and creates both individual summaries and a comprehensive meta-analysis.

## Features

- Supports any XML/RSS feed format
- Smart content extraction using CSS selectors
- Clean HTML to Markdown conversion
- AI-powered article summaries using Claude
- Creates a meta-summary analyzing patterns across all articles
- Parallel processing with configurable concurrency
- Aggressive caching for better performance
- Clean separation of content and summaries
- Progress tracking with visual feedback
- Comprehensive error handling and retries

## Prerequisites

- Node.js >= 18.0.0
- Anthropic API key (Claude AI)

## Installation

For now, you'll have to install feed2llm from the GitHub repository:
```bash
$ git clone https://github.com/aldesantis/toolbox.git
$ cd toolbox/feed2llm
$ npm install -g
```

Make sure to set up your Anthropic API key before using:
```bash
export ANTHROPIC_API_KEY='your-api-key'
```

## Usage

Basic usage with required parameters:
```bash
feed2llm --feed <feed-url> --key <your-anthropic-key>
```

Full options:
```bash
node index.js \
  --feed <feed-url> \
  --key <your-anthropic-key> \
  --concurrent 5 \
  --delay 200 \
  --output ./output \
  --cache ./.cache \
  --selector "article" \
  --model "claude-3-haiku-20240307"
```

### Command Line Options

| Option | Alias | Description | Default |
|--------|-------|-------------|---------|
| --feed | -f | URL of the XML feed to process (required) | - |
| --key | -k | Anthropic API key (can also use ANTHROPIC_API_KEY env var) | - |
| --concurrent | -c | Maximum concurrent requests | 5 |
| --delay | -d | Delay between requests in ms | 200 |
| --output | -o | Output directory | ./output |
| --cache | - | Cache directory | ./.cache |
| --selector | - | CSS selector for article content | article |
| --model | - | Claude model to use | claude-3-haiku-20240307 |

### Environment Variables

Instead of passing the API key via command line, you can set it as an environment variable:
```bash
export ANTHROPIC_API_KEY=your-api-key
```

## Content Extraction

The script uses CSS selectors to extract article content from web pages. By default, it looks for content within an `<article>` tag. You can customize this using the `--selector` option:

- Default article tag: `--selector "article"`
- Class selector: `--selector ".post-content"`
- ID selector: `--selector "#main-content"`
- Multiple selectors: `--selector "article .content"`

Examples for common blog platforms:
- WordPress: `--selector ".entry-content"`
- Medium: `--selector "article"`
- Ghost: `--selector ".post-full-content"`
- Substack: `--selector ".post-content"`

## Performance Tuning

The script is optimized for both speed and reliability. Here are some ways to adjust the performance:

1. Increase Concurrency:
```bash
node index.js --concurrent 10 # Process more articles in parallel
```

2. Adjust Request Delay:
```bash
node index.js --delay 100 # Decrease delay between requests
```

3. Choose Faster Models:
```bash
node index.js --model claude-3-haiku-20240307 # Use the fastest Claude model
```

Keep in mind:
- Higher concurrency uses more system resources
- Lower delay might trigger rate limits
- Faster models might trade some quality for speed

## Output Structure

The script creates the following directory structure:

```
output/
├── articles/          # Full article content in Markdown
│   ├── article1.md
│   └── article2.md
├── summaries/         # Article summaries
│   ├── article1.md
│   └── article2.md
└── summary.md        # Meta-summary file

.cache/
├── articles/
│   └── ... (cached article content)
└── summaries/
    └── ... (cached AI summaries)
```

### Output Files

- `articles/*.md`: Full article content in clean Markdown format (one file per article)
- `summaries/*.md`: Concise summaries of each article (one file per article)
- `summary.md`: Meta-summary file containing:
  - Feed information (title, description)
  - AI-generated analysis of patterns and insights
  - Collection of all article summaries with links

## Caching

The script implements an aggressive caching system to:
- Cache extracted article content
- Cache AI-generated summaries
- Allow for resuming interrupted processing
- Avoid redundant API calls

Cache files are stored in the `.cache` directory and are used automatically on subsequent runs.

## Examples

1. Process a WordPress blog:
```bash
node index.js \
  --feed "https://blog.domain.com/feed" \
  --selector ".entry-content" \
  --concurrent 5
```

2. Process a Medium publication:
```bash
node index.js \
  --feed "https://medium.com/feed/publication" \
  --selector "article" \
  --concurrent 3 \
  --delay 500
```

3. Process a custom blog with specific content selector:
```bash
node index.js \
  --feed "https://blog.domain.com/feed" \
  --selector "#post-content .article-body" \
  --concurrent 5 \
  --delay 200
```

## Error Handling

The script includes robust error handling:
- Retries with exponential backoff for rate limits
- Parallel processing with failure isolation
- Cache-based recovery from interruptions
- Clear error messages with suggested actions
- Fallback content extraction when selector fails

## Limitations

- Some websites may block automated access
- Rate limits may apply from both feed sources and Claude API
- Large feeds may take significant time to process
- Some paywalled content may not be accessible
- Content extraction depends on correct CSS selectors

## Contributing

Feel free to submit issues and enhancement requests!

## License

This project is licensed under the MIT License - see the LICENSE file for details.
