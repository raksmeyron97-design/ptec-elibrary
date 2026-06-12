// @ts-nocheck
import { createClient } from "@/lib/supabase/server";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { streamText, tool } from "ai";
import { z } from "zod";

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  const fs = require('fs');
  const envContent = fs.readFileSync('/Users/mac/Desktop/e-library-ptec/.env', 'utf8');
  const apiKeyMatch = envContent.match(/GEMINI_API_KEY=(.*)/);
  const apiKey = apiKeyMatch ? apiKeyMatch[1].trim() : process.env.GEMINI_API_KEY;

  const google = createGoogleGenerativeAI({
    apiKey: apiKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  });

  const { messages } = await req.json();

  // Ensure messages are in the correct CoreMessage format
  const coreMessages = messages.map((m: any) => {
    if (m.parts && Array.isArray(m.parts)) {
      return {
        role: m.role,
        content: m.parts.map((p: any) => p.text).join(""),
      };
    }
    return {
      role: m.role,
      content: m.content || "",
    };
  });

  const lastUserMessage = messages[messages.length - 1];
  const query = lastUserMessage?.content || "";

  // Initialize supabase here to prevent Next.js context loss in background callback
  const supabase = await createClient();

  // Perform direct RAG search
  const { data: books } = await supabase
    .from("books")
    .select("title, author:authors(name), description, departments(name)")
    .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
    .limit(3);

  const { data: research } = await supabase
    .from("research_reports")
    .select("title, abstract, author_names, departments(name)")
    .or(`title.ilike.%${query}%,abstract.ilike.%${query}%`)
    .limit(2);

  const libraryContext = `
Library Search Results for "${query}":
Books: ${JSON.stringify(books || [])}
Research: ${JSON.stringify(research || [])}
`;

  try {
    const result = streamText({
      model: google("gemini-3.5-flash"),
      system: `You are a helpful, polite, and knowledgeable library assistant for the PTEC E-Library (Phnom Penh Teacher Education College).
You MUST ONLY recommend books or research materials that actually exist in the library context provided below.
If no results are found in the context, tell the user politely that you couldn't find any related books in the library. 
If results are found, summarize them nicely with their title, author, and description.
Keep the response friendly and use Khmer language primarily unless the user speaks in English.

${libraryContext}`,
      messages: coreMessages,
      onFinish: (event) => {
        console.log("Stream finished:", event.finishReason);
      },
      onError: ({ error }) => {
        console.error("Stream error:", error);
      }
    });

    if (typeof result.toDataStreamResponse === 'function') {
      return result.toDataStreamResponse();
    } else if (typeof result.toAIStreamResponse === 'function') {
      return result.toAIStreamResponse();
    } else if (typeof result.toTextStreamResponse === 'function') {
      return result.toTextStreamResponse();
    }
    throw new Error('No stream response method found');
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message, stack: error.stack }), { status: 500 });
  }
}
