#!/usr/bin/env node

import * as XLSX from 'xlsx';

function isValidDate(dateStr) {
   // Check if it's a string and has the expected format DD/MM/YY
   if (typeof dateStr !== 'string' || !/^\d{2}\/\d{2}\/\d{2}$/.test(dateStr)) {
       return false;
   }

   const [day, month, year] = dateStr.split('/').map(Number);
   const date = new Date(2000 + year, month - 1, day);

   // Check if the date is valid and the parts match what we parsed
   return date.getDate() === day && 
          (date.getMonth() + 1) === month && 
          (date.getFullYear() % 100) === year;
}

function formatDate(dateStr) {
   const [day, month, year] = dateStr.split('/');
   return `20${year}-${month}-${day}`;
}

function processExcelBuffer(buffer) {
   try {
       // Read the workbook from buffer
       const workbook = XLSX.read(buffer, {
           type: 'buffer',
           cellStyles: true,
           cellDates: true,
           cellNF: true,
           raw: false
       });

       // Get first sheet
       const sheet = workbook.Sheets[workbook.SheetNames[0]];

       // Convert to array of arrays
       const rows = XLSX.utils.sheet_to_json(sheet, {
           header: 1,
           raw: false
       });

       // Get headers and data
       const headers = rows[27];
       const dataRows = rows.slice(28);

       // Convert rows to objects and transform
       const mappedData = dataRows
           .filter(row => row[0] && isValidDate(row[0])) // Filter rows with valid Date
           .map(row => {
               // Handle negative numbers in Addebiti
               let outflow = row[4] ? 
                   row[4].toString().replace('-', '') : '';
               outflow = outflow.replace(/[€\s]/g, '');

               let inflow = row[3] ? 
                   row[3].toString() : '';
               inflow = inflow.replace(/[€\s]/g, '');

               // Always use the first column as Date
               const formattedDate = formatDate(row[0]);

               return {
                   Date: formattedDate,
                   Payee: row[5] || '',
                   Memo: row[5] || '',
                   Outflow: outflow,
                   Inflow: inflow
               };
           });

       // Create new workbook for CSV
       const newWorkbook = XLSX.utils.book_new();
       const newSheet = XLSX.utils.json_to_sheet(mappedData);
       XLSX.utils.book_append_sheet(newWorkbook, newSheet, 'Sheet1');

       // Write to CSV string
       const csvContent = XLSX.utils.sheet_to_csv(newSheet);
       
       // Write to STDOUT
       process.stdout.write(csvContent);

   } catch (error) {
       console.error('Error processing file:', error);
       process.exit(1);
   }
}

// Read from STDIN
const chunks = [];
process.stdin.on('data', chunk => chunks.push(chunk));
process.stdin.on('end', () => {
    const buffer = Buffer.concat(chunks);
    processExcelBuffer(buffer);
});

// Handle errors
process.stdin.on('error', error => {
    console.error('Error reading from STDIN:', error);
    process.exit(1);
});
