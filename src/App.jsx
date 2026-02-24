import { useState, useRef, useCallback } from "react";

// ─── API Helper ──────────────────────────────────────────────

async function callClaude(systemPrompt, userMessage, tools) {
  for (let i = 0; i <= 2; i++) {
    try {
      const body = {
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }]
      };
      if (tools) body.tools = tools;

      const res = await fetch("https://blanc-forge.sarveshblanc1.workers.dev", {   // ← changed URL
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      const text = data.content?.filter(b => b.type === "text").map(b => b.text).join("\n") || "";
      const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})/);
      if (jsonMatch) { try { return JSON.parse(jsonMatch[1].trim()); } catch(e) {} }
      try { return JSON.parse(text.trim()); } catch(e) { return { raw: text }; }
    } catch (err) {
      if (i === 2) return { error: err.message };
      await new Promise(r => setTimeout(r, 1000*(i+1)));
    }
  }
}

// Dedicated discovery call that uses web search to get real brand info
async function discoverBrand(input, systemPrompt) {
  const isUrl = /^https?:\/\//i.test(input.trim()) || /^[\w-]+\.\w{2,}/.test(input.trim());
  const searchTools = [{ type: "web_search_20250305", name: "web_search" }];

  if (isUrl) {
    // Step 1: Use web search to find real info about this brand
    const researchPrompt = `You are a brand researcher. Your job is to gather comprehensive information about a company by searching the web.

Search for the company at this URL: ${input}
Search for their website, about page, product info, press coverage, and any competitor context.
Compile everything you find into a thorough research brief. Include: what the company does, who they serve, their product/offering, their positioning, any notable features, their competitors, and their industry.

Be thorough. Search multiple queries to build a complete picture.`;

    const research = await callClaude(researchPrompt, `Research this company thoroughly: ${input}\n\nSearch their website and any coverage about them. I need real, factual information.`, searchTools);
    const researchText = research?.raw || JSON.stringify(research);

    // Step 2: Now pass the real research to the structured discovery prompt
    const disc = await callClaude(systemPrompt, `Here is comprehensive research about the brand at ${input}:\n\n${researchText}\n\nBased on this research, produce the structured discovery analysis. Use ONLY facts from the research above. Do not make things up.`);
    return disc;
  } else {
    // Description mode: still use web search to enrich if company name is mentioned
    const disc = await callClaude(systemPrompt, `Analyze this brand based on the following description. If you can identify a specific company, search the web to verify and enrich your analysis with real facts.\n\n${input}`, searchTools);
    return disc;
  }
}

// ─── No Em Dash Rule (appended to every prompt) ──────────────

const NO_EM_DASH = `\n\nCRITICAL FORMATTING RULE: NEVER use em dashes anywhere in your output. Use commas, periods, semicolons, colons, or parentheses instead. This applies to all text fields, examples, narratives, descriptions, and copy. No em dashes, en dashes, or any dash longer than a hyphen.`;

// ─── System Prompts ──────────────────────────────────────────

const PROMPTS = {
  quickDiscovery: `You are a world-class brand strategist. Given a brand URL or description, produce a comprehensive discovery analysis.

Return ONLY valid JSON with this exact structure:
{
  "companyName": "extracted or inferred name",
  "companyDescription": "what they do in 2 sentences",
  "industry": "primary industry/category",
  "stage": "pre-launch|early|growing|scaling|established",
  "audiencePrimary": "detailed primary audience description",
  "audienceSecondary": "secondary audience if applicable",
  "audienceLanguage": "how the audience talks about this problem, their actual words",
  "competitors": ["competitor 1", "competitor 2", "competitor 3"],
  "differentiation": "what makes this brand different based on available info",
  "categoryConventions": "common cliches and conventions in this category",
  "foundingInsight": "the likely founding insight or market gap"
}

Be specific and strategic. No generic filler. Make informed inferences.` + NO_EM_DASH,

  positioning: `You are a senior brand positioning strategist who has built positioning for companies like Stripe, Notion, and Linear. You create positioning that is sharp, distinctive, and strategically sound.

Given brand discovery data, generate exactly 3 positioning territories. Each should represent a fundamentally different strategic bet, not just different words for the same idea.

Return ONLY valid JSON:
{
  "territories": [
    {
      "name": "Territory Name (2-4 words, evocative)",
      "positioningStatement": "For [audience] who [need], [Brand] is the [category] that [key differentiator] unlike [alternatives] which [limitation].",
      "coreIdea": "The single sentence that captures this territory (punchy, memorable)",
      "valueProp": "Primary value proposition in one line",
      "proofPoints": ["proof 1", "proof 2", "proof 3"],
      "risk": "What this territory trades off or risks",
      "bestFor": "When to choose this territory"
    }
  ]
}

Make each territory genuinely different in strategic direction.` + NO_EM_DASH,

  personality: `You are a brand voice architect. You define brand personalities with surgical precision, not vague platitudes.

Given a positioning territory and brand context, define the complete brand personality.

Return ONLY valid JSON:
{
  "archetype": "Primary brand archetype",
  "archetypeBlend": "Primary + secondary archetype blend description",
  "personalityTraits": [
    {
      "trait": "Trait name",
      "definition": "What this means for THIS brand specifically",
      "inPractice": "How this shows up in actual communications",
      "notThis": "What this trait does NOT mean (common misinterpretation)"
    }
  ],
  "voicePrinciples": [
    {
      "principle": "Short principle name",
      "description": "What this means",
      "doExample": "Example of copy that follows this principle",
      "dontExample": "Example of copy that violates this principle"
    }
  ],
  "toneSpectrum": [
    { "context": "e.g. Marketing homepage", "toneDescription": "How the voice flexes here", "example": "Sample sentence" },
    { "context": "e.g. Error message", "toneDescription": "How the voice flexes here", "example": "Sample sentence" },
    { "context": "e.g. Sales email", "toneDescription": "How the voice flexes here", "example": "Sample sentence" },
    { "context": "e.g. Social media", "toneDescription": "How the voice flexes here", "example": "Sample sentence" }
  ]
}

Be specific to THIS brand. Every example should feel like it was written FOR this company.` + NO_EM_DASH,

  messaging: `You are a messaging strategist who builds message architectures for high-growth companies. Your frameworks are tight, hierarchical, and immediately usable.

Given brand positioning and personality, create the complete messaging architecture.

Return ONLY valid JSON:
{
  "masterNarrative": "The brand story in ~100 words. Not a tagline, a narrative that captures problem, insight, solution, vision.",
  "elevatorPitches": {
    "tenSecond": "10-second pitch (1 sentence)",
    "thirtySecond": "30-second pitch (2-3 sentences)",
    "sixtySecond": "60-second pitch (4-5 sentences)"
  },
  "messageHierarchy": {
    "primaryClaim": "The single most important thing to communicate",
    "supportingMessages": [
      { "message": "Supporting message", "proofPoints": ["proof 1", "proof 2"], "audience": "Who this resonates with most" }
    ]
  },
  "audienceMessages": [
    { "audience": "Segment name", "painPoint": "Their specific pain", "message": "Tailored message", "cta": "What we want them to do" }
  ]
}` + NO_EM_DASH,

  verbalIdentity: `You are a verbal identity designer. You create the linguistic toolkit that makes brands sound unmistakably themselves.

Given the full brand strategy, create the complete verbal identity system.

Return ONLY valid JSON:
{
  "taglines": [
    { "tagline": "The tagline", "type": "conviction|descriptive|provocative|aspirational", "rationale": "Why this works" }
  ],
  "vocabulary": {
    "ownedWords": ["words this brand owns/uses distinctively"],
    "powerWords": ["words that amplify the brand voice"],
    "bannedWords": ["words that betray the brand personality"],
    "bannedPhrases": ["phrases to never use"]
  },
  "namingConventions": {
    "productNaming": "How products should be named + examples",
    "featureNaming": "How features should be named + examples",
    "pattern": "The naming pattern/logic"
  },
  "boilerplate": {
    "oneLiner": "Single line company description",
    "short": "2-3 sentence description",
    "full": "Full paragraph description"
  },
  "writingGuidelines": [
    { "rule": "Rule name", "description": "What to do", "goodExample": "Done right", "badExample": "Done wrong" }
  ]
}

Generate 4-5 tagline options. Be bold. The vocabulary should be genuinely distinctive.` + NO_EM_DASH,

  visualIdentity: `You are a visual identity strategist who bridges brand strategy and design execution.

Given the complete brand strategy, define the visual identity system with precise specifications.

Return ONLY valid JSON:
{
  "colorPalette": {
    "primary": { "hex": "#XXXXXX", "name": "Color name", "usage": "When/where to use", "rationale": "Why this color" },
    "secondary": { "hex": "#XXXXXX", "name": "Color name", "usage": "When/where", "rationale": "Why" },
    "accent": { "hex": "#XXXXXX", "name": "Color name", "usage": "When/where", "rationale": "Why" },
    "neutral": { "hex": "#XXXXXX", "name": "Color name", "usage": "Backgrounds/text" },
    "neutralLight": { "hex": "#XXXXXX", "name": "Color name", "usage": "Light backgrounds" },
    "dark": { "hex": "#XXXXXX", "name": "Color name", "usage": "Dark text/backgrounds" }
  },
  "typography": {
    "headingFont": "Google Font name", "headingWeight": "700", "headingStyle": "Why this font",
    "bodyFont": "Google Font name", "bodyWeight": "400", "bodyStyle": "Why this font",
    "pairingRationale": "Why these work together"
  },
  "logoDirection": {
    "style": "wordmark|symbol|combination|lettermark",
    "characteristics": ["characteristic 1", "characteristic 2"],
    "avoid": ["what to avoid"],
    "moodDescription": "The feel the logo should convey"
  },
  "imageryStyle": {
    "photographyDirection": "How photos should look",
    "illustrationDirection": "If/how illustrations work",
    "iconographyStyle": "Icon style (line weight, corners, fill)",
    "patterns": "Patterns or textures that reinforce the brand"
  },
  "layoutPrinciples": {
    "gridStyle": "How layouts should feel",
    "whitespace": "Whitespace philosophy",
    "informationDensity": "Dense/balanced/spacious",
    "overallMood": "Visual mood in one sentence"
  }
}

Choose strategically meaningful AND visually sophisticated colors. Avoid cliche tech palettes. Use distinctive Google Fonts (not Inter, Roboto, Open Sans).` + NO_EM_DASH,
};

// ─── Pipeline Runner ─────────────────────────────────────────

function toneInstruction(toneValue) {
  const toneMap = {
    0: "TONE DIRECTIVE: The brand voice should be quirky, weird, and unexpected. Think rule-breaking, irreverent humor, unconventional metaphors. Brands like Oatly or Liquid Death. Copy should surprise, provoke a smile, and feel nothing like a corporation wrote it.",
    1: "TONE DIRECTIVE: The brand voice should be playful, fun, and personality-forward. Think lighthearted wit, friendly energy, approachable cleverness. Brands like Mailchimp or Slack. Copy should feel human, warm, and a little cheeky.",
    2: "TONE DIRECTIVE: The brand voice should be conversational, warm, and approachable while still being sharp and smart. Think smart friend who explains things clearly. Brands like Notion or Figma. Copy should feel natural, never stiff.",
    3: "TONE DIRECTIVE: The brand voice should be balanced and context-adaptive. Not too casual, not too formal. It can flex depending on the audience and channel. Copy should feel confident and clear without leaning too hard in either direction.",
    4: "TONE DIRECTIVE: The brand voice should be professional, clear, and credible. Think competence and precision. Brands like Stripe or Linear. Copy should feel trustworthy, direct, and efficient. Avoid fluff or unnecessary personality.",
    5: "TONE DIRECTIVE: The brand voice should be polished, refined, and authoritative. Think premium and editorial. Brands like Apple or Aesop. Copy should feel considered, elegant, and subtly powerful. Every word earns its place.",
    6: "TONE DIRECTIVE: The brand voice should be formal, institutional, and legacy-ready. Think gravitas and authority. Brands like McKinsey or Goldman Sachs. Copy should feel commanding, precise, and appropriate for boardrooms and annual reports.",
  };
  return "\n\n" + (toneMap[toneValue] || toneMap[3]) + " This tone directive should influence ALL copy, examples, taglines, voice principles, and messaging you generate.";
}

