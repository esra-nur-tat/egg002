#!/usr/bin/env node
// API'ye gonderilecek system prompt'u birebir gosterir.
// Kullanim: node scripts/show-prompt.mjs [2025H2]

import { buildContext, systemPrompt } from "../lib/context.mjs";
import { personaPrompt } from "../lib/persona.mjs";

const period = process.argv[2] ?? "2025H2";
const prompt = personaPrompt(period) ?? systemPrompt(period, buildContext(period).contextText);

console.log(`=== SYSTEM PROMPT (${period}) — ${prompt.length} karakter ===\n`);
console.log(prompt);
