# Fatture in Cloud Document Uploader

A command-line utility for uploading received documents to Fatture in Cloud. This tool allows you to create received document entries with associated metadata and payment information, with optional PDF document attachments.

## Installation

1. Clone this repository or download the source:

```bash
git clone git://github.com/aldesantis/toolbox.git
cd create-fic-receipt
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

The tool requires your Fatture in Cloud access token to be set as an environment variable:

```bash
export FIC_TOKEN="your_access_token"
```

You can also set it temporarily for a single command (see examples below).

## Usage

### Basic Usage

With PDF attachment:

```bash
./create-fic-receipt.js \
  --companyId 12345 \
  --pdf "/path/to/invoice.pdf" \
  --payee "Supplier Name" \
  --netAmount 1000 \
  --vatAmount 220 \
  --payment-account-id 222
```

Without PDF attachment:

```bash
./create-fic-receipt.js \
  --companyId 12345 \
  --payee "Supplier Name" \
  --netAmount 1000 \
  --vatAmount 220 \
  --payment-account-id 222
```

Or if installed globally, use `create-fic-receipt` instead of `./create-fic-receipt.js`.

### Required Arguments

| Argument             | Description                   |
| -------------------- | ----------------------------- |
| --companyId, -c      | Your company ID               |
| --payee              | Name of the payee             |
| --netAmount          | Net amount of the transaction |
| --vatAmount          | VAT amount of the transaction |
| --payment-account-id | ID of the payment account     |

### Optional Arguments

| Argument   | Description                    | Default      |
| ---------- | ------------------------------ | ------------ |
| --pdf, -p  | Path to the PDF file to upload | None         |
| --date     | Transaction date (YYYY-MM-DD)  | Current date |
| --currency | Currency code                  | EUR          |
| --help     | Show help                      |              |

### Environment Variables

| Variable  | Description                        | Required |
| --------- | ---------------------------------- | -------- |
| FIC_TOKEN | Your Fatture in Cloud access token | Yes      |

## Examples

### Document Upload with PDF

```bash
export FIC_TOKEN="abc123..."
./create-fic-receipt.js \
  --companyId 12345 \
  --pdf "invoice.pdf" \
  --payee "Acme Corp" \
  --netAmount 1000 \
  --vatAmount 220 \
  --payment-account-id 222
```

### Document Creation without PDF

```bash
export FIC_TOKEN="abc123..."
./create-fic-receipt.js \
  --companyId 12345 \
  --payee "Acme Corp" \
  --netAmount 1000 \
  --vatAmount 220 \
  --payment-account-id 222
```

### Specifying Date and Currency

```bash
FIC_TOKEN="abc123..." ./create-fic-receipt.js \
  --companyId 12345 \
  --payee "Acme Corp" \
  --netAmount 1000 \
  --vatAmount 220 \
  --payment-account-id 222 \
  --date "2024-01-19" \
  --currency "USD"
```

## Payment Information

When a document is created, it is automatically marked as paid using the specified payment account. The payment is recorded with the following details:

- Payment date: Same as the document date
- Payment status: Paid
- Payment terms: Standard (0 days)
- Payment amount: Gross amount (net amount + VAT)

## License

This project is licensed under the MIT License - see the package.json file for details.
