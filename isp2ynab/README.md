# isp2ynab

This Node.js script converts Intesa Sanpaolo bank statement Excel files (XLSX) into CSV files that are compatible with You Need A Budget (YNAB). It processes transaction data from Intesa Sanpaolo's exported Excel files and transforms them into YNAB's expected CSV format.

## Features

- Converts Intesa Sanpaolo XLSX bank statements to YNAB-compatible CSV format
- Handles both inflow and outflow transactions
- Properly formats dates from Italian (DD/MM/YY) to YNAB format (YYYY-MM-DD)
- Removes currency symbols and formatting
- Supports processing via command line pipes
- Validates transaction dates
- Preserves transaction descriptions

## Installation

For now, you'll have to install isp2ynab from the GitHub repository:
```bash
$ git clone https://github.com/aldesantis/toolbox.git
$ cd toolbox/isp2ynab
$ npm install -g
```

## Usage

The script reads from standard input (STDIN) and writes to standard output (STDOUT):

```bash
isp2ynab < "MovimentiConto.xlsx" > ynab_import.csv
```

### Output format

The script generates a CSV file with the following columns:
- Date (YYYY-MM-DD)
- Payee (Transaction description)
- Memo (Same as Payee)
- Outflow (Positive number, no currency symbol)
- Inflow (Positive number, no currency symbol)

### Importing into YNAB

1. Generate your CSV file using the script
2. In YNAB, go to your account
3. Click "Import" 
4. Select the generated CSV file
5. YNAB will detect the file format and import the transactions

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

## Contributing

Contributions are welcome! Please feel free to submit pull requests with improvements.
