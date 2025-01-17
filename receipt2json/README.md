# receipt2json

A command-line utility that extracts structured information from receipt PDFs using the Claude AI API. The tool analyzes receipts and returns standardized JSON data containing key information such as total amount, VAT, date, and business details.

## Installation

1. Clone this repository or download the source files:

```bash
git clone git://github.com/aldesantis/toolbox.git
cd receipt2json
```

2. Install dependencies:

```bash
npm install -g
```

## Configuration

Set your Anthropic API key as an environment variable:

```bash
export ANTHROPIC_API_KEY='your-api-key-here'
```

For permanent configuration, add it to your shell profile (~/.bashrc, ~/.zshrc, etc.):

```bash
echo 'export ANTHROPIC_API_KEY="your-api-key-here"' >> ~/.bashrc
```

## Usage

### Basic Usage

Process a receipt from a file:

```bash
cat receipt.pdf | receipt2json > results.json
```

Or using input redirection:

```bash
receipt2json < receipt.pdf > results.json
```

The tool reads PDF data from standard input (STDIN) and writes JSON output to standard output (STDOUT). This makes it easy to integrate with Unix pipes and other command-line tools.

### Command Line Options

- `-v, --version`: Display version information
- `-h, --help`: Display help information

### Examples

Chain with other commands:

```bash
# Process multiple receipts
cat *.pdf | receipt2json | jq -c '.[]' > all_results.json

# Filter results
receipt2json < receipt.pdf | jq 'select(.total > 100)'

# Format output
receipt2json < receipt.pdf | jq -r '.payee'
```

## Output Format

The tool returns a JSON object with the following structure:

```json
{
  "currency": "USD",
  "total": 123.45,
  "vat": 20.58,
  "date": "2024-01-15",
  "payee": "Business Name Ltd"
}
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