async function runPipeline(input, isQuick, toneValue, onStage, onResult) {
  let ctx = {};
  const ti = toneInstruction(toneValue);
  ctx._tone = toneValue;

  onStage("audit", "Scanning brand presence...");
  if (isQuick) {
    const disc = await discoverBrand(input, PROMPTS.quickDiscovery + ti);
    if (disc.error) { onResult({ error: disc.error }); return; }
    ctx.discovery = disc;
  } else { ctx.discovery = input; }

  onStage("competitive", "Mapping competitive landscape...");
  // Use web search to enrich competitive data for both modes
  const compName = ctx.discovery?.companyName || ctx.discovery?.companyDescription || "";
  const compIndustry = ctx.discovery?.industry || "";
  if (compName && compIndustry) {
    const compResearch = await callClaude(
      `You are a competitive intelligence researcher. Search the web for competitors of this company and their market positioning. Return a brief competitive landscape summary.`,
      `Research competitors of ${compName} in the ${compIndustry} space. Find their main competitors, how they position themselves, and what differentiates each.`,
      [{ type: "web_search_20250305", name: "web_search" }]
    );
    const compText = compResearch?.raw || JSON.stringify(compResearch);
    // Enrich discovery with real competitive data
    ctx.discovery = { ...ctx.discovery, competitiveResearch: compText };
  }

  onStage("positioning", "Generating positioning territories...");
  ctx.positioning = await callClaude(PROMPTS.positioning + ti, `Brand Discovery:\n${JSON.stringify(ctx.discovery, null, 2)}\n\nGenerate 3 positioning territories.`);

  onStage("personality", "Defining brand personality & voice...");
  const territory = ctx.positioning?.territories?.[0] || ctx.positioning;
  ctx.personality = await callClaude(PROMPTS.personality + ti, `Brand:\n${JSON.stringify(ctx.discovery, null, 2)}\n\nPositioning:\n${JSON.stringify(territory, null, 2)}\n\nDefine personality and voice.`);

  onStage("messaging", "Crafting messaging architecture...");
  ctx.messaging = await callClaude(PROMPTS.messaging + ti, `Brand:\n${JSON.stringify(ctx.discovery, null, 2)}\n\nPositioning:\n${JSON.stringify(territory, null, 2)}\n\nPersonality:\n${JSON.stringify(ctx.personality, null, 2)}\n\nCreate messaging architecture.`);

  onStage("verbal", "Building verbal identity...");
  ctx.verbal = await callClaude(PROMPTS.verbalIdentity + ti, `Discovery:\n${JSON.stringify(ctx.discovery, null, 2)}\n\nPositioning:\n${JSON.stringify(territory, null, 2)}\n\nPersonality:\n${JSON.stringify(ctx.personality, null, 2)}\n\nMessaging:\n${JSON.stringify(ctx.messaging, null, 2)}\n\nCreate verbal identity.`);

  onStage("visual", "Generating visual identity...");
  ctx.visual = await callClaude(PROMPTS.visualIdentity + ti, `Discovery:\n${JSON.stringify(ctx.discovery, null, 2)}\n\nPositioning:\n${JSON.stringify(territory, null, 2)}\n\nPersonality:\n${JSON.stringify(ctx.personality, null, 2)}\n\nVisual prefs: ${JSON.stringify(ctx.discovery?.visualPreferences || [])}\n\nDefine visual identity.`);

  onStage("guidelines", "Compiling...");
  await new Promise(r => setTimeout(r, 400));
  onResult(ctx);
}

// ─── Section Regeneration ────────────────────────────────────

async function regenerateSection(sectionId, context, instructions) {
  const { discovery, positioning, personality, messaging, verbal, visual } = context;
  const territory = positioning?.territories?.[0] || positioning;
  const extra = instructions ? `\n\nADDITIONAL INSTRUCTIONS FROM USER: ${instructions}` : "";
  const ti = toneInstruction(context._tone ?? 3);

  switch (sectionId) {
    case "positioning":
      return await callClaude(PROMPTS.positioning + ti, `Brand:\n${JSON.stringify(discovery, null, 2)}\n\nGenerate 3 new positioning territories.${extra}`);
    case "voice":
      return await callClaude(PROMPTS.personality + ti, `Brand:\n${JSON.stringify(discovery, null, 2)}\n\nPositioning:\n${JSON.stringify(territory, null, 2)}\n\nDefine personality and voice.${extra}`);
    case "messaging":
      return await callClaude(PROMPTS.messaging + ti, `Brand:\n${JSON.stringify(discovery, null, 2)}\n\nPositioning:\n${JSON.stringify(territory, null, 2)}\n\nPersonality:\n${JSON.stringify(personality, null, 2)}\n\nCreate messaging.${extra}`);
    case "verbal":
      return await callClaude(PROMPTS.verbalIdentity + ti, `Discovery:\n${JSON.stringify(discovery, null, 2)}\n\nPositioning:\n${JSON.stringify(territory, null, 2)}\n\nPersonality:\n${JSON.stringify(personality, null, 2)}\n\nMessaging:\n${JSON.stringify(messaging, null, 2)}\n\nCreate verbal identity.${extra}`);
    case "visual":
      return await callClaude(PROMPTS.visualIdentity + ti, `Discovery:\n${JSON.stringify(discovery, null, 2)}\n\nPositioning:\n${JSON.stringify(territory, null, 2)}\n\nPersonality:\n${JSON.stringify(personality, null, 2)}\n\nVisual prefs: ${JSON.stringify(discovery?.visualPreferences || [])}\n\nDefine visual identity.${extra}`);
    default: return null;
  }
}

async function cascadeFromSection(sectionId, context, onStage) {
  const order = ["positioning", "voice", "messaging", "verbal", "visual"];
  const startIdx = order.indexOf(sectionId) + 1;
  let ctx = { ...context };
  for (let i = startIdx; i < order.length; i++) {
    const sec = order[i];
    onStage(sec);
    const result = await regenerateSection(sec, ctx, null);
    if (sec === "voice") ctx.personality = result;
    else if (sec === "positioning") ctx.positioning = result;
    else ctx[sec] = result;
  }
  return ctx;
}

// ─── Export Functions ────────────────────────────────────────

// ─── Blob download helper (works inside iframe sandbox) ─────

function downloadBlob(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}

