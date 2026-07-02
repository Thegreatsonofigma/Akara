const { config } = require("../config");

const OPENAI_BASE_URL = "https://api.openai.com/v1";

function isOpenAiEnabled() {
  return Boolean(config.openaiApiKey);
}

function isReasoningModel(model) {
  return /^(gpt-5|o\d)/.test(model);
}

async function openAiGenerate(prompt, options = {}) {
  if (!isOpenAiEnabled()) {
    throw new Error("OpenAI is not configured. Set OPENAI_API_KEY in .env.");
  }

  const messages = [];
  if (options.system) {
    messages.push({ role: "system", content: options.system });
  }
  messages.push({ role: "user", content: prompt });

  const reasoning = isReasoningModel(config.openaiModel);
  const reasoningEffort = options.reasoningEffort ?? config.openaiReasoningEffort ?? "medium";

  // Reasoning tokens count against max_completion_tokens, so a reasoning
  // model needs plenty of headroom or it spends the whole budget thinking
  // and returns an empty message.
  const defaultMaxTokens = reasoning && reasoningEffort !== "minimal" ? 6000 : 1024;

  const body = {
    model: config.openaiModel,
    messages,
    max_completion_tokens: options.maxOutputTokens ?? defaultMaxTokens,
  };

  if (reasoning) {
    body.reasoning_effort = reasoningEffort;
  } else {
    body.temperature = options.temperature ?? 0.2;
  }

  if (options.responseSchema) {
    body.response_format = {
      type: "json_schema",
      json_schema: {
        name: "response",
        strict: true,
        schema: options.responseSchema,
      },
    };
  }

  const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.openaiApiKey}`,
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI ${response.status}: ${text}`);
  }

  const data = text ? JSON.parse(text) : {};
  const output = (data.choices?.[0]?.message?.content || "").trim();

  if (!output) {
    throw new Error(`OpenAI returned an empty response: ${text}`);
  }

  return output;
}

async function openAiGenerateJson(prompt, options = {}) {
  const output = await openAiGenerate(prompt, options);
  return JSON.parse(output);
}

module.exports = {
  isOpenAiEnabled,
  openAiGenerate,
  openAiGenerateJson,
};
