#!/usr/bin/env node

import { program } from "commander";
import Anthropic from "@anthropic-ai/sdk";

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function analyzeReceiptWithClaude(pdfContent) {
  const systemPrompt = `You are a receipt analysis assistant. Extract the following information from the receipt:
- Currency (ISO code)
- Total amount
- VAT amount
- Date
- Payee/business name

Return only a JSON object with these fields: currency, total, vat, date, payee. 
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

  try {
    return JSON.parse(response.content[0].text);
  } catch (error) {
    throw new Error("Failed to parse Claude's response as JSON");
  }
}

async function validateOutput(data) {
  const requiredFields = ["currency", "total", "vat", "date", "payee"];
  const missingFields = requiredFields.filter((field) => !data[field]);

  if (missingFields.length > 0) {
    throw new Error(`Missing required fields: ${missingFields.join(", ")}`);
  }

  // Validate currency is ISO code
  if (!/^[A-Z]{3}$/.test(data.currency)) {
    throw new Error("Invalid currency ISO code");
  }

  // Validate total and VAT are numbers
  if (isNaN(parseFloat(data.total))) {
    throw new Error("Invalid total amount");
  }
  if (isNaN(parseFloat(data.vat))) {
    throw new Error("Invalid VAT amount");
  }

  // Validate date format
  if (isNaN(Date.parse(data.date))) {
    throw new Error("Invalid date format");
  }

  return data;
}

program
  .name("receipt2json")
  .description("Extract information from receipt PDFs using Claude API")
  .version("1.0.0")
  .parse(process.argv);

async function main() {
  try {
    // Check if ANTHROPIC_API_KEY is set
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY environment variable is not set");
    }

    // Read PDF content from STDIN
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    const pdfContent = Buffer.concat(chunks);

    const receiptData = await analyzeReceiptWithClaude(pdfContent);

    // Validate output
    const validatedData = await validateOutput(receiptData);

    // Output results to STDOUT
    process.stdout.write(JSON.stringify(validatedData, null, 2) + "\n");
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

main();
