# Intesa Sanpaolo to YNAB Converter

This Node.js script converts Intesa Sanpaolo bank statement Excel files (XLSX) into CSV files that are compatible with You Need A Budget (YNAB). It processes transaction data from Intesa Sanpaolo's exported Excel files and transforms them into YNAB's expected CSV format.

## Features

- Converts Intesa Sanpaolo XLSX bank statements to YNAB-compatible CSV format
- Handles both inflow and outflow transactions
- Properly formats dates from Italian (DD/MM/YY) to YNAB format (YYYY-MM-DD)
- Removes currency symbols and formatting
- Supports processing via command line pipes
- Validates transaction dates
- Preserves transaction descriptions

## Prerequisites

- Node.js (version 14 or higher recommended)
- npm (comes with Node.js)

## Installation

1. Clone this repository or download the script:
   ```bash
   git clone [repository-url]
   cd intesa-ynab-converter
   ```

2. Install the required dependencies:
   ```bash
   npm install xlsx
   ```

## Usage

The script reads from standard input (STDIN) and writes to standard output (STDOUT). You can use it in several ways:

1. Using input/output redirection:
   ```bash
   node index.js < "MovimentiConto.xlsx" > ynab_import.csv
   ```

2. Using pipes:
   ```bash
   cat "MovimentiConto.xlsx" | node index.js > ynab_import.csv
   ```

### Expected Input Format

The script expects an Excel file exported from Intesa Sanpaolo's online banking portal. The file should:
- Be in XLSX format
- Contain transaction data starting from row 28
- Have the following column structure:
  - Column B (index 1): Data valuta (DD/MM/YY)
  - Column D (index 3): Accrediti (Inflow)
  - Column E (index 4): Addebiti (Outflow)
  - Column F (index 5): Descrizione (Transaction description)

### Output Format

The script generates a CSV file with the following columns:
- Date (YYYY-MM-DD)
- Payee (Transaction description)
- Memo (Same as Payee)
- Outflow (Positive number, no currency symbol)
- Inflow (Positive number, no currency symbol)

## Importing into YNAB

1. Generate your CSV file using the script
2. In YNAB, go to your account
3. Click "Import" 
4. Select the generated CSV file
5. YNAB will detect the file format and import the transactions

## Error Handling

The script includes error handling for:
- Invalid input file format
- Invalid date formats
- Stream reading/writing errors

Errors are written to standard error (STDERR) and will include relevant error messages.

## Common Issues

1. **No data in output file**
   - Verify your input file follows Intesa Sanpaolo's standard export format
   - Check that transactions start at row 28
   - Ensure dates are in DD/MM/YY format

2. **Invalid date errors**
   - Verify the dates in your input file are in DD/MM/YY format
   - Check for any manual modifications to the date format

3. **Missing transactions**
   - The script filters out rows with invalid dates
   - Verify all transactions have valid dates in the correct format

## Limitations

- The script assumes the Intesa Sanpaolo XLSX file structure remains consistent
- Only processes the first sheet of the workbook
- Expects Italian date format (DD/MM/YY)
- Does not handle multiple currency transactions

## Contributing

Contributions are welcome! Please feel free to submit pull requests with improvements.
