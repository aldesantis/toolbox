#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import * as fattureInCloudSdk from '@fattureincloud/fattureincloud-js-sdk';
const program = new Command();

// Validate date format (YYYY-MM-DD)
function parseDate(value) {
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    throw new Error('Invalid date format. Please use YYYY-MM-DD');
  }
  return value;
}

// Validate currency code
function validateCurrency(value) {
  const currencyRegex = /^[A-Z]{3}$/;
  if (!currencyRegex.test(value)) {
    throw new Error('Invalid currency code. Please use ISO 4217 format (e.g., EUR)');
  }
  return value;
}

// Validate amount
function parseAmount(value) {
  const amount = parseFloat(value);
  if (isNaN(amount) || amount < 0) {
    throw new Error('Amount must be a positive number');
  }
  return amount;
}

// Configure CLI options with improved descriptions and validation
program
  .name('create-fic-receipt')
  .description('Upload received documents to Fatture in Cloud with automatic payment registration')
  .version('1.0.0')
  .requiredOption('-c, --company-id <id>', 'Your Fatture in Cloud company ID', parseInt)
  .option('-p, --pdf <path>', 'Path to the PDF receipt/invoice to upload (optional)')
  .requiredOption('--payee <name>', 'Name of the vendor/payee')
  .requiredOption('--net-amount <amount>', 'Net amount (before VAT) of the transaction', parseAmount)
  .requiredOption('--vat-amount <amount>', 'VAT amount of the transaction', parseAmount)
  .requiredOption('--payment-account-id <id>', 'ID of the payment account in Fatture in Cloud', parseInt)
  .option('--date <date>', 'Date of the transaction (YYYY-MM-DD)', parseDate, new Date().toISOString().split('T')[0])
  .option('--currency <code>', 'Currency of the transaction (ISO 4217)', validateCurrency, 'EUR');

program.parse();

const options = program.opts();

// Enhanced error logging
function logError(message) {
  console.error(`❌ ${message}`);
}

// Initialize the SDK client with error handling
function initializeClient() {
  if (!process.env.FIC_TOKEN) {
    logError('FIC_TOKEN environment variable is required. Please set it in your environment.');
    process.exit(1);
  }

  const defaultClient = fattureInCloudSdk.ApiClient.instance;
  const auth = defaultClient.authentications['OAuth2AuthenticationCodeFlow'];
  auth.accessToken = process.env.FIC_TOKEN;

  return {
    receivedDocumentsApi: new fattureInCloudSdk.ReceivedDocumentsApi()
  };
}

async function getExchangeRate(api, companyId, currencyCode) {
  try {
    console.log(`📊 Retrieving exchange rate for ${currencyCode}`);
    
    const info = await api.receivedDocumentsApi.getReceivedDocumentPreCreateInfo(companyId, "expense");
    const currency = info.data.currencies_list.find(c => c.id === currencyCode);
    
    if (!currency) {
      throw new Error(`Currency ${currencyCode} not supported`);
    }
    
    console.log(`💱 Exchange rate: 1 ${currencyCode} = ${currency.exchange_rate} EUR`);
    return parseFloat(currency.exchange_rate);
  } catch (error) {
    logError('Error retrieving exchange rate');
    throw error;
  }
}

async function uploadAttachment(api, companyId, filePath) {
  try {
    // Validate file exists and is readable
    await fs.promises.access(filePath, fs.constants.R_OK);
    
    const fileBuffer = fs.createReadStream(filePath);
    const fileName = path.basename(filePath);
    
    console.log(`📎 Uploading attachment: ${fileName}`);
    
    const uploadResult = await api.receivedDocumentsApi.uploadReceivedDocumentAttachment(
      companyId,
      {
        filename: fileName,
        attachment: fileBuffer
      }
    );
    
    console.log('✅ Attachment uploaded successfully');
    return uploadResult.data.attachment_token;
  } catch (error) {
    if (error.code === 'ENOENT') {
      logError(`File not found: ${filePath}`);
    } else if (error.code === 'EACCES') {
      logError(`Permission denied accessing file: ${filePath}`);
    } else {
      logError('Error uploading attachment');
    }
    throw error;
  }
}

async function createReceivedDocument(api, companyId, documentData, attachmentToken) {
  try {
    const grossAmount = documentData.netAmount + documentData.vatAmount;
    
    // Always get exchange rate from the API
    const exchangeRate = (await getExchangeRate(api, companyId, documentData.currency)).toFixed(5);
    
    console.log(`📝 Creating received document for ${documentData.payee}`);
    console.log(`   Amount: ${grossAmount} ${documentData.currency}`);
    
    const request = {
      data: {
        type: 'expense',
        entity: {
          name: documentData.payee
        },
        date: documentData.date,
        amount_net: documentData.netAmount,
        amount_vat: documentData.vatAmount,
        amount_gross: grossAmount,
        currency: {
          id: documentData.currency,
          exchange_rate: exchangeRate
        },
        payments_list: [
          {
            amount: grossAmount,
            due_date: documentData.date,
            paid_date: documentData.date,
            payment_terms: {
              days: 0,
              type: 'standard'
            },
            status: 'paid',
            payment_account: {
              id: documentData.paymentAccountId
            }
          }
        ]
      }
    };

    // Only add attachment_token if it exists
    if (attachmentToken) {
      request.data.attachment_token = attachmentToken;
    }

    const result = await api.receivedDocumentsApi.createReceivedDocument(
      companyId,
      { createReceivedDocumentRequest: request }
    );

    console.log('✅ Document created successfully');
    return result.data;
  } catch (error) {
    logError('Error creating received document');
    throw error;
  }
}

async function main() {
  try {
    console.log('🚀 Starting receipt upload process...');
    
    const api = initializeClient();
    
    // Upload the attachment only if PDF path is provided
    let attachmentToken = null;
    if (options.pdf) {
      attachmentToken = await uploadAttachment(api, options.companyId, options.pdf);
    }

    // Create the received document
    const document = await createReceivedDocument(api, options.companyId, {
      payee: options.payee,
      netAmount: options.netAmount,
      vatAmount: options.vatAmount,
      date: options.date,
      currency: options.currency,
      paymentAccountId: options.paymentAccountId
    }, attachmentToken);

    console.log('\n✨ Success! You can view the document at:');
    console.log(`🔗 https://secure.fattureincloud.it/expenses/view/${document.id}`);
  } catch (error) {
    console.error(error);
    logError('Process failed');
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logError('An unexpected error occurred');
  console.error(error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (error) => {
  logError('An unexpected error occurred in a promise');
  console.error(error);
  process.exit(1);
});

main();
