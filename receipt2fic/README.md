# receipt2fic

A command-line utility that uses Claude to analyze PDF receipts and automatically upload them to Fatture in Cloud. This tool extracts relevant information from receipt PDFs and creates received document entries with associated metadata and payment information.

## Installation

1. Clone this repository or download the source:

```bash
git clone git://github.com/aldesantis/toolbox.git
cd receipt2fic
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

## Configuration

The tool requires two environment variables to be set:

```bash
# Your Fatture in Cloud access token
export FIC_TOKEN="your_fic_token"

# Your Anthropic API key for Claude
export ANTHROPIC_API_KEY="your_anthropic_key"
```

You can also set these temporarily for a single command (see examples below).

## Usage

### Basic Usage

```bash
receipt2fic -c <company-id> -f receipt.pdf -a <payment-account-id>
```

If running locally without global installation:

```bash
./index.js -c <company-id> -f receipt.pdf -a <payment-account-id>
```

When a document is created, it is automatically marked as paid using the specified payment account. The payment is recorded with the following details:

- Payment date: Same as the document date
- Payment status: Paid
- Payment terms: Standard (0 days)
- Payment amount: Gross amount (net amount + VAT)

### Required Arguments

| Argument                 | Description                                   |
| ------------------------ | --------------------------------------------- |
| -c, --company-id         | Your Fatture in Cloud company ID              |
| -f, --file               | Path to the PDF receipt/invoice to analyze    |
| -a, --payment-account-id | ID of the payment account in Fatture in Cloud |

### Optional Arguments

| Argument  | Description                           |
| --------- | ------------------------------------- |
| --debug   | Enable debug mode for troubleshooting |
| --help    | Show help                             |
| --version | Show version number                   |

## License

This project is licensed under the MIT License - see the package.json file for details.
