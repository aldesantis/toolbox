# trustpilot-scraper

A command-line utility that scrapes reviews from Trustpilot for a specific domain. This tool extracts review data including ratings, content, author information, and publication dates, outputting the results in JSON format.

## Installation

1. Clone this repository or download the source:

```bash
git clone git://github.com/aldesantis/toolbox.git
cd trustpilot-scraper
```

2. Install dependencies:

```bash
npm install
```

3. Make the script executable:

```bash
chmod +x index.js
```

### Global Installation

To use the utility from anywhere in your system:

```bash
npm install -g .
```

## Usage

### Basic Usage

```bash
trustpilot-scraper example.com
```

If running locally without global installation:

```bash
./index.js example.com
```

The tool will scrape all available reviews from the last 12 months and output them as JSON. By default, the output is printed to stdout, but it can be redirected to a file using the `-o` option.

Each review in the output includes:

- Review ID
- Author name and URL
- Publication date
- Review title and content
- Rating value
- Language

### Required Arguments

| Argument | Description                          |
| -------- | ------------------------------------ |
| domain   | Domain to scrape (e.g., example.com) |

### Optional Arguments

| Argument     | Description                   |
| ------------ | ----------------------------- |
| -o, --output | Output file (default: stdout) |
| --help       | Show help                     |
| --version    | Show version number           |

### Example

```bash
# Save reviews to a file
trustpilot-scraper example.com -o reviews.json

# Print reviews to console
trustpilot-scraper example.com
```

The output will be in JSON format with the following structure:

```json
{
  "domain": "example.com",
  "total_reviews": 100,
  "reviews": [
    {
      "id": "...",
      "author": "John Doe",
      "author_url": "https://...",
      "date": "2024-01-19",
      "title": "Great service",
      "content": "...",
      "rating": 5,
      "language": "en"
    },
    ...
  ]
}
```

## License

This project is licensed under the MIT License - see the package.json file for details.
