#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import * as fattureInCloudSdk from '@fattureincloud/fattureincloud-js-sdk';
import Anthropic from '@anthropic-ai/sdk';

const program = new Command();

// Initialize Anthropic client with error handling
function initializeAnthropic() {
  if (!process.env.ANTHROPIC_API_KEY) {
    logError('ANTHROPIC_API_KEY environment variable is required');
    process.exit(1);
  }
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
}

// Initialize FIC client with error handling
function initializeFIC() {
  if (!process.env.FIC_TOKEN) {
    logError('FIC_TOKEN environment variable is required');
    process.exit(1);
  }

  const defaultClient = fattureInCloudSdk.ApiClient.instance;
  const auth = defaultClient.authentications['OAuth2AuthenticationCodeFlow'];
  auth.accessToken = process.env.FIC_TOKEN;

  return {
    receivedDocumentsApi: new fattureInCloudSdk.ReceivedDocumentsApi()
  };
}

// Enhanced error logging
function logError(message) {
  console.error(`❌ ${message}`);
}

// Warning logging
function logWarning(message) {
  console.warn(`⚠️  ${message}`);
}

async function analyzeReceiptWithClaude(pdfPath) {
  try {
    const anthropic = initializeAnthropic();
    const pdfContent = await fs.promises.readFile(pdfPath);

    const systemPrompt = `You are a receipt analysis assistant. Extract the following information from the receipt:
- Currency (ISO code)
- Net amount (total excluding VAT)
- VAT amount (if present)
- Date
- Payee/business name

Return only a JSON object with these fields: currency, net, vat (optional), date, payee. 
No explanation or other text.`;

    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1000,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: pdfContent.toString("base64"),
              },
            },
          ],
        },
      ],
    });

    return JSON.parse(response.content[0].text);
  } catch (error) {
    logError('Failed to analyze receipt with Claude');
    throw error;
  }
}

async function validateOutput(data) {
  const requiredFields = ["currency", "net", "date", "payee"];
  const missingFields = requiredFields.filter((field) => !data[field]);

  if (missingFields.length > 0) {
    throw new Error(`Missing required fields: ${missingFields.join(", ")}`);
  }

  if (!/^[A-Z]{3}$/.test(data.currency)) {
    throw new Error("Invalid currency ISO code");
  }

  if (isNaN(parseFloat(data.net))) {
    throw new Error("Invalid net amount value");
  }

  // Handle optional VAT field
  if (data.vat === undefined || data.vat === null) {
    logWarning('VAT amount not found in receipt - defaulting to 0');
    data.vat = 0;
  } else if (isNaN(parseFloat(data.vat))) {
    throw new Error("Invalid VAT amount value");
  }

  if (isNaN(Date.parse(data.date))) {
    throw new Error("Invalid date format");
  }

  return {
    ...data,
    net: parseFloat(data.net),
    vat: parseFloat(data.vat),
    date: new Date(data.date).toISOString().split('T')[0] // Normalize date format
  };
}

async function uploadAttachment(api, companyId, filePath) {
  try {
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

async function createReceivedDocument(api, companyId, documentData, attachmentToken) {
  try {
    const grossAmount = documentData.net + documentData.vat;
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
        amount_net: documentData.net,
        amount_vat: documentData.vat,
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

// Configure CLI
program
  .name('receipt2fic')
  .description('Analyze receipt PDF and upload to Fatture in Cloud')
  .version('1.0.0')
  .requiredOption('-c, --company-id <id>', 'Your Fatture in Cloud company ID', parseInt)
  .requiredOption('-f, --file <path>', 'Path to the PDF receipt/invoice to analyze and upload')
  .requiredOption('-a, --payment-account-id <id>', 'ID of the payment account in Fatture in Cloud', parseInt)
  .option('--debug', 'Enable debug mode to see detailed information', false)
  .parse();

const options = program.opts();

async function main() {
  try {
    console.log('🚀 Starting receipt analysis and upload process...');
    
    // Initialize clients
    const ficApi = initializeFIC();
    
    // Analyze receipt with Claude
    console.log('🔍 Analyzing receipt...');
    const receiptData = await analyzeReceiptWithClaude(options.file);
    
    if (options.debug) {
      console.log('📊 Extracted receipt data:', JSON.stringify(receiptData, null, 2));
    }
    
    const validatedData = await validateOutput(receiptData);
    
    // Add payment account ID to the validated data
    validatedData.paymentAccountId = options.paymentAccountId;
    
    // Upload the PDF
    const attachmentToken = await uploadAttachment(ficApi, options.companyId, options.file);

    // Create the received document
    const document = await createReceivedDocument(
      ficApi,
      options.companyId,
      validatedData,
      attachmentToken
    );

    console.log('\n✨ Success! You can view the document at:');
    console.log(`🔗 https://secure.fattureincloud.it/expenses/view/${document.id}`);
  } catch (error) {
    if (options.debug) {
      console.error('Detailed error:', error);
    } else {
      logError(error.message);
    }
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logError('An unexpected error occurred');
  if (options.debug) {
    console.error(error);
  }
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (error) => {
  logError('An unexpected error occurred in a promise');
  if (options.debug) {
    console.error(error);
  }
  process.exit(1);
});

main();
