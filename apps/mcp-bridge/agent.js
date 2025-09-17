'use strict';
import axios from 'axios';

// Minimal tool-calling agent using OpenAI-compatible API.
// Expects OPENAI_API_KEY and MODEL (default: gpt-4o-mini) env vars.

const OPENAI_URL = process.env.OPENAI_URL || 'https://api.openai.com/v1/chat/completions';
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const MODEL = process.env.MODEL || 'gpt-4o-mini';

export async function runAgentChat({ messages, tools }) {
  // Convert MCP tools -> OpenAI tool definitions (function calling)
  const functions = tools.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description || '',
      parameters: t.inputSchema?.schema || { type: 'object', properties: {} }
    }
  }));

  const headers = { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' };
  let conversation = [...messages];
  let toolCalls = [];
  for (let i = 0; i < 3; i++) {
    const resp = await axios.post(OPENAI_URL, { model: MODEL, messages: conversation, tools: functions, tool_choice: 'auto' }, { headers });
    const msg = resp.data.choices?.[0]?.message;
    if (!msg) return { content: 'No response' };
    if (msg.tool_calls && msg.tool_calls.length) {
      for (const tc of msg.tool_calls) {
        toolCalls.push(tc);
        conversation.push({ role: 'assistant', tool_calls: [tc] });
        // The bridge server performs the actual tool call; here we stop after planning.
        return { content: msg.content || '', tool_calls: toolCalls };
      }
    } else {
      return { content: msg.content || '' };
    }
  }
  return { content: 'Reached tool-call loop limit' };
}