function exportAsPDF(data) {
  const { discovery, positioning, personality, messaging, verbal, visual } = data;
  const brandName = discovery?.companyName || "Brand";
  const territory = positioning?.territories?.[0];
  const c = visual?.colorPalette || {};

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${brandName} Brand Guidelines</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
*{margin:0;padding:0;box-sizing:border-box}body{font-family:'DM Sans',sans-serif;color:#1a1a1a;line-height:1.6;padding:0}
.page{padding:60px;max-width:800px;margin:0 auto;page-break-after:always}
.page:last-child{page-break-after:auto}
h1{font-size:36px;font-weight:800;letter-spacing:-0.03em;margin-bottom:8px}
h2{font-size:22px;font-weight:700;margin:36px 0 16px;padding-bottom:8px;border-bottom:2px solid #e5e5e5}
h3{font-size:16px;font-weight:700;margin:20px 0 8px}
p{margin-bottom:12px;font-size:14px}
.subtitle{font-size:16px;color:#666;margin-bottom:32px}
.card{background:#f8f8f8;border-radius:10px;padding:20px;margin-bottom:12px}
.label{font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#999;margin-bottom:6px}
.tagline{font-size:24px;font-weight:700;color:${c.primary?.hex||"#D4A853"}}
.do-dont{display:flex;gap:12px;margin-top:8px}
.do{flex:1;background:#f0f8f0;border-radius:8px;padding:12px;font-size:12px}
.dont{flex:1;background:#fdf0f0;border-radius:8px;padding:12px;font-size:12px}
.color-row{display:flex;gap:16px;flex-wrap:wrap;margin:12px 0}
.swatch{text-align:center}
.swatch-box{width:60px;height:60px;border-radius:10px;border:1px solid #e5e5e5;margin-bottom:4px}
.swatch-hex{font-size:11px;font-weight:700}
.swatch-name{font-size:10px;color:#999}
.chip{display:inline-block;font-size:12px;padding:4px 12px;border-radius:20px;margin:2px 4px 2px 0;font-weight:600}
.chip-owned{background:#fff3d6;color:#8b6914}
.chip-power{background:#e8f5e9;color:#2e7d32}
.chip-banned{background:#fde8e8;color:#c62828}
.print-btn{position:fixed;top:20px;right:20px;padding:12px 24px;background:#D4A853;color:#0a0a0b;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif;z-index:999;box-shadow:0 4px 12px rgba(0,0,0,0.15)}
@media print{.print-btn{display:none}.page{padding:40px}}
</style></head><body>
<button class="print-btn" onclick="window.print()">Print / Save as PDF</button>

<div class="page">
<h1>${brandName}</h1>
<p class="subtitle">Brand Guidelines</p>
${territory ? `<div class="card"><div class="label">Core Positioning</div><p style="font-size:18px;font-weight:600">${territory.coreIdea}</p></div>` : ""}
${messaging?.masterNarrative ? `<div class="card"><div class="label">Master Narrative</div><p>${messaging.masterNarrative}</p></div>` : ""}
${verbal?.taglines?.[0] ? `<div class="card"><div class="label">Lead Tagline</div><p class="tagline">${verbal.taglines[0].tagline}</p></div>` : ""}
${c.primary ? `<div class="label" style="margin-top:24px">Color Palette</div><div class="color-row">${Object.entries(c).map(([k,v])=>`<div class="swatch"><div class="swatch-box" style="background:${v.hex}"></div><div class="swatch-hex">${v.hex}</div><div class="swatch-name">${v.name||k}</div></div>`).join("")}</div>` : ""}
</div>

<div class="page">
<h2>Positioning</h2>
${positioning?.territories?.map((t,i)=>`<div class="card"><h3>${t.name}${i===0?" (Recommended)":""}</h3><p style="font-size:13px;color:#666">${t.positioningStatement}</p><div class="label" style="margin-top:12px">Core Idea</div><p style="font-weight:600">${t.coreIdea}</p><div class="label">Value Proposition</div><p>${t.valueProp}</p></div>`).join("")||""}
</div>

<div class="page">
<h2>Brand Personality & Voice</h2>
${personality?.archetype?`<div class="card"><div class="label">Archetype</div><h3>${personality.archetype}</h3><p style="font-size:13px;color:#666">${personality.archetypeBlend||""}</p></div>`:""}
${personality?.personalityTraits?.map(t=>`<div class="card"><h3>${t.trait}</h3><p style="font-size:13px">${t.definition}</p><div class="do-dont"><div class="do"><strong>In practice:</strong> ${t.inPractice}</div><div class="dont"><strong>Not this:</strong> ${t.notThis}</div></div></div>`).join("")||""}
<h2>Voice Principles</h2>
${personality?.voicePrinciples?.map(v=>`<div class="card"><h3>${v.principle}</h3><p style="font-size:13px;color:#666">${v.description}</p><div class="do-dont"><div class="do"><strong>Do:</strong> <em>${v.doExample}</em></div><div class="dont"><strong>Don't:</strong> <em>${v.dontExample}</em></div></div></div>`).join("")||""}
</div>

<div class="page">
<h2>Messaging</h2>
${messaging?.elevatorPitches?Object.entries(messaging.elevatorPitches).map(([k,v])=>`<div class="card"><div class="label">${k.replace(/([A-Z])/g,' $1').trim()}</div><p>${v}</p></div>`).join(""):""}
${messaging?.messageHierarchy?`<div class="card"><div class="label">Primary Claim</div><p style="font-size:16px;font-weight:700">${messaging.messageHierarchy.primaryClaim}</p></div>${messaging.messageHierarchy.supportingMessages?.map(m=>`<div class="card"><p style="font-weight:600">${m.message}</p><p style="font-size:12px;color:#999">Audience: ${m.audience}</p></div>`).join("")||""}`:""}
</div>

<div class="page">
<h2>Verbal Identity</h2>
<h3>Taglines</h3>
${verbal?.taglines?.map((t,i)=>`<div class="card"><p style="font-size:${i===0?20:16}px;font-weight:700;${i===0?`color:${c.primary?.hex||"#D4A853"}`:""}">${t.tagline}</p><p style="font-size:11px;color:#999">${t.type} / ${t.rationale}</p></div>`).join("")||""}
${verbal?.vocabulary?`<h3>Vocabulary</h3><div class="card"><div class="label">Owned Words</div><div>${verbal.vocabulary.ownedWords?.map(w=>`<span class="chip chip-owned">${w}</span>`).join("")||""}</div><div class="label" style="margin-top:12px">Power Words</div><div>${verbal.vocabulary.powerWords?.map(w=>`<span class="chip chip-power">${w}</span>`).join("")||""}</div><div class="label" style="margin-top:12px">Banned Words</div><div>${verbal.vocabulary.bannedWords?.map(w=>`<span class="chip chip-banned">${w}</span>`).join("")||""}</div></div>`:""}
${verbal?.boilerplate?`<h3>Boilerplate</h3>${Object.entries(verbal.boilerplate).map(([k,v])=>`<div class="card"><div class="label">${k}</div><p>${v}</p></div>`).join("")}`:""}
</div>

<div class="page">
<h2>Visual Identity</h2>
${c.primary?`<h3>Color Palette</h3><div class="color-row">${Object.entries(c).map(([k,v])=>`<div class="swatch"><div class="swatch-box" style="background:${v.hex}"></div><div class="swatch-hex">${v.hex}</div><div class="swatch-name">${v.name||k}</div><p style="font-size:10px;color:#999;max-width:80px">${v.rationale||""}</p></div>`).join("")}</div>`:""}
${visual?.typography?`<h3>Typography</h3><div class="card"><div class="label">Heading</div><p style="font-size:20px;font-weight:700">${visual.typography.headingFont}</p><p style="font-size:12px;color:#666">${visual.typography.headingStyle}</p><div class="label" style="margin-top:12px">Body</div><p style="font-size:16px">${visual.typography.bodyFont}</p><p style="font-size:12px;color:#666">${visual.typography.bodyStyle}</p></div>`:""}
${visual?.logoDirection?`<h3>Logo Direction</h3><div class="card"><div class="label">Style: ${visual.logoDirection.style}</div><p>${visual.logoDirection.moodDescription}</p></div>`:""}
${visual?.imageryStyle?`<h3>Imagery</h3><div class="card"><div class="label">Photography</div><p style="font-size:13px">${visual.imageryStyle.photographyDirection}</p><div class="label" style="margin-top:8px">Iconography</div><p style="font-size:13px">${visual.imageryStyle.iconographyStyle}</p></div>`:""}
</div>

<p style="text-align:center;color:#ccc;font-size:11px;padding:20px">Generated by Blanc Forge</p>
</body></html>`;

  downloadBlob(html, `${brandName} Brand Guidelines.html`, "text/html");
}

// ─── PPTX-style HTML Deck Export ─────────────────────────────

function hexClean(hex) { return (hex || "D4A853").replace("#", ""); }

function exportAsPPTX(data) {
  const { discovery, positioning, personality, messaging, verbal, visual } = data;
  const brandName = discovery?.companyName || "Brand";
  const territory = positioning?.territories?.[0];
  const c = visual?.colorPalette || {};
  const pri = c.primary?.hex || "#D4A853";
  const dark = c.dark?.hex || "#0A0A0B";
  const light = c.neutralLight?.hex || "#F5F5F5";

  const slideStyle = `width:960px;height:540px;position:relative;overflow:hidden;margin:0 auto 24px;border-radius:8px;box-shadow:0 4px 24px rgba(0,0,0,0.15);page-break-after:always;`;

  const slides = [];

  // Title slide
  slides.push(`<div style="${slideStyle}background:${dark};padding:60px">
    <div style="position:absolute;bottom:0;left:0;right:0;height:80px;background:${pri};opacity:0.15"></div>
    <h1 style="font-size:48px;font-weight:800;color:#fff;letter-spacing:6px;margin-top:80px">${brandName.toUpperCase()}</h1>
    <p style="font-size:18px;color:${pri};margin-top:12px">Brand Guidelines</p>
    ${verbal?.taglines?.[0] ? `<p style="font-size:14px;color:#999;margin-top:24px;font-style:italic">"${verbal.taglines[0].tagline}"</p>` : ""}
    <p style="position:absolute;bottom:24px;left:60px;font-size:10px;color:#555">Generated by Blanc Forge</p>
  </div>`);

  // Overview slide
  slides.push(`<div style="${slideStyle}background:${light};padding:48px">
    <div style="font-size:10px;font-weight:700;letter-spacing:4px;color:${pri};text-transform:uppercase;margin-bottom:16px">Brand Overview</div>
    ${territory ? `<p style="font-size:22px;font-weight:700;color:${dark};margin-bottom:20px">${territory.coreIdea}</p>` : ""}
    ${messaging?.masterNarrative ? `<p style="font-size:13px;color:#444;line-height:1.7;max-width:720px">${messaging.masterNarrative}</p>` : ""}
    ${c.primary ? `<div style="display:flex;height:40px;border-radius:6px;overflow:hidden;position:absolute;bottom:32px;left:48px;right:48px">${Object.values(c).map(v=>`<div style="flex:1;background:${v.hex}"></div>`).join("")}</div>` : ""}
  </div>`);

  // Positioning slides
  positioning?.territories?.forEach((t, i) => {
    const bg = i === 0 ? dark : light;
    const tc = i === 0 ? "#fff" : dark;
    const tc2 = i === 0 ? "#bbb" : "#666";
    slides.push(`<div style="${slideStyle}background:${bg};padding:48px">
      <div style="font-size:9px;font-weight:700;letter-spacing:3px;color:${pri};text-transform:uppercase">Territory ${i+1}${i===0?" (Recommended)":""}</div>
      <h2 style="font-size:28px;font-weight:700;color:${tc};margin:8px 0 12px">${t.name}</h2>
      <p style="font-size:14px;font-weight:600;color:${i===0?pri:c.accent?.hex||pri};margin-bottom:16px">${t.coreIdea}</p>
      <p style="font-size:12px;color:${tc2};line-height:1.5;max-width:640px">${t.positioningStatement}</p>
      <div style="display:flex;gap:32px;margin-top:24px;font-size:11px">
        <div><span style="color:${tc2}">Value: </span><span style="color:${tc}">${t.valueProp}</span></div>
      </div>
      <div style="display:flex;gap:24px;position:absolute;bottom:32px;left:48px;font-size:10px">
        <span style="color:#c66">Risk: ${t.risk||"N/A"}</span>
        <span style="color:#6a6">Best for: ${t.bestFor||"N/A"}</span>
      </div>
    </div>`);
  });

  // Voice slide
  if (personality?.personalityTraits) {
    slides.push(`<div style="${slideStyle}background:${light};padding:48px">
      <div style="font-size:9px;font-weight:700;letter-spacing:3px;color:${pri};text-transform:uppercase;margin-bottom:20px">Personality Traits</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        ${personality.personalityTraits.slice(0,4).map(t => `<div style="background:#fff;border-radius:8px;padding:16px;box-shadow:0 1px 4px rgba(0,0,0,0.06)">
          <div style="font-size:10px;font-weight:700;letter-spacing:2px;color:${pri};text-transform:uppercase;margin-bottom:6px">${t.trait}</div>
          <p style="font-size:11px;color:#444;margin-bottom:8px">${t.definition}</p>
          <p style="font-size:9px;color:#484"><b>Do:</b> ${t.inPractice}</p>
          <p style="font-size:9px;color:#a55"><b>Not:</b> ${t.notThis}</p>
        </div>`).join("")}
      </div>
    </div>`);
  }

  // Messaging slide
  if (messaging?.messageHierarchy) {
    slides.push(`<div style="${slideStyle}background:${light};padding:48px">
      <div style="font-size:9px;font-weight:700;letter-spacing:3px;color:${pri};text-transform:uppercase;margin-bottom:16px">Message Hierarchy</div>
      <div style="background:${dark};border-radius:8px;padding:16px 20px;margin-bottom:16px">
        <p style="font-size:15px;font-weight:700;color:${pri}">${messaging.messageHierarchy.primaryClaim}</p>
      </div>
      ${messaging.messageHierarchy.supportingMessages?.slice(0,3).map(m => `<div style="background:#fff;border-radius:8px;padding:14px 18px;margin-bottom:8px;box-shadow:0 1px 3px rgba(0,0,0,0.05)">
        <p style="font-size:12px;font-weight:600;color:${dark}">${m.message}</p>
        <p style="font-size:10px;color:#888;margin-top:4px">Audience: ${m.audience}</p>
      </div>`).join("")||""}
    </div>`);
  }

  // Taglines slide
  if (verbal?.taglines) {
    slides.push(`<div style="${slideStyle}background:${dark};padding:48px">
      <div style="font-size:9px;font-weight:700;letter-spacing:3px;color:${pri};text-transform:uppercase;margin-bottom:24px">Taglines</div>
      ${verbal.taglines.slice(0,5).map((t,i) => `<div style="margin-bottom:${i===0?24:14}px;display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:${i===0?22:16}px;font-weight:700;color:${i===0?pri:"#ddd"}">${t.tagline}</span>
        <span style="font-size:8px;color:#777;text-transform:uppercase;letter-spacing:1px">${t.type}</span>
      </div>`).join("")}
    </div>`);
  }

  // Visual identity slide
  if (c.primary) {
    slides.push(`<div style="${slideStyle}background:${light};padding:48px">
      <div style="font-size:9px;font-weight:700;letter-spacing:3px;color:${pri};text-transform:uppercase;margin-bottom:20px">Color Palette</div>
      <div style="display:flex;gap:20px;margin-bottom:24px">
        ${Object.entries(c).map(([k,v]) => `<div style="text-align:center">
          <div style="width:64px;height:64px;border-radius:10px;background:${v.hex};margin-bottom:6px;box-shadow:0 2px 8px ${v.hex}44"></div>
          <div style="font-size:10px;font-weight:700;color:${dark}">${v.hex}</div>
          <div style="font-size:8px;color:#999">${v.name||k}</div>
        </div>`).join("")}
      </div>
      <div style="display:flex;height:40px;border-radius:8px;overflow:hidden;margin-bottom:32px">${Object.values(c).map(v=>`<div style="flex:1;background:${v.hex}"></div>`).join("")}</div>
      ${visual?.typography ? `<div style="display:flex;gap:40px">
        <div><div style="font-size:9px;font-weight:700;letter-spacing:2px;color:${pri};text-transform:uppercase;margin-bottom:4px">Heading</div><div style="font-size:24px;font-weight:700;color:${dark}">${visual.typography.headingFont}</div></div>
        <div><div style="font-size:9px;font-weight:700;letter-spacing:2px;color:${pri};text-transform:uppercase;margin-bottom:4px">Body</div><div style="font-size:16px;color:${dark}">${visual.typography.bodyFont}</div></div>
      </div>` : ""}
    </div>`);
  }

  // Final slide
  slides.push(`<div style="${slideStyle}background:${dark};display:flex;flex-direction:column;align-items:center;justify-content:center">
    <h1 style="font-size:36px;font-weight:800;color:#fff;letter-spacing:6px">${brandName.toUpperCase()}</h1>
    <p style="font-size:14px;color:${pri};margin-top:8px">Brand Guidelines</p>
    <p style="font-size:10px;color:#555;margin-top:32px">Generated by Blanc Forge</p>
  </div>`);

  const deckHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${brandName} Brand Guidelines Deck</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
*{margin:0;padding:0;box-sizing:border-box}body{font-family:'DM Sans',sans-serif;background:#1a1a1a;padding:40px 0}
.print-btn{position:fixed;top:20px;right:20px;padding:12px 24px;background:${pri};color:#0a0a0b;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif;z-index:999;box-shadow:0 4px 12px rgba(0,0,0,0.3)}
@media print{body{background:#fff;padding:0}.print-btn{display:none}}
</style></head><body>
<button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
${slides.join("\n")}
</body></html>`;

  downloadBlob(deckHtml, `${brandName} Brand Deck.html`, "text/html");
}

// ─── Constants ───────────────────────────────────────────────

const PHASES_NAV = [
  { id:"discovery", label:"Discovery", modules:[{id:"audit",label:"Brand Audit",icon:"🔍"},{id:"competitive",label:"Competitive Intel",icon:"📊"},{id:"interview",label:"Strategy Input",icon:"💬"}]},
  { id:"strategy", label:"Strategy", modules:[{id:"positioning",label:"Positioning",icon:"🎯"},{id:"personality",label:"Personality & Voice",icon:"🗣️"},{id:"messaging",label:"Messaging",icon:"📝"}]},
  { id:"identity", label:"Identity", modules:[{id:"verbal",label:"Verbal Identity",icon:"✍️"},{id:"visual",label:"Visual Identity",icon:"🎨"},{id:"guidelines",label:"Guidelines",icon:"📖"}]},
];

const MODULE_ORDER = ["audit","competitive","interview","positioning","personality","messaging","verbal","visual","guidelines"];

const STAGE_META = [
  {id:"audit",label:"Researching brand (web search)",icon:"🔍"},
  {id:"competitive",label:"Mapping competitive landscape",icon:"📊"},
  {id:"positioning",label:"Generating positioning territories",icon:"🎯"},
  {id:"personality",label:"Defining brand personality & voice",icon:"🗣️"},
  {id:"messaging",label:"Crafting messaging architecture",icon:"📝"},
  {id:"verbal",label:"Building verbal identity",icon:"✍️"},
  {id:"visual",label:"Generating visual identity",icon:"🎨"},
  {id:"guidelines",label:"Compiling brand guidelines",icon:"📖"},
];

const INTERVIEW_STEPS = [
  {id:"cn",type:"text",sec:"Foundation",si:1,q:"What's the name of your company or brand?",ph:"e.g. Zamp, Notion, Linear",f:"companyName"},
  {id:"cd",type:"textarea",sec:"Foundation",si:1,q:"In one or two sentences, what does your company do?",sub:"Don't overthink it.",ph:"e.g. We build AI agents that automate enterprise back-office operations...",f:"companyDescription"},
  {id:"ind",type:"text",sec:"Foundation",si:1,q:"What industry or category are you in?",ph:"e.g. Enterprise AI, Fintech",f:"industry"},
  {id:"fs",type:"textarea",sec:"Foundation",si:1,q:"What's the origin story?",sub:"The founding insight, the gap you saw.",ph:"e.g. We watched enterprise teams spend weeks executing decisions...",f:"foundingStory"},
  {id:"st",type:"select",sec:"Foundation",si:1,q:"What stage is the company at?",opts:[{v:"pre-launch",l:"Pre-launch"},{v:"early",l:"Early stage"},{v:"growing",l:"Growing"},{v:"scaling",l:"Scaling"},{v:"established",l:"Established"},{v:"rebrand",l:"Rebranding"}],f:"stage"},
  {id:"ap",type:"textarea",sec:"Audience",si:2,q:"Who is your primary audience?",sub:"Be specific.",ph:"e.g. CFOs at mid-market companies...",f:"audiencePrimary"},
  {id:"as",type:"textarea",sec:"Audience",si:2,q:"Secondary audience?",ph:"e.g. IT leaders...",f:"audienceSecondary",opt:true},
  {id:"al",type:"textarea",sec:"Audience",si:2,q:"How does your audience talk about this problem?",sub:"Their words, not yours.",ph:"e.g. 'We need to automate our close process'",f:"audienceLanguage"},
  {id:"ps",type:"sliders",sec:"Personality",si:3,q:"Where does your brand sit on these spectrums?",sliders:[{id:"fc",l:"Formal",r:"Casual",f:"pFC"},{id:"sp",l:"Serious",r:"Playful",f:"pSP"},{id:"ta",l:"Technical",r:"Accessible",f:"pTA"},{id:"ed",l:"Established",r:"Disruptive",f:"pED"},{id:"rb",l:"Reserved",r:"Bold",f:"pRB"},{id:"me",l:"Minimal",r:"Expressive",f:"pME"}]},
  {id:"pt",type:"multi",sec:"Personality",si:3,q:"Pick 3-5 personality words.",opts:["Authoritative","Visionary","Trustworthy","Innovative","Warm","Precise","Ambitious","Approachable","Provocative","Elegant","Relentless","Empathetic","Confident","Rebellious","Thoughtful","Energetic","Pragmatic","Sophisticated","Fierce","Human"],f:"personalityTraits",min:3,max:5},
  {id:"pa",type:"multi",sec:"Personality",si:3,q:"Pick 3-5 anti-traits.",opts:["Generic","Corporate","Gimmicky","Cold","Aggressive","Boring","Pretentious","Cheap","Timid","Robotic","Salesy","Confusing","Trendy","Stuffy","Vague","Arrogant","Sloppy","Desperate","Rigid","Forgettable"],f:"antiTraits",min:3,max:5},
  {id:"comp",type:"textarea",sec:"Competitive",si:4,q:"Top 3-5 competitors?",ph:"e.g. Workato, UiPath, Moveworks",f:"competitors"},
  {id:"diff",type:"textarea",sec:"Competitive",si:4,q:"What makes you genuinely different?",ph:"e.g. We execute entire business decisions...",f:"differentiation"},
  {id:"conv",type:"textarea",sec:"Competitive",si:4,q:"Category conventions to break?",ph:"e.g. Blue/purple gradients, 'leveraging AI'...",f:"categoryConventions",opt:true},
  {id:"asp",type:"textarea",sec:"Aspiration",si:5,q:"2-3 brands you admire?",ph:"e.g. Stripe, Patagonia, Apple",f:"aspirationalBrands"},
  {id:"amb",type:"textarea",sec:"Aspiration",si:5,q:"Where is this brand headed in 3-5 years?",ph:"e.g. Own the decision-to-action space...",f:"ambition"},
  {id:"nn",type:"textarea",sec:"Guardrails",si:6,q:"Non-negotiables?",ph:"e.g. The name is non-negotiable.",f:"nonNegotiables",opt:true},
  {id:"vp",type:"multi",sec:"Guardrails",si:6,q:"Visual instincts?",opts:["Dark & moody","Light & airy","High contrast","Muted & earthy","Neon & electric","Monochrome","Warm tones","Cool tones","Geometric & structured","Organic & fluid","Typography-forward","Photography-heavy"],f:"visualPreferences",min:1,max:4},
];

// ─── Sidebar Component ──────────────────────────────────────

function Sidebar({ activeModule, completedModules }) {
  return (
    <div style={S.sidebar}>
      <div style={S.logoArea}><span style={S.logoMark}>◆</span><span style={S.logoText}>Blanc Forge</span></div>
      <div style={S.phasesNav}>
        {PHASES_NAV.map((ph,pi) => (
          <div key={ph.id} style={S.phaseGroup}>
            <div style={S.phaseLabel}>{`0${pi+1} \u2014 ${ph.label}`}</div>
            {ph.modules.map(m => {
              const done = completedModules?.includes(m.id); const active = m.id===activeModule; const locked = !done && !active;
              return <div key={m.id} style={{...S.modItem,...(active?S.modActive:{}),...(done?S.modDone:{}),...(locked?S.modLocked:{})}}><span style={S.modIcon}>{done?"✓":m.icon}</span><span style={{opacity:locked?0.4:1}}>{m.label}</span>{active&&<span style={S.activeDot}/>}{locked&&!done&&<span style={S.lockBadge}>🔒</span>}</div>;
            })}
          </div>
        ))}
      </div>
      <div style={S.sidebarFoot}><span style={S.footTxt}>Powered by Claude API</span></div>
    </div>
  );
}

// ─── Regen Controls Component ────────────────────────────────

function ModeSelection({ onSelect }) {
  const [h, setH] = useState(null);
  return (
    <div style={S.centered}>
      <div style={{maxWidth:680,width:"100%"}}>
        <div style={{textAlign:"center",marginBottom:56}}>
          <span style={{fontSize:28,color:"#D4A853",display:"block",marginBottom:16}}>◆</span>
          <h1 style={{fontSize:48,fontWeight:800,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:14,marginTop:0}}>Blanc Forge</h1>
          <p style={{fontSize:16,lineHeight:1.6,color:"rgba(255,255,255,0.4)",maxWidth:460,margin:"0 auto"}}>AI-powered brand strategy engine. From research to complete brand guidelines.</p>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <button onClick={()=>onSelect("quick")} onMouseEnter={()=>setH("q")} onMouseLeave={()=>setH(null)} style={{...S.card,...(h==="q"?S.cardHover:{})}}>
            <div style={S.cardIcon}>⚡</div>
            <div style={{flex:1}}><h2 style={S.cardTitle}>Quick Forge</h2><p style={S.cardDesc}>Drop a URL or description. Fully automated pipeline.</p><div style={S.cardTags}><span style={S.tag}>~3 min</span><span style={S.tag}>Automated</span><span style={S.tag}>1 input</span></div></div>
            <span style={{fontSize:20,color:"rgba(255,255,255,0.2)"}}>→</span>
          </button>
          <button onClick={()=>onSelect("deep")} onMouseEnter={()=>setH("d")} onMouseLeave={()=>setH(null)} style={{...S.card,...(h==="d"?S.cardHover:{})}}>
            <div style={S.cardIcon}>🧠</div>
            <div style={{flex:1}}><h2 style={S.cardTitle}>Deep Forge</h2><p style={S.cardDesc}>Guided strategic interview. Maximum control.</p><div style={S.cardTags}><span style={S.tag}>~15 min</span><span style={S.tag}>Guided</span><span style={S.tag}>18 questions</span></div></div>
            <span style={{fontSize:20,color:"rgba(255,255,255,0.2)"}}>→</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Regen Controls ──────────────────────────────────────────

function RegenControls({ sectionId, onRegen, onRegenWithInstructions, onCascade, isRegenerating, cascading }) {
  const [showInstructions, setShowInstructions] = useState(false);
  const [instructions, setInstructions] = useState("");

  if (cascading) return <div style={S.regenBar}><span style={S.regenSpinner}>⟳</span><span style={{fontSize:12,color:"#D4A853"}}>Cascading changes across all sections...</span></div>;
  if (isRegenerating) return <div style={S.regenBar}><span style={S.regenSpinner}>⟳</span><span style={{fontSize:12,color:"#D4A853"}}>Regenerating...</span></div>;

  return (
    <div style={S.regenBar}>
      {showInstructions ? (
        <div style={S.regenInstructionsBox}>
          <textarea value={instructions} onChange={e=>setInstructions(e.target.value)} placeholder="e.g. Make the tone more authoritative and less playful. Focus on enterprise credibility." style={S.regenTextarea} rows={3} autoFocus/>
          <div style={{display:"flex",gap:8,marginTop:8}}>
            <button onClick={()=>{onRegenWithInstructions(sectionId,instructions);setShowInstructions(false);setInstructions("");}} disabled={!instructions.trim()} style={{...S.regenBtn,...S.regenBtnGold,...(!instructions.trim()?{opacity:0.4}:{})}}>Regenerate with instructions</button>
            <button onClick={()=>{setShowInstructions(false);setInstructions("");}} style={S.regenBtn}>Cancel</button>
          </div>
        </div>
      ) : (
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <button onClick={()=>onRegen(sectionId)} style={{...S.regenBtn,...S.regenBtnOutline}}>↻ Regenerate</button>
          <button onClick={()=>setShowInstructions(true)} style={{...S.regenBtn,...S.regenBtnOutline}}>↻ Regenerate with instructions</button>
          <button onClick={()=>onCascade(sectionId)} style={{...S.regenBtn,...S.regenBtnGold}} title="Regenerate this section and all downstream sections">↻ Regenerate & apply across all</button>
        </div>
      )}
    </div>
  );
}

// ─── Results View ────────────────────────────────────────────

function Card({children, style:cs}) { return <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:12,padding:20,marginBottom:12,...cs}}>{children}</div>; }
function Label({children}) { return <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",color:"#D4A853",marginBottom:6}}>{children}</div>; }
function Section({title,children}) { return <div style={{marginBottom:48}}><h2 style={{fontSize:20,fontWeight:700,letterSpacing:"-0.01em",marginBottom:20,color:"#E8E6E3",borderBottom:"1px solid rgba(255,255,255,0.08)",paddingBottom:12}}>{title}</h2>{children}</div>; }

function ResultsView({ data, setData, onBack }) {
  const [activeTab, setActiveTab] = useState("overview");
  const [regenSection, setRegenSection] = useState(null);
  const [cascadingFrom, setCascadingFrom] = useState(null);

  const { discovery, positioning, personality, messaging, verbal, visual } = data;
  const brandName = discovery?.companyName || "Your Brand";
  const territory = positioning?.territories?.[0];
  const c = visual?.colorPalette || {};

  const handleRegen = async (sectionId) => {
    setRegenSection(sectionId);
    const result = await regenerateSection(sectionId, data, null);
    const key = sectionId === "voice" ? "personality" : sectionId;
    setData(prev => ({...prev, [key]: result}));
    setRegenSection(null);
  };

  const handleRegenWithInstructions = async (sectionId, instructions) => {
    setRegenSection(sectionId);
    const result = await regenerateSection(sectionId, data, instructions);
    const key = sectionId === "voice" ? "personality" : sectionId;
    setData(prev => ({...prev, [key]: result}));
    setRegenSection(null);
  };

  const handleCascade = async (sectionId) => {
    setCascadingFrom(sectionId);
    setRegenSection(sectionId);
    // First regen this section
    const result = await regenerateSection(sectionId, data, null);
    const key = sectionId === "voice" ? "personality" : sectionId;
    let newData = {...data, [key]: result};
    setData(newData);
    // Then cascade
    const cascaded = await cascadeFromSection(sectionId, newData, (sec) => setRegenSection(sec));
    setData(prev => ({...prev, ...cascaded}));
    setRegenSection(null);
    setCascadingFrom(null);
  };

  const [exporting, setExporting] = useState(null);
  const [showRegenAll, setShowRegenAll] = useState(false);
  const [regenAllInstr, setRegenAllInstr] = useState("");

  const handleRegenAll = async (instructions) => {
    setShowRegenAll(false); setRegenAllInstr("");
    setCascadingFrom("positioning"); setRegenSection("positioning");
    const pos = await regenerateSection("positioning", data, instructions || null);
    let ctx = {...data, positioning: pos}; setData(ctx);
    const cascaded = await cascadeFromSection("positioning", ctx, (sec) => setRegenSection(sec));
    setData(prev => ({...prev, ...cascaded}));
    setRegenSection(null); setCascadingFrom(null);
  };

  const handleExportPPTX = () => {
    try { exportAsPPTX(data); } catch(e) { console.error("Deck export failed:", e); }
  };

  const tabs = [{id:"overview",label:"Overview"},{id:"positioning",label:"Positioning"},{id:"voice",label:"Voice & Personality"},{id:"messaging",label:"Messaging"},{id:"verbal",label:"Verbal Identity"},{id:"visual",label:"Visual Identity"}];

  const regenProps = (id) => ({ sectionId:id, onRegen:handleRegen, onRegenWithInstructions:handleRegenWithInstructions, onCascade:handleCascade, isRegenerating:regenSection===id, cascading:cascadingFrom && regenSection!==id && cascadingFrom!==id });

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      {/* Top bar */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 40px",borderBottom:"1px solid rgba(255,255,255,0.06)",background:"rgba(15,15,16,0.6)"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <span style={S.completeTag}>Complete</span>
          <span style={{fontSize:14,fontWeight:600,color:"rgba(255,255,255,0.8)"}}>{brandName} Brand Guidelines</span>
        </div>
        <div style={{display:"flex",gap:8}}>
          {/* Regenerate All dropdown */}
          <div style={{position:"relative"}}>
            <button onClick={()=>setShowRegenAll(!showRegenAll)} disabled={!!cascadingFrom} style={{...S.exportBtn,...(cascadingFrom?{opacity:0.5}:{})}}>
              {cascadingFrom ? "⟳ Regenerating..." : "↻ Regenerate All"}
            </button>
            {showRegenAll && <div style={{position:"absolute",right:0,top:"100%",marginTop:6,width:320,background:"#1A1A1B",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,padding:16,zIndex:100,boxShadow:"0 12px 40px rgba(0,0,0,0.5)"}}>
              <button onClick={()=>handleRegenAll(null)} style={{...S.regenBtn,...S.regenBtnOutline,width:"100%",marginBottom:10,padding:"10px 16px"}}>↻ Regenerate everything fresh</button>
              <div style={{fontSize:11,fontWeight:600,color:"rgba(255,255,255,0.4)",marginBottom:6}}>Or regenerate with instructions:</div>
              <textarea value={regenAllInstr} onChange={e=>setRegenAllInstr(e.target.value)} placeholder="e.g. Make everything bolder and more provocative. Target a younger audience." style={{...S.regenTextarea,marginBottom:8}} rows={3}/>
              <button onClick={()=>handleRegenAll(regenAllInstr)} disabled={!regenAllInstr.trim()} style={{...S.regenBtn,...S.regenBtnGold,width:"100%",padding:"10px 16px",...(!regenAllInstr.trim()?{opacity:0.4}:{})}}>↻ Regenerate with instructions</button>
            </div>}
          </div>
          <button onClick={()=>exportAsPDF(data)} style={S.exportBtn}>📄 PDF</button>
          <button onClick={handleExportPPTX} style={S.exportBtn}>📊 Slide Deck</button>
          <button onClick={onBack} style={S.smallBtn}>← New Brand</button>
        </div>
      </div>
      {/* Tabs */}
      <div style={{display:"flex",gap:0,padding:"0 40px",borderBottom:"1px solid rgba(255,255,255,0.06)",background:"rgba(15,15,16,0.4)"}}>
        {tabs.map(t => <button key={t.id} onClick={()=>setActiveTab(t.id)} style={{...S.tab,...(activeTab===t.id?S.tabActive:{})}}>{t.label}</button>)}
      </div>
      {/* Global regen */}
      {(cascadingFrom || regenSection) && <div style={{display:"flex",justifyContent:"center",padding:"8px 40px",borderBottom:"1px solid rgba(212,168,83,0.1)",background:"rgba(212,168,83,0.03)"}}>
        <span style={{fontSize:12,color:"#D4A853",fontWeight:500}}>⟳ {cascadingFrom ? `Cascading regeneration in progress (${regenSection})...` : `Regenerating ${regenSection}...`}</span>
      </div>}
      {/* Content */}
      <div style={{flex:1,overflowY:"auto",padding:"32px 40px"}}>
        <div style={{maxWidth:800,margin:"0 auto"}}>

          {activeTab==="overview" && <>
            <Section title="Brand at a Glance">
              <Card><Label>Company</Label><div style={{fontSize:24,fontWeight:700,marginBottom:8}}>{brandName}</div><p style={{fontSize:14,color:"rgba(255,255,255,0.6)",lineHeight:1.6,margin:0}}>{discovery?.companyDescription||discovery?.raw}</p></Card>
              {territory && <Card><Label>Core Positioning</Label><p style={{fontSize:16,fontWeight:600,lineHeight:1.5,margin:0}}>{territory.coreIdea}</p></Card>}
              {messaging?.masterNarrative && <Card><Label>Master Narrative</Label><p style={{fontSize:14,lineHeight:1.7,color:"rgba(255,255,255,0.7)",margin:0}}>{messaging.masterNarrative}</p></Card>}
              {verbal?.taglines?.[0] && <Card style={{background:"rgba(212,168,83,0.06)",borderColor:"rgba(212,168,83,0.15)"}}><Label>Lead Tagline</Label><p style={{fontSize:22,fontWeight:700,color:"#D4A853",margin:0}}>{verbal.taglines[0].tagline}</p></Card>}
              {c.primary && <Card><Label>Color Palette</Label><div style={{display:"flex",gap:16,flexWrap:"wrap",marginTop:8}}>{Object.entries(c).map(([k,v])=><div key={k} style={{textAlign:"center"}}><div style={{width:56,height:56,borderRadius:10,background:v.hex,border:"1px solid rgba(255,255,255,0.1)",marginBottom:4}}/><div style={{fontSize:10,fontWeight:700}}>{v.hex}</div><div style={{fontSize:9,color:"rgba(255,255,255,0.4)"}}>{v.name}</div></div>)}</div></Card>}
            </Section>
          </>}

          {activeTab==="positioning" && <>
            <RegenControls {...regenProps("positioning")} />
            <Section title="Positioning Territories">
              {positioning?.territories?.map((t,i) => (
                <Card key={i} style={i===0?{borderColor:"rgba(212,168,83,0.3)",background:"rgba(212,168,83,0.04)"}:{}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><span style={{fontSize:16,fontWeight:700}}>{t.name}</span>{i===0&&<span style={S.recTag}>Recommended</span>}</div>
                  <p style={{fontSize:13,lineHeight:1.6,color:"rgba(255,255,255,0.6)",margin:"0 0 12px"}}>{t.positioningStatement}</p>
                  <div style={{background:"rgba(255,255,255,0.03)",borderRadius:8,padding:14,marginBottom:12}}><Label>Core Idea</Label><p style={{fontSize:15,fontWeight:600,margin:0}}>{t.coreIdea}</p></div>
                  <Label>Value Proposition</Label><p style={{fontSize:13,color:"rgba(255,255,255,0.6)",margin:"0 0 12px"}}>{t.valueProp}</p>
                  {t.proofPoints&&<><Label>Proof Points</Label><ul style={{margin:"0 0 12px",paddingLeft:18}}>{t.proofPoints.map((p,j)=><li key={j} style={{fontSize:13,color:"rgba(255,255,255,0.5)",marginBottom:4}}>{p}</li>)}</ul></>}
                  <div style={{display:"flex",gap:20,fontSize:12}}><div><span style={{color:"rgba(255,255,255,0.3)"}}>Risk: </span><span style={{color:"rgba(255,180,180,0.7)"}}>{t.risk}</span></div><div><span style={{color:"rgba(255,255,255,0.3)"}}>Best for: </span><span style={{color:"rgba(180,220,180,0.7)"}}>{t.bestFor}</span></div></div>
                </Card>
              ))}
            </Section>
          </>}

          {activeTab==="voice" && <>
            <RegenControls {...regenProps("voice")} />
            <Section title="Brand Personality">
              {personality?.archetype&&<Card><Label>Archetype</Label><p style={{fontSize:18,fontWeight:700,margin:"0 0 6px"}}>{personality.archetype}</p><p style={{fontSize:13,color:"rgba(255,255,255,0.5)",margin:0}}>{personality.archetypeBlend}</p></Card>}
              {personality?.personalityTraits?.map((t,i)=><Card key={i}><div style={{fontSize:15,fontWeight:700,marginBottom:8}}>{t.trait}</div><p style={{fontSize:13,color:"rgba(255,255,255,0.6)",margin:"0 0 8px"}}>{t.definition}</p><div style={{display:"flex",gap:12,fontSize:12}}><div style={{flex:1,background:"rgba(140,200,140,0.06)",borderRadius:8,padding:10}}><span style={{color:"rgba(140,200,140,0.6)",fontWeight:600}}>In practice: </span><span style={{color:"rgba(255,255,255,0.5)"}}>{t.inPractice}</span></div><div style={{flex:1,background:"rgba(255,180,180,0.06)",borderRadius:8,padding:10}}><span style={{color:"rgba(255,180,180,0.6)",fontWeight:600}}>Not this: </span><span style={{color:"rgba(255,255,255,0.5)"}}>{t.notThis}</span></div></div></Card>)}
            </Section>
            <Section title="Voice Principles">
              {personality?.voicePrinciples?.map((v,i)=><Card key={i}><div style={{fontSize:15,fontWeight:700,marginBottom:6}}>{v.principle}</div><p style={{fontSize:13,color:"rgba(255,255,255,0.5)",margin:"0 0 12px"}}>{v.description}</p><div style={{display:"flex",gap:12,fontSize:12}}><div style={{flex:1,background:"rgba(140,200,140,0.06)",borderRadius:8,padding:12}}><div style={{fontWeight:600,color:"rgba(140,200,140,0.7)",marginBottom:4}}>✓ Do</div><div style={{color:"rgba(255,255,255,0.6)",fontStyle:"italic"}}>{v.doExample}</div></div><div style={{flex:1,background:"rgba(255,180,180,0.06)",borderRadius:8,padding:12}}><div style={{fontWeight:600,color:"rgba(255,180,180,0.7)",marginBottom:4}}>✗ Don't</div><div style={{color:"rgba(255,255,255,0.6)",fontStyle:"italic"}}>{v.dontExample}</div></div></div></Card>)}
            </Section>
            <Section title="Tone Spectrum">
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>{personality?.toneSpectrum?.map((t,i)=><Card key={i}><Label>{t.context}</Label><p style={{fontSize:12,color:"rgba(255,255,255,0.5)",margin:"0 0 8px"}}>{t.toneDescription}</p><div style={{fontSize:13,fontStyle:"italic",color:"rgba(255,255,255,0.7)",background:"rgba(255,255,255,0.03)",borderRadius:6,padding:10}}>"{t.example}"</div></Card>)}</div>
            </Section>
          </>}

          {activeTab==="messaging" && <>
            <RegenControls {...regenProps("messaging")} />
            <Section title="Master Narrative"><Card><p style={{fontSize:15,lineHeight:1.8,color:"rgba(255,255,255,0.7)",margin:0}}>{messaging?.masterNarrative}</p></Card></Section>
            <Section title="Elevator Pitches">{messaging?.elevatorPitches&&Object.entries(messaging.elevatorPitches).map(([k,v])=><Card key={k}><Label>{k.replace(/([A-Z])/g,' $1').replace('ten','10').replace('thirty','30').replace('sixty','60').trim()}</Label><p style={{fontSize:14,lineHeight:1.6,color:"rgba(255,255,255,0.7)",margin:0}}>{v}</p></Card>)}</Section>
            <Section title="Message Hierarchy">{messaging?.messageHierarchy&&<><Card style={{borderColor:"rgba(212,168,83,0.2)",background:"rgba(212,168,83,0.04)"}}><Label>Primary Claim</Label><p style={{fontSize:16,fontWeight:700,margin:0}}>{messaging.messageHierarchy.primaryClaim}</p></Card>{messaging.messageHierarchy.supportingMessages?.map((m,i)=><Card key={i}><div style={{fontSize:14,fontWeight:600,marginBottom:6}}>{m.message}</div><div style={{fontSize:12,color:"rgba(255,255,255,0.4)",marginBottom:6}}>Audience: {m.audience}</div>{m.proofPoints&&<ul style={{margin:0,paddingLeft:16}}>{m.proofPoints.map((p,j)=><li key={j} style={{fontSize:12,color:"rgba(255,255,255,0.5)",marginBottom:2}}>{p}</li>)}</ul>}</Card>)}</>}</Section>
            {messaging?.audienceMessages&&<Section title="Audience Messages">{messaging.audienceMessages.map((a,i)=><Card key={i}><Label>{a.audience}</Label><div style={{fontSize:12,color:"rgba(255,180,180,0.6)",marginBottom:6}}>Pain: {a.painPoint}</div><p style={{fontSize:14,fontWeight:600,color:"rgba(255,255,255,0.8)",margin:"0 0 6px"}}>{a.message}</p><div style={{fontSize:12,color:"rgba(140,200,140,0.6)"}}>CTA: {a.cta}</div></Card>)}</Section>}
          </>}

          {activeTab==="verbal" && <>
            <RegenControls {...regenProps("verbal")} />
            <Section title="Taglines">{verbal?.taglines?.map((t,i)=><Card key={i} style={i===0?{borderColor:"rgba(212,168,83,0.2)",background:"rgba(212,168,83,0.04)"}:{}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:i===0?20:16,fontWeight:700,color:i===0?"#D4A853":"#E8E6E3"}}>{t.tagline}</span><span style={S.typeTag}>{t.type}</span></div><p style={{fontSize:12,color:"rgba(255,255,255,0.4)",margin:"8px 0 0"}}>{t.rationale}</p></Card>)}</Section>
            {verbal?.vocabulary&&<Section title="Brand Vocabulary"><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <Card><Label>Owned Words</Label><div style={{display:"flex",flexWrap:"wrap",gap:6}}>{verbal.vocabulary.ownedWords?.map((w,i)=><span key={i} style={{fontSize:12,background:"rgba(212,168,83,0.1)",color:"#D4A853",padding:"4px 10px",borderRadius:20,fontWeight:600}}>{w}</span>)}</div></Card>
              <Card><Label>Power Words</Label><div style={{display:"flex",flexWrap:"wrap",gap:6}}>{verbal.vocabulary.powerWords?.map((w,i)=><span key={i} style={{fontSize:12,background:"rgba(140,200,140,0.1)",color:"rgba(140,200,140,0.8)",padding:"4px 10px",borderRadius:20,fontWeight:600}}>{w}</span>)}</div></Card>
              <Card><Label>Banned Words</Label><div style={{display:"flex",flexWrap:"wrap",gap:6}}>{verbal.vocabulary.bannedWords?.map((w,i)=><span key={i} style={{fontSize:12,background:"rgba(255,180,180,0.1)",color:"rgba(255,180,180,0.7)",padding:"4px 10px",borderRadius:20,fontWeight:600}}>{w}</span>)}</div></Card>
              <Card><Label>Banned Phrases</Label><div style={{display:"flex",flexWrap:"wrap",gap:6}}>{verbal.vocabulary.bannedPhrases?.map((w,i)=><span key={i} style={{fontSize:12,background:"rgba(255,180,180,0.08)",color:"rgba(255,180,180,0.6)",padding:"4px 10px",borderRadius:20,fontWeight:500}}>{w}</span>)}</div></Card>
            </div></Section>}
            {verbal?.boilerplate&&<Section title="Boilerplate">{Object.entries(verbal.boilerplate).map(([k,v])=><Card key={k}><Label>{k}</Label><p style={{fontSize:14,lineHeight:1.6,color:"rgba(255,255,255,0.7)",margin:0}}>{v}</p></Card>)}</Section>}
            {verbal?.writingGuidelines&&<Section title="Writing Guidelines">{verbal.writingGuidelines.map((g,i)=><Card key={i}><div style={{fontSize:14,fontWeight:700,marginBottom:6}}>{g.rule}</div><p style={{fontSize:12,color:"rgba(255,255,255,0.5)",margin:"0 0 10px"}}>{g.description}</p><div style={{display:"flex",gap:12,fontSize:12}}><div style={{flex:1,background:"rgba(140,200,140,0.06)",borderRadius:8,padding:10}}><span style={{fontWeight:600,color:"rgba(140,200,140,0.7)"}}>✓ </span><span style={{color:"rgba(255,255,255,0.6)",fontStyle:"italic"}}>{g.goodExample}</span></div><div style={{flex:1,background:"rgba(255,180,180,0.06)",borderRadius:8,padding:10}}><span style={{fontWeight:600,color:"rgba(255,180,180,0.7)"}}>✗ </span><span style={{color:"rgba(255,255,255,0.6)",fontStyle:"italic"}}>{g.badExample}</span></div></div></Card>)}</Section>}
          </>}

          {activeTab==="visual" && <>
            <RegenControls {...regenProps("visual")} />
            {c.primary&&<Section title="Color Palette"><Card><div style={{display:"flex",gap:24,flexWrap:"wrap",justifyContent:"center",marginBottom:16}}>{Object.entries(c).map(([k,v])=><div key={k} style={{textAlign:"center"}}><div style={{width:80,height:80,borderRadius:14,background:v.hex,border:"1px solid rgba(255,255,255,0.1)",marginBottom:8,boxShadow:`0 4px 20px ${v.hex}33`}}/><div style={{fontSize:12,fontWeight:700}}>{v.hex}</div><div style={{fontSize:10,color:"rgba(255,255,255,0.4)",marginTop:2}}>{v.name}</div><div style={{fontSize:9,color:"rgba(255,255,255,0.25)",marginTop:2,maxWidth:100}}>{v.usage}</div></div>)}</div><div style={{display:"flex",height:48,borderRadius:10,overflow:"hidden",marginTop:8}}>{Object.values(c).map((v,i)=><div key={i} style={{flex:1,background:v.hex}}/>)}</div></Card>{Object.entries(c).filter(([_,v])=>v.rationale).map(([k,v])=><Card key={k}><div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:16,height:16,borderRadius:4,background:v.hex,flexShrink:0}}/><span style={{fontSize:12,fontWeight:600,color:"rgba(255,255,255,0.6)"}}>{v.name}</span></div><p style={{fontSize:12,color:"rgba(255,255,255,0.4)",margin:"6px 0 0"}}>{v.rationale}</p></Card>)}</Section>}
            {visual?.typography&&<Section title="Typography"><Card><div style={{marginBottom:20}}><Label>Heading Font</Label><div style={{fontSize:32,fontWeight:700,marginBottom:4}}>{visual.typography.headingFont}</div><p style={{fontSize:12,color:"rgba(255,255,255,0.4)",margin:0}}>{visual.typography.headingStyle}</p></div><div style={{marginBottom:20}}><Label>Body Font</Label><div style={{fontSize:18,marginBottom:4}}>{visual.typography.bodyFont}</div><p style={{fontSize:12,color:"rgba(255,255,255,0.4)",margin:0}}>{visual.typography.bodyStyle}</p></div><div style={{background:"rgba(255,255,255,0.03)",borderRadius:8,padding:14}}><Label>Pairing Rationale</Label><p style={{fontSize:12,color:"rgba(255,255,255,0.5)",margin:0}}>{visual.typography.pairingRationale}</p></div></Card></Section>}
            {visual?.logoDirection&&<Section title="Logo Direction"><Card><Label>Style</Label><div style={{fontSize:16,fontWeight:700,marginBottom:8,textTransform:"capitalize"}}>{visual.logoDirection.style}</div><Label>Characteristics</Label><div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12}}>{visual.logoDirection.characteristics?.map((c2,i)=><span key={i} style={{fontSize:12,background:"rgba(255,255,255,0.05)",padding:"4px 12px",borderRadius:20,color:"rgba(255,255,255,0.6)"}}>{c2}</span>)}</div><Label>Avoid</Label><div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12}}>{visual.logoDirection.avoid?.map((c2,i)=><span key={i} style={{fontSize:12,background:"rgba(255,180,180,0.08)",padding:"4px 12px",borderRadius:20,color:"rgba(255,180,180,0.6)"}}>{c2}</span>)}</div><p style={{fontSize:13,color:"rgba(255,255,255,0.5)",margin:0}}>{visual.logoDirection.moodDescription}</p></Card></Section>}
            {visual?.imageryStyle&&<Section title="Imagery & Iconography"><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}><Card><Label>Photography</Label><p style={{fontSize:12,color:"rgba(255,255,255,0.6)",margin:0}}>{visual.imageryStyle.photographyDirection}</p></Card><Card><Label>Illustration</Label><p style={{fontSize:12,color:"rgba(255,255,255,0.6)",margin:0}}>{visual.imageryStyle.illustrationDirection}</p></Card><Card><Label>Iconography</Label><p style={{fontSize:12,color:"rgba(255,255,255,0.6)",margin:0}}>{visual.imageryStyle.iconographyStyle}</p></Card><Card><Label>Patterns</Label><p style={{fontSize:12,color:"rgba(255,255,255,0.6)",margin:0}}>{visual.imageryStyle.patterns}</p></Card></div></Section>}
            {visual?.layoutPrinciples&&<Section title="Layout Principles"><Card><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}><div><Label>Grid</Label><p style={{fontSize:12,color:"rgba(255,255,255,0.6)",margin:0}}>{visual.layoutPrinciples.gridStyle}</p></div><div><Label>Whitespace</Label><p style={{fontSize:12,color:"rgba(255,255,255,0.6)",margin:0}}>{visual.layoutPrinciples.whitespace}</p></div><div><Label>Density</Label><p style={{fontSize:12,color:"rgba(255,255,255,0.6)",margin:0}}>{visual.layoutPrinciples.informationDensity}</p></div><div><Label>Mood</Label><p style={{fontSize:12,color:"rgba(255,255,255,0.6)",margin:0}}>{visual.layoutPrinciples.overallMood}</p></div></div></Card></Section>}
          </>}

        </div>
      </div>
    </div>
  );
}

// ─── Processing View ─────────────────────────────────────────

function ProcessingView({ currentStage, stageLabel, error, onViewResults, done }) {
  const stageIdx = STAGE_META.findIndex(s=>s.id===currentStage);
  const pct = done?100:Math.round(((stageIdx>=0?stageIdx:0)/STAGE_META.length)*100);
  return (
    <div style={S.centered}>
      <div style={{maxWidth:540,width:"100%"}}>
        <h1 style={{fontSize:30,fontWeight:700,letterSpacing:"-0.02em",marginBottom:8,marginTop:0}}>{error?"Something went wrong.":done?"Your brand is forged.":"Forging your brand..."}</h1>
        <p style={{fontSize:14,color:"rgba(255,255,255,0.4)",marginTop:0}}>{error||(done?"All modules complete.":stageLabel)}</p>
        <div style={{display:"flex",alignItems:"center",gap:14,margin:"28px 0"}}><div style={{flex:1,height:4,background:"rgba(255,255,255,0.08)",borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",background:"linear-gradient(90deg,#D4A853,#E8C97A)",borderRadius:2,transition:"width 0.6s",width:`${pct}%`}}/></div><span style={{fontSize:13,fontWeight:600,color:"#D4A853",width:36,fontVariantNumeric:"tabular-nums"}}>{pct}%</span></div>
        <div style={{display:"flex",flexDirection:"column",gap:4}}>{STAGE_META.map((s,i)=>{const complete=done||i<stageIdx;const current=!done&&s.id===currentStage;return <div key={s.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",borderRadius:8,fontSize:13,fontWeight:500,color:complete?"rgba(140,200,140,0.7)":current?"#D4A853":"rgba(255,255,255,0.25)",background:current?"rgba(212,168,83,0.06)":"transparent",transition:"all 0.3s"}}><span style={{width:20,textAlign:"center"}}>{complete?"✓":current?s.icon:"○"}</span><span style={{flex:1}}>{s.label}</span></div>;})}</div>
        {done&&<button onClick={onViewResults} style={S.goldBtn}>View Brand Guidelines →</button>}
        {error&&<button onClick={()=>window.location.reload()} style={{...S.goldBtn,marginTop:24}}>Try Again</button>}
      </div>
    </div>
  );
}

// ─── Tone Meter Component ────────────────────────────────────

const TONE_LABELS = ["Quirky", "Playful", "Conversational", "Balanced", "Professional", "Polished", "Formal"];
const TONE_DESCRIPTORS = {
  0: "Weird, unexpected, rule-breaking. Brands like Oatly or Liquid Death.",
  1: "Fun, lighthearted, personality-forward. Brands like Mailchimp or Slack.",
  2: "Warm and approachable but still sharp. Brands like Notion or Figma.",
  3: "Flexible center. Adapts to context without strong bias either way.",
  4: "Clear, credible, competent. Brands like Stripe or Linear.",
  5: "Refined, authoritative, premium. Brands like Apple or Aesop.",
  6: "Buttoned-up, institutional, legacy-ready. Brands like McKinsey or Goldman.",
};

function ToneMeter({ value, onChange }) {
  return (
    <div style={{margin:"28px 0 8px",padding:24,background:"rgba(255,255,255,0.025)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:12}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",color:"#D4A853",marginBottom:4}}>Tone Calibration</div>
          <div style={{fontSize:12,color:"rgba(255,255,255,0.35)"}}>Set the overall voice temperature for your brand.</div>
        </div>
        <div style={{fontSize:13,fontWeight:700,color:"#E8E6E3",background:"rgba(212,168,83,0.1)",padding:"4px 12px",borderRadius:6,border:"1px solid rgba(212,168,83,0.2)"}}>{TONE_LABELS[value]}</div>
      </div>
      <div style={{position:"relative",height:40,display:"flex",alignItems:"center"}}>
        <input type="range" min={0} max={6} value={value} onChange={e=>onChange(Number(e.target.value))} style={{position:"absolute",width:"100%",height:40,opacity:0,cursor:"pointer",zIndex:2,margin:0}}/>
        {/* Track */}
        <div style={{position:"absolute",width:"100%",height:4,background:"rgba(255,255,255,0.06)",borderRadius:2}}>
          <div style={{height:"100%",background:"linear-gradient(90deg, #E8C97A, #D4A853, #8B7340)",borderRadius:2,transition:"width 0.15s",width:`${(value/6)*100}%`}}/>
        </div>
        {/* Dots */}
        <div style={{position:"absolute",width:"100%",display:"flex",justifyContent:"space-between",pointerEvents:"none"}}>
          {TONE_LABELS.map((_, i) => (
            <div key={i} style={{width:14,height:14,borderRadius:"50%",background:i<=value?"#D4A853":"rgba(255,255,255,0.08)",border:`2px solid ${i<=value?"#D4A853":"rgba(255,255,255,0.12)"}`,transition:"all 0.15s",...(i===value?{boxShadow:"0 0 10px rgba(212,168,83,0.4)",transform:"scale(1.2)"}:{})}}/>
          ))}
        </div>
      </div>
      {/* Labels at ends */}
      <div style={{display:"flex",justifyContent:"space-between",marginTop:10}}>
        <span style={{fontSize:10,fontWeight:600,color:"rgba(255,255,255,0.3)"}}>← Quirky</span>
        <span style={{fontSize:10,fontWeight:600,color:"rgba(255,255,255,0.3)"}}>Formal →</span>
      </div>
      {/* Descriptor */}
      <div style={{fontSize:12,color:"rgba(255,255,255,0.45)",marginTop:12,fontStyle:"italic",textAlign:"center",minHeight:18,transition:"opacity 0.2s"}}>{TONE_DESCRIPTORS[value]}</div>
    </div>
  );
}

// ─── Quick Input ─────────────────────────────────────────────

function QuickInput({ onSubmit, onBack }) {
  const [type,setType]=useState("url");const [url,setUrl]=useState("");const [desc,setDesc]=useState("");
  const [tone,setTone]=useState(3);
  const can=type==="url"?url.trim().length>0:desc.trim().length>0;
  const submit=()=>can&&onSubmit(type==="url"?url:desc, tone);
  return (
    <div style={S.centered}><div style={{maxWidth:600,width:"100%"}}>
      <button onClick={onBack} style={S.backLink}>← Back</button>
      <h1 style={{fontSize:36,fontWeight:700,letterSpacing:"-0.03em",marginBottom:10,marginTop:0}}>Quick Forge</h1>
      <p style={{fontSize:15,lineHeight:1.6,color:"rgba(255,255,255,0.4)",marginBottom:36,marginTop:0}}>Drop a URL or describe your brand. The engine handles everything.</p>
      <div style={{display:"flex",gap:8,marginBottom:24}}><button onClick={()=>setType("url")} style={{...S.toggleBtn,...(type==="url"?S.toggleOn:{})}}>🌐 Website URL</button><button onClick={()=>setType("description")} style={{...S.toggleBtn,...(type==="description"?S.toggleOn:{})}}>✏️ Description</button></div>
      {type==="url"?<><input type="text" value={url} onChange={e=>setUrl(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder="https://yourcompany.com" style={S.urlIn} autoFocus/><p style={S.hint}>We'll scan and generate everything automatically.</p></>
      :<><textarea value={desc} onChange={e=>setDesc(e.target.value)} placeholder={"What does your brand do, who's it for, what's different?\n\ne.g. AI platform that automates enterprise finance for mid-market CFOs."} style={S.descIn} rows={7} autoFocus/><p style={S.hint}>More detail = sharper output.</p></>}
      <ToneMeter value={tone} onChange={setTone}/>
      <button onClick={submit} disabled={!can} style={{...S.goldBtn,...(!can?{opacity:0.3,cursor:"not-allowed",boxShadow:"none"}:{}),marginTop:8}}>⚡ Forge Brand Identity</button>
    </div></div>
  );
}

// ─── Deep Mode Interview ─────────────────────────────────────

function DeepMode({ onComplete, onBack }) {
  const [step,setStep]=useState(0);const [d,setD]=useState({pFC:3,pSP:3,pTA:3,pED:3,pRB:3,pME:3,personalityTraits:[],antiTraits:[],visualPreferences:[]});
  const [vis,setVis]=useState(true);const [summ,setSumm]=useState(false);const ref=useRef(null);
  const [tone,setTone]=useState(3);
  const s=summ?{id:"sum",type:"summary"}:INTERVIEW_STEPS[step];const total=INTERVIEW_STEPS.length;
  const ok=()=>{if(!s||s.type==="summary")return true;if(s.opt||s.type==="sliders")return true;if(s.type==="multi")return(d[s.f]||[]).length>=(s.min||1);if(s.type==="select")return!!d[s.f];return d[s.f]&&String(d[s.f]).trim().length>0;};
  const go=cb=>{setVis(false);setTimeout(()=>{cb();setVis(true);if(ref.current)ref.current.scrollTop=0;},250);};
  const next=()=>{if(!ok())return;if(step>=total-1&&!summ)go(()=>setSumm(true));else if(!summ)go(()=>setStep(p=>p+1));};
  const back=()=>{if(summ)go(()=>{setSumm(false);setStep(total-1);});else if(step>0)go(()=>setStep(p=>p-1));else onBack();};
  const set=(f,v)=>setD(p=>({...p,[f]:v}));
  const tog=(f,v,mx)=>setD(p=>{const c=p[f]||[];if(c.includes(v))return{...p,[f]:c.filter(x=>x!==v)};if(c.length>=mx)return p;return{...p,[f]:[...c,v]};});
  const handleProceed=()=>onComplete({companyName:d.companyName,companyDescription:d.companyDescription,industry:d.industry,foundingStory:d.foundingStory,stage:d.stage,audiencePrimary:d.audiencePrimary,audienceSecondary:d.audienceSecondary,audienceLanguage:d.audienceLanguage,personalitySliders:{formalCasual:d.pFC,seriousPlayful:d.pSP,technicalAccessible:d.pTA,establishedDisruptive:d.pED,reservedBold:d.pRB,minimalExpressive:d.pME},personalityTraits:d.personalityTraits,antiTraits:d.antiTraits,competitors:d.competitors,differentiation:d.differentiation,categoryConventions:d.categoryConventions,aspirationalBrands:d.aspirationalBrands,ambition:d.ambition,nonNegotiables:d.nonNegotiables,visualPreferences:d.visualPreferences,tonePreference:tone});
  const ds=summ?{id:"sum",type:"summary",title:"Here's what I've captured.",sub:"Review, then proceed."}:INTERVIEW_STEPS[step];
  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"18px 48px",borderBottom:"1px solid rgba(255,255,255,0.06)",background:"rgba(15,15,16,0.6)"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}><span style={S.completeTag}>Module 1C</span><span style={{fontSize:14,fontWeight:600,color:"rgba(255,255,255,0.8)"}}>Strategy Interview</span></div>
        <div style={{display:"flex",alignItems:"center",gap:12}}><div style={{width:140,height:3,background:"rgba(255,255,255,0.08)",borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",background:"linear-gradient(90deg,#D4A853,#E8C97A)",transition:"width 0.5s",width:`${Math.round(INTERVIEW_STEPS.filter(q=>q.f&&d[q.f]&&(Array.isArray(d[q.f])?d[q.f].length>0:String(d[q.f]).trim()!=="")).length/total*100)}%`}}/></div></div>
      </div>
      <div ref={ref} style={{flex:1,overflowY:"auto",padding:"60px 48px",display:"flex",justifyContent:"center"}}>
        <div style={{maxWidth:640,width:"100%",opacity:vis?1:0,transform:vis?"translateY(0)":"translateY(12px)",transition:"opacity 0.25s, transform 0.25s"}}>
          {ds.type==="summary"?<>
            <h1 style={S.qTitle}>Here's what I've captured.</h1><p style={S.qSub}>Review your answers, set the tone, then proceed to strategy.</p>
            <div style={{display:"flex",flexDirection:"column",gap:16}}>{INTERVIEW_STEPS.filter(q=>q.f&&d[q.f]&&(Array.isArray(d[q.f])?d[q.f].length>0:String(d[q.f]).trim()!=="")).map(q=>{let val=d[q.f];if(Array.isArray(val))val=val.join(", ");return <div key={q.id} style={{padding:"14px 0",borderBottom:"1px solid rgba(255,255,255,0.06)"}}><div style={{fontSize:11,fontWeight:600,color:"rgba(255,255,255,0.3)",marginBottom:4}}>{q.q}</div><div style={{fontSize:13,color:"rgba(255,255,255,0.7)",whiteSpace:"pre-wrap"}}>{q.type==="sliders"?q.sliders.map(sl=>`${sl.l}: ${d[sl.f]}/5 > ${sl.r}`).join(" | "):val}</div></div>;})}</div>
            <ToneMeter value={tone} onChange={setTone}/>
          </>:<>
            {ds.sec&&<div style={{marginBottom:20}}><span style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,0.25)"}}>{ds.si}/6 </span><span style={{fontSize:11,fontWeight:600,letterSpacing:"0.08em",textTransform:"uppercase",color:"#D4A853"}}>{ds.sec}</span></div>}
            <h1 style={S.qTitle}>{ds.q}</h1>{ds.sub&&<p style={S.qSub}>{ds.sub}</p>}
            {ds.type==="text"&&<input type="text" value={d[ds.f]||""} onChange={e=>set(ds.f,e.target.value)} onKeyDown={e=>e.key==="Enter"&&next()} placeholder={ds.ph} style={S.txtIn} autoFocus/>}
            {ds.type==="textarea"&&<textarea value={d[ds.f]||""} onChange={e=>set(ds.f,e.target.value)} placeholder={ds.ph} style={S.txtArea} rows={5} autoFocus/>}
            {ds.type==="select"&&<div style={{display:"flex",flexDirection:"column",gap:8}}>{ds.opts.map(o=><button key={o.v} onClick={()=>set(ds.f,o.v)} style={{...S.selOpt,...(d[ds.f]===o.v?S.selOptOn:{})}}>{o.l}</button>)}</div>}
            {ds.type==="sliders"&&<div style={{display:"flex",flexDirection:"column",gap:28}}>{ds.sliders.map(sl=><div key={sl.id} style={{display:"flex",alignItems:"center",gap:16}}><span style={{fontSize:12,fontWeight:600,color:"rgba(255,255,255,0.5)",width:90,textAlign:"center",flexShrink:0}}>{sl.l}</span><div style={{flex:1,position:"relative",height:32,display:"flex",alignItems:"center"}}><input type="range" min={1} max={5} value={d[sl.f]||3} onChange={e=>set(sl.f,Number(e.target.value))} style={{position:"absolute",width:"100%",height:32,opacity:0,cursor:"pointer",zIndex:2,margin:0}}/><div style={{position:"absolute",width:"100%",height:3,background:"rgba(255,255,255,0.08)",borderRadius:2}}><div style={{height:"100%",background:"linear-gradient(90deg,#D4A853,#E8C97A)",borderRadius:2,transition:"width 0.15s",width:`${(((d[sl.f]||3)-1)/4)*100}%`}}/></div><div style={{position:"absolute",width:"100%",display:"flex",justifyContent:"space-between",padding:"0 2px",boxSizing:"border-box",pointerEvents:"none"}}>{[1,2,3,4,5].map(n=><div key={n} style={{width:10,height:10,borderRadius:"50%",background:n<=(d[sl.f]||3)?"#D4A853":"rgba(255,255,255,0.1)",border:`2px solid ${n<=(d[sl.f]||3)?"#D4A853":"rgba(255,255,255,0.15)"}`,transition:"all 0.15s",...(n<=(d[sl.f]||3)?{boxShadow:"0 0 8px rgba(212,168,83,0.3)"}:{})}}/>)}</div></div><span style={{fontSize:12,fontWeight:600,color:"rgba(255,255,255,0.5)",width:90,textAlign:"center",flexShrink:0}}>{sl.r}</span></div>)}</div>}
            {ds.type==="multi"&&<><div style={{display:"flex",flexWrap:"wrap",gap:8}}>{ds.opts.map(o=>{const on=(d[ds.f]||[]).includes(o);const off=!on&&(d[ds.f]||[]).length>=ds.max;return <button key={o} onClick={()=>!off&&tog(ds.f,o,ds.max)} style={{padding:"10px 18px",fontSize:13,fontWeight:on?600:500,fontFamily:"'DM Sans',sans-serif",background:on?"rgba(212,168,83,0.12)":"rgba(255,255,255,0.04)",border:`1px solid ${on?"#D4A853":"rgba(255,255,255,0.1)"}`,borderRadius:100,color:on?"#D4A853":"rgba(255,255,255,0.6)",cursor:off?"not-allowed":"pointer",opacity:off?0.3:1,display:"flex",alignItems:"center",gap:6,transition:"all 0.15s"}}>{on&&<span style={{fontSize:11,fontWeight:700}}>✓</span>}{o}</button>})}</div><p style={{fontSize:12,color:"rgba(255,255,255,0.3)",marginTop:12}}>{(d[ds.f]||[]).length} of {ds.min}-{ds.max}</p></>}
            {ds.opt&&<p style={{fontSize:12,color:"rgba(255,255,255,0.25)",marginTop:12,fontStyle:"italic"}}>Optional</p>}
          </>}
        </div>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"18px 48px",borderTop:"1px solid rgba(255,255,255,0.06)",background:"rgba(15,15,16,0.6)"}}>
        <button onClick={back} style={{...S.nav,...S.navBack}}>← Back</button>
        <span style={{fontSize:12,color:"rgba(255,255,255,0.2)",fontVariantNumeric:"tabular-nums"}}>{summ?total+1:step+1} / {total+1}</span>
        {summ?<button onClick={handleProceed} style={{...S.nav,...S.navGold}}>Proceed to Strategy →</button>:<button onClick={next} disabled={!ok()} style={{...S.nav,...S.navNext,...(!ok()?{opacity:0.3,cursor:"not-allowed"}:{})}}>{ds.opt?"Skip →":"Continue →"}</button>}
      </div>
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────

export default function BlancForge() {
  const [mode,setMode]=useState(null);const [phase,setPhase]=useState("input");
  const [currentStage,setCurrentStage]=useState(null);const [stageLabel,setStageLabel]=useState("");
  const [results,setResults]=useState(null);const [error,setError]=useState(null);const [completedMods,setCompletedMods]=useState([]);

  const startPipeline = useCallback((input,isQuick,toneValue) => {
    setPhase("processing");setError(null);setCompletedMods([]);
    runPipeline(input,isQuick,toneValue ?? 3,(stageId,label)=>{setCurrentStage(stageId);setStageLabel(label);setCompletedMods(MODULE_ORDER.slice(0,MODULE_ORDER.indexOf(stageId)));},
      (result)=>{if(result.error){setError(result.error);}else{setResults(result);setPhase("results");setCompletedMods(MODULE_ORDER);}});
  },[]);

  const activeModule = phase==="processing"?currentStage:phase==="results"?"guidelines":"interview";
  if(!mode) return <div style={S.shell}><ModeSelection onSelect={setMode}/></div>;
  return (
    <div style={S.app}>
      <Sidebar activeModule={activeModule} completedModules={completedMods}/>
      {phase==="input"&&mode==="quick"&&<QuickInput onSubmit={(i,tone)=>startPipeline(i,true,tone)} onBack={()=>setMode(null)}/>}
      {phase==="input"&&mode==="deep"&&<DeepMode onComplete={d=>startPipeline(d,false,d.tonePreference)} onBack={()=>setMode(null)}/>}
      {phase==="processing"&&<div style={{flex:1,display:"flex"}}><ProcessingView currentStage={currentStage} stageLabel={stageLabel} done={false} error={error} onViewResults={()=>setPhase("results")}/></div>}
      {phase==="results"&&results&&<ResultsView data={results} setData={setResults} onBack={()=>{setMode(null);setPhase("input");setResults(null);setCompletedMods([]);}}/>}
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────

const S = {
  shell:{height:"100vh",width:"100vw",background:"#0A0A0B",color:"#E8E6E3",fontFamily:"'DM Sans','Helvetica Neue',sans-serif",overflow:"hidden"},
  app:{display:"flex",height:"100vh",width:"100vw",fontFamily:"'DM Sans','Helvetica Neue',sans-serif",background:"#0A0A0B",color:"#E8E6E3",overflow:"hidden"},
  centered:{flex:1,display:"flex",alignItems:"center",justifyContent:"center",padding:48,overflowY:"auto"},
  sidebar:{width:272,minWidth:272,background:"#0F0F10",borderRight:"1px solid rgba(255,255,255,0.06)",display:"flex",flexDirection:"column",padding:"28px 0"},
  logoArea:{padding:"0 24px 28px",borderBottom:"1px solid rgba(255,255,255,0.06)",display:"flex",alignItems:"center",gap:10},
  logoMark:{fontSize:18,color:"#D4A853"},logoText:{fontSize:15,fontWeight:700,letterSpacing:"0.1em",color:"#E8E6E3",textTransform:"uppercase"},
  phasesNav:{flex:1,padding:"20px 16px",overflowY:"auto"},phaseGroup:{marginBottom:24},
  phaseLabel:{fontSize:10,fontWeight:600,letterSpacing:"0.1em",textTransform:"uppercase",color:"rgba(255,255,255,0.35)",padding:"0 8px 8px"},
  modItem:{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderRadius:8,fontSize:13,fontWeight:500,cursor:"default",position:"relative",marginBottom:2,color:"rgba(255,255,255,0.7)"},
  modActive:{background:"rgba(212,168,83,0.1)",color:"#D4A853",fontWeight:600},modDone:{color:"rgba(140,200,140,0.8)"},modLocked:{color:"rgba(255,255,255,0.25)"},
  modIcon:{fontSize:14,width:20,textAlign:"center"},activeDot:{position:"absolute",right:12,width:6,height:6,borderRadius:"50%",background:"#D4A853"},
  lockBadge:{position:"absolute",right:12,fontSize:10,opacity:0.4},sidebarFoot:{padding:"16px 24px",borderTop:"1px solid rgba(255,255,255,0.06)"},footTxt:{fontSize:11,color:"rgba(255,255,255,0.2)"},
  card:{display:"flex",alignItems:"center",gap:20,padding:28,background:"rgba(255,255,255,0.025)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:14,cursor:"pointer",transition:"all 0.2s",textAlign:"left",fontFamily:"'DM Sans',sans-serif",color:"#E8E6E3"},
  cardHover:{background:"rgba(212,168,83,0.05)",borderColor:"rgba(212,168,83,0.3)",transform:"translateY(-2px)",boxShadow:"0 8px 32px rgba(0,0,0,0.3)"},
  cardIcon:{fontSize:32,flexShrink:0,width:56,height:56,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(255,255,255,0.04)",borderRadius:12},
  cardTitle:{fontSize:18,fontWeight:700,marginBottom:6,marginTop:0},cardDesc:{fontSize:13,lineHeight:1.55,color:"rgba(255,255,255,0.45)",marginBottom:12,marginTop:0},
  cardTags:{display:"flex",gap:8,flexWrap:"wrap"},tag:{fontSize:10,fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase",color:"rgba(255,255,255,0.3)",background:"rgba(255,255,255,0.05)",padding:"3px 8px",borderRadius:4},
  backLink:{background:"none",border:"none",color:"rgba(255,255,255,0.35)",fontSize:13,fontFamily:"'DM Sans',sans-serif",cursor:"pointer",marginBottom:32,padding:0},
  toggleBtn:{padding:"10px 18px",fontSize:13,fontWeight:600,fontFamily:"'DM Sans',sans-serif",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:8,color:"rgba(255,255,255,0.5)",cursor:"pointer",transition:"all 0.15s"},
  toggleOn:{background:"rgba(212,168,83,0.1)",borderColor:"#D4A853",color:"#D4A853"},
  urlIn:{width:"100%",padding:"18px 20px",fontSize:16,fontWeight:500,fontFamily:"'DM Mono','Menlo',monospace",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,color:"#E8E6E3",outline:"none",boxSizing:"border-box"},
  descIn:{width:"100%",padding:18,fontSize:14,lineHeight:1.65,fontFamily:"'DM Sans',sans-serif",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,color:"#E8E6E3",outline:"none",resize:"vertical",boxSizing:"border-box",minHeight:180},
  hint:{fontSize:12,color:"rgba(255,255,255,0.25)",marginTop:10,lineHeight:1.5},
  goldBtn:{width:"100%",padding:"14px 24px",fontSize:14,fontWeight:700,fontFamily:"'DM Sans',sans-serif",background:"linear-gradient(135deg,#D4A853,#E8C97A)",border:"none",borderRadius:10,color:"#0A0A0B",cursor:"pointer",boxShadow:"0 4px 20px rgba(212,168,83,0.25)",marginTop:24},
  qTitle:{fontSize:26,fontWeight:700,letterSpacing:"-0.02em",lineHeight:1.25,color:"#E8E6E3",marginBottom:8,marginTop:0},
  qSub:{fontSize:14,lineHeight:1.6,color:"rgba(255,255,255,0.4)",marginBottom:28,marginTop:0},
  txtIn:{width:"100%",padding:"16px 0",fontSize:18,fontWeight:500,fontFamily:"'DM Sans',sans-serif",background:"transparent",border:"none",borderBottom:"2px solid rgba(255,255,255,0.12)",color:"#E8E6E3",outline:"none",boxSizing:"border-box"},
  txtArea:{width:"100%",padding:18,fontSize:15,lineHeight:1.65,fontFamily:"'DM Sans',sans-serif",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,color:"#E8E6E3",outline:"none",resize:"vertical",boxSizing:"border-box",minHeight:140},
  selOpt:{padding:"14px 18px",fontSize:14,fontWeight:500,fontFamily:"'DM Sans',sans-serif",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,color:"rgba(255,255,255,0.7)",cursor:"pointer",textAlign:"left",transition:"all 0.15s"},
  selOptOn:{background:"rgba(212,168,83,0.1)",borderColor:"#D4A853",color:"#D4A853",fontWeight:600},
  nav:{padding:"10px 24px",fontSize:13,fontWeight:600,fontFamily:"'DM Sans',sans-serif",borderRadius:8,cursor:"pointer",border:"none",transition:"all 0.15s"},
  navBack:{background:"transparent",color:"rgba(255,255,255,0.5)",border:"1px solid rgba(255,255,255,0.1)"},
  navNext:{background:"#D4A853",color:"#0A0A0B"},
  navGold:{background:"linear-gradient(135deg,#D4A853,#E8C97A)",color:"#0A0A0B",padding:"10px 28px",boxShadow:"0 4px 16px rgba(212,168,83,0.25)"},
  // Results-specific
  completeTag:{fontSize:10,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",color:"#D4A853",background:"rgba(212,168,83,0.12)",padding:"4px 10px",borderRadius:4},
  tab:{padding:"12px 20px",fontSize:12,fontWeight:600,fontFamily:"'DM Sans',sans-serif",background:"none",border:"none",borderBottom:"2px solid transparent",color:"rgba(255,255,255,0.4)",cursor:"pointer",transition:"all 0.15s"},
  tabActive:{borderBottom:"2px solid #D4A853",color:"#D4A853"},
  smallBtn:{background:"transparent",border:"1px solid rgba(255,255,255,0.1)",color:"rgba(255,255,255,0.5)",padding:"6px 16px",borderRadius:6,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"},
  exportBtn:{background:"rgba(212,168,83,0.1)",border:"1px solid rgba(212,168,83,0.3)",color:"#D4A853",padding:"6px 16px",borderRadius:6,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",transition:"all 0.15s"},
  recTag:{fontSize:9,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",color:"#D4A853",background:"rgba(212,168,83,0.15)",padding:"3px 8px",borderRadius:4},
  typeTag:{fontSize:10,fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase",color:"rgba(255,255,255,0.3)",background:"rgba(255,255,255,0.05)",padding:"3px 8px",borderRadius:4},
  // Regen controls
  regenBar:{padding:"16px 0",marginBottom:20,borderBottom:"1px solid rgba(255,255,255,0.06)"},
  regenBtn:{padding:"8px 16px",fontSize:12,fontWeight:600,fontFamily:"'DM Sans',sans-serif",borderRadius:6,cursor:"pointer",border:"none",transition:"all 0.15s",background:"transparent",color:"rgba(255,255,255,0.5)"},
  regenBtnOutline:{border:"1px solid rgba(255,255,255,0.12)",color:"rgba(255,255,255,0.6)"},
  regenBtnGold:{background:"rgba(212,168,83,0.12)",color:"#D4A853",border:"1px solid rgba(212,168,83,0.3)"},
  regenInstructionsBox:{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:10,padding:16},
  regenTextarea:{width:"100%",padding:12,fontSize:13,lineHeight:1.5,fontFamily:"'DM Sans',sans-serif",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:8,color:"#E8E6E3",outline:"none",resize:"none",boxSizing:"border-box"},
  regenSpinner:{display:"inline-block",marginRight:8,fontSize:14},
};
