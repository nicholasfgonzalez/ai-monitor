(() => {
  // AI METER - v10.0.0
  // Complete rewrite: Prompt tracking + 3-metric display + cycling comparisons

  if (window.top !== window.self) return;

  const ENG = "__AI_METER_ENG__";
  try { if (window[ENG]?.intervalId) clearInterval(window[ENG].intervalId); } catch (_) {}
  if (!window[ENG]) window[ENG] = {};

  const STORAGE_KEY = "ai-meter-state";
  const DAILY_PREFIX = "ai-meter-daily";
  const CO2_PER_KWH = 420; // g CO2/kWh (US grid 2024)
  const LOOP_MS = 1000;

  const ICON = {
    caret: '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 4L6 8L10 4" stroke="white"/></svg>',
    bolt: '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5.39778 11H4.79776L5.39778 7.11111H3.29773C2.94972 7.11111 2.95572 6.93333 3.06973 6.74444C3.18373 6.55556 3.09973 6.7 3.11173 6.67778C3.88574 5.41111 5.04977 3.52222 6.59781 1H7.19782L6.59781 4.88889H8.69785C8.99186 4.88889 9.03386 5.07222 8.97986 5.17222L8.93786 5.25556C6.5738 9.08333 5.39778 11 5.39778 11Z" fill="white"/></svg>',
    shuffle: '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9.5 6.5V9.5H3.5V11L1.5 9L3.5 7V8.5H8.5V6.5H9.5ZM10.5 3L8.5 5V3.5H3.5V5.5H2.5V2.5H8.5V1L10.5 3Z" fill="white"/></svg>'
  };

  // Platform registry with energy estimates per response
  const PLATFORMS = [
    { domain:"chat.openai.com",       name:"ChatGPT",     vendor:"OpenAI",     type:"chat", whPerResponse:2.8 },
    { domain:"chatgpt.com",           name:"ChatGPT",     vendor:"OpenAI",     type:"chat", whPerResponse:2.8 },
    { domain:"claude.ai",             name:"Claude",      vendor:"Anthropic",  type:"chat", whPerResponse:2.4 },
    { domain:"gemini.google.com",     name:"Gemini",      vendor:"Google",     type:"chat", whPerResponse:2.1 },
    { domain:"copilot.microsoft.com", name:"Copilot",     vendor:"Microsoft",  type:"chat", whPerResponse:2.6 },
    { domain:"perplexity.ai",         name:"Perplexity",                       type:"chat", whPerResponse:3.2 },
    { domain:"poe.com",               name:"Poe",         vendor:"Quora",      type:"chat", whPerResponse:2.5 },
    { domain:"character.ai",          name:"Character.AI",                     type:"chat", whPerResponse:1.8 },
    { domain:"meta.ai",               name:"Meta AI",     vendor:"Meta",       type:"chat", whPerResponse:2.0 },
    { domain:"you.com",               name:"You.com",                          type:"chat", whPerResponse:2.8 },
    { domain:"midjourney.com",        name:"Midjourney",                       type:"image", whPerGen:5.2 },
    { domain:"ideogram.ai",           name:"Ideogram",                         type:"image", whPerGen:3.8 },
    { domain:"labs.openai.com",       name:"DALL·E",      vendor:"OpenAI",     type:"image", whPerGen:5.8 },
    { domain:"runwayml.com",          name:"Runway",                           type:"video", whPerGen:45 },
    { domain:"pika.art",              name:"Pika",                             type:"video", whPerGen:38 },
  ];

  // Comparison taxonomy (cycles through these)
  const COMPARISONS = [
    // Devices (time / usage)
    { cat:"devices", wh: 0.25,  unit: "minute charging your phone",        plural: "minutes charging your phone",        minWh: 0.1,  maxWh: 40,    allowOne: false },
    { cat:"devices", wh: 0.12,  unit: "minute of LED bulb use",            plural: "minutes of LED bulb use",            minWh: 0.1,  maxWh: 60,    allowOne: false },
    { cat:"devices", wh: 1.0,   unit: "minute of laptop use",              plural: "minutes of laptop use",              minWh: 5,    maxWh: 180,   allowOne: false },
    { cat:"devices", wh: 3.0,   unit: "minute of TV use",                  plural: "minutes of TV use",                  minWh: 20,   maxWh: 300,   allowOne: false },
    { cat:"kitchen", wh: 5.0,   unit: "minute of microwave use",           plural: "minutes of microwave use",           minWh: 20,   maxWh: 250,   allowOne: false },

    // Charging
    { cat:"devices", wh: 12.0,  unit: "phone charge",                      plural: "phone charges",                       minWh: 20,   maxWh: 250,   allowOne: false },
    { cat:"devices", wh: 35.0,  unit: "tablet charge",                     plural: "tablet charges",                      minWh: 50,   maxWh: 600,   allowOne: false },
    { cat:"devices", wh: 65.0,  unit: "laptop charge",                     plural: "laptop charges",                      minWh: 80,   maxWh: 1200,  allowOne: false },

    // Coffee (realistic): drip brew roughly ~60–120 Wh per cup-equivalent. Use 80 Wh.
    { cat:"kitchen", wh: 80.0,  unit: "cup of coffee brewed",              plural: "cups of coffee brewed",               minWh: 120,  maxWh: 1200,  allowOne: false },

    // Home
    { cat:"home",    wh: 100.0, unit: "load of laundry",                   plural: "loads of laundry",                    minWh: 120,  maxWh: 1500,  allowOne: true  },
    { cat:"devices", wh: 150.0, unit: "hour of TV use",                    plural: "hours of TV use",                     minWh: 200,  maxWh: 3000,  allowOne: true  },
    { cat:"home",    wh: 800.0, unit: "hour of fridge use",                plural: "hours of fridge use",                 minWh: 600,  maxWh: 8000,  allowOne: true  },
    { cat:"home",    wh: 1200.0,unit: "hour of dishwasher use",            plural: "hours of dishwasher use",             minWh: 900,  maxWh: 9000,  allowOne: true  },

    // Transport (Wh-based)
    { cat:"transport", wh: 300.0, unit: "mile driven (EV)",                plural: "miles driven (EV)",                   minWh: 250,  maxWh: 10000, allowOne: false },

    // High energy
    { cat:"heating", wh: 1500.0, unit: "hour of space heater use",         plural: "hours of space heater use",           minWh: 1200, maxWh: 20000, allowOne: true  },
    { cat:"heating", wh: 2500.0, unit: "hour of air conditioning",         plural: "hours of air conditioning",           minWh: 2000, maxWh: 30000, allowOne: true  },
    { cat:"heating", wh: 4000.0, unit: "hour of hot tub heating",          plural: "hours of hot tub heating",            minWh: 3000, maxWh: 50000, allowOne: true  },

    // Additional fun + realistic comparisons (gated + non-absurd)
    { cat:"devices", wh: 0.8,    unit: "minute of phone screen time",      plural: "minutes of phone screen time",        minWh: 5,    maxWh: 120,   allowOne: false },
    { cat:"devices", wh: 1.6,    unit: "minute of gaming console use",     plural: "minutes of gaming console use",       minWh: 30,   maxWh: 600,   allowOne: false },
    { cat:"devices", wh: 2.0,    unit: "minute of Wi‑Fi router use",       plural: "minutes of Wi‑Fi router use",         minWh: 30,   maxWh: 600,   allowOne: false },
    { cat:"devices", wh: 4.0,    unit: "minute of hair dryer use",         plural: "minutes of hair dryer use",           minWh: 40,   maxWh: 800,   allowOne: false },
    { cat:"home",    wh: 2.5,    unit: "minute of vacuuming",              plural: "minutes of vacuuming",                minWh: 50,   maxWh: 1200,  allowOne: false },
    { cat:"home",    wh: 1.5,    unit: "minute of ceiling fan use",        plural: "minutes of ceiling fan use",          minWh: 30,   maxWh: 600,   allowOne: false },
    { cat:"transport", wh: 25.0, unit: "mile on an e‑bike",                plural: "miles on an e‑bike",                  minWh: 60,   maxWh: 1500,  allowOne: false },
    { cat:"transport", wh: 180.0,unit: "mile on an e‑scooter",             plural: "miles on an e‑scooter",               minWh: 200,  maxWh: 6000,  allowOne: false },
    { cat:"kitchen", wh: 90.0,   unit: "kettle boil",                      plural: "kettle boils",                         minWh: 120,  maxWh: 2000,  allowOne: false },
    { cat:"kitchen", wh: 20.0,   unit: "minute of oven preheating",        plural: "minutes of oven preheating",          minWh: 200,  maxWh: 6000,  allowOne: false },
    { cat:"kitchen", wh: 700.0,  unit: "air fryer cycle",                  plural: "air fryer cycles",                     minWh: 600,  maxWh: 7000,  allowOne: true  },
    { cat:"transport", wh: 250.0,unit: "mile driven (small EV)",           plural: "miles driven (small EV)",             minWh: 300,  maxWh: 10000, allowOne: false }
  ];

  let _comparisonIndex = 0;

  // Randomized, category-diverse, non-repeating cycle order (reshuffled each page load)
  let _comparisonOrder = [];
  let _comparisonPtr = 0;

  // CO₂ equivalency (gas car miles). Rough average passenger vehicle ~404 g CO₂ / mile.
  const GAS_CAR_G_PER_MILE = 404;

  const formatMiles = (miles) => {
    if (miles < 10) return (Math.round(miles * 10) / 10).toFixed(1);
    return String(Math.round(miles));
  };

  const getCo2Equivalency = (g) => {
    const gg = Number(g) || 0;
    if (gg <= 0) return "";
    const miles = gg / GAS_CAR_G_PER_MILE;
    if (miles < 0.5) return "";
    return `${formatMiles(miles)} miles in a gas car`;
  };

  const buildDiverseOrder = () => {
    const n = COMPARISONS.length || 0;
    const buckets = {};
    for (let i = 0; i < n; i++) {
      const c = COMPARISONS[i];
      const cat = (c && c.cat) ? c.cat : "other";
      (buckets[cat] ||= []).push(i);
    }

    // Shuffle each bucket
    for (const cat of Object.keys(buckets)) {
      const arr = buckets[cat];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
      }
    }

    const cats = Object.keys(buckets);
    const order = [];
    let lastCat = null;

    while (order.length < n) {
      let candidates = cats.filter(c => buckets[c].length > 0 && c !== lastCat);
      if (!candidates.length) candidates = cats.filter(c => buckets[c].length > 0);

      const total = candidates.reduce((s,c) => s + buckets[c].length, 0);
      let r = Math.random() * total;
      let chosen = candidates[0];
      for (const c of candidates) {
        r -= buckets[c].length;
        if (r <= 0) { chosen = c; break; }
      }

      order.push(buckets[chosen].pop());
      lastCat = chosen;
    }

    return order;
  };

  const reshuffleComparisons = () => {
    const n = COMPARISONS.length || 0;
    _comparisonOrder = buildDiverseOrder();
    _comparisonPtr = 0;
    _comparisonIndex = _comparisonOrder[0] || 0;
  };

  reshuffleComparisons();

  const getEquivalency = (wh, co2g) => {
    if (wh <= 0) return "";

    const MIN_COUNT = 2;   // avoid "1" for most comparisons
    const MAX_COUNT = 30;  // avoid absurd outputs (hundreds of units)

    const n = COMPARISONS.length || 0;
    if (!n) return "";

    if (!_comparisonOrder || _comparisonOrder.length !== n) reshuffleComparisons();

    const startPtr = _comparisonPtr % n;

    for (let step = 0; step < n; step++) {
      const ptr = (startPtr + step) % n;
      const idx = _comparisonOrder[ptr];
      const comp = COMPARISONS[idx];
      if (!comp || !comp.wh) continue;

      if (typeof comp.minWh === "number" && wh < comp.minWh) continue;
      if (typeof comp.maxWh === "number" && wh > comp.maxWh) continue;

      const raw = wh / comp.wh;
      if (!Number.isFinite(raw) || raw < 1) continue;

      const isMinute = typeof comp.unit === "string" && comp.unit.startsWith("minute ");
      const maxAllowed = isMinute ? (MAX_COUNT * 6) : MAX_COUNT;

      const rounded = Math.round(raw);

      if (rounded === 1 && !comp.allowOne) continue;
      if (rounded < MIN_COUNT && !comp.allowOne) continue;
      if (rounded > maxAllowed) continue;

      _comparisonPtr = ptr;
      _comparisonIndex = idx;

      let mainText = "";
      if (isMinute && rounded >= 60) {
        const hours = Math.max(1, Math.round(rounded / 60));
        const phrase = comp.unit.replace(/^minute\s+/, "");
        const hrUnit = hours === 1 ? "hour" : "hours";
        mainText = `${hours} ${hrUnit} ${phrase}`;
      } else {
        const count = Math.max(1, rounded);
        const unit = count === 1 ? comp.unit : comp.plural;
        mainText = `${count} ${unit}`;
      }

      const co2Eq = getCo2Equivalency(co2g);
      return co2Eq ? `${mainText} • ${co2Eq}` : mainText;
    }

    const comp = COMPARISONS[_comparisonIndex] || COMPARISONS[0];
    const count = Math.max(1, Math.round(wh / (comp.wh || 1)));
    const unit = count === 1 ? comp.unit : comp.plural;
    const mainText = `${count} ${unit}`;
    const co2Eq = getCo2Equivalency(co2g);
    return co2Eq ? `${mainText} • ${co2Eq}` : mainText;
  };

  const cycleComparison = () => {
    const n = COMPARISONS.length || 0;
    if (!n) return;
    if (!_comparisonOrder || _comparisonOrder.length !== n) reshuffleComparisons();
    _comparisonPtr = (_comparisonPtr + 1) % n;
    if (_comparisonPtr === 0) reshuffleComparisons(); // fresh run
    _comparisonIndex = _comparisonOrder[_comparisonPtr] || 0;
  };

  // State
  // AI Content Detection Engine
  const AI_PATTERNS = {
    // Common LLM phrases and patterns
    phrases: [
      /as an ai (language model|assistant|model)/i,
      /i (don't|do not) have personal (opinions|beliefs|experiences|feelings)/i,
      /i'm (just|only) an ai/i,
      /my training (data|cutoff|cut-off)/i,
      /i (can't|cannot) (browse|access) the internet/i,
      /it's worth noting that/i,
      /it's important to (note|remember|understand|consider)/i,
      /however, it's crucial to/i,
      /in conclusion,/i,
      /to summarize,/i,
      /in summary,/i,
      /generated by (chatgpt|claude|gpt|ai|artificial intelligence)/i,
      /this (content|text|article|post) (was|is) (written|created|generated|produced) (by|using|with) (ai|chatgpt|gpt|claude|artificial intelligence)/i,
      /(created|assisted|powered) (by|with) ai/i,
      /ai[- ]generated/i,
      /ai[- ]assisted/i,
      /ai[- ]written/i,
      /\[ai generated\]/i,
      /disclaimer.*ai/i,
      /written with (the )?(help|assistance) of ai/i
    ],
    
    // Hedging language (multiple required for confidence)
    hedging: [
      /\b(might|could|possibly|potentially|arguably|seemingly|apparently)\b/gi,
      /\b(generally|typically|often|usually|frequently)\b/gi,
      /\b(somewhat|rather|fairly|relatively|comparatively)\b/gi
    ],
    
    // Unnatural repetition patterns
    repetition: [
      /\b(\w+)\s+\1\b/gi, // word word
      /^(.+?)\.\s+\1\./gm // sentence. sentence.
    ],
    
    // Transition word overuse (AI loves these)
    transitions: [
      /\b(furthermore|moreover|additionally|consequently|therefore|thus|hence|nevertheless|nonetheless)\b/gi
    ],
    
    // Lack of contractions (AI writes formally)
    formalisms: [
      /\b(do not|does not|did not|will not|would not|should not|could not|cannot|is not|are not|was not|were not|have not|has not|had not)\b/gi
    ]
  };

  const state = {
    platformName: "",
    platformType: null,
    whPerResponse: 0,
    whPerGen: 0,
    expanded: false,
    todayWh: 0,
    todayCo2: 0,
    todayPrompts: 0,
    position: "right",
    dot: "green",
    _collapsingCenter: false,
    // AI Detection state
    aiSignalsDetected: false,
    detectionReasons: [],
    // Dynamic scanning state
    _scanTimeout: null,
    _contentObserver: null,
    _lastScanHash: ""
  };

  // Storage
  const swMsg = (msg) => new Promise((res) => {
    try { chrome.runtime.sendMessage(msg, (r) => res(r || {ok:false})); }
    catch (_) { res({ok:false}); }
  });

  const save = async () => { try { await chrome.storage.local.set({[STORAGE_KEY]:state}); } catch(_){} };
  const load = async () => {
    try { const r = await chrome.storage.local.get(STORAGE_KEY); if (r?.[STORAGE_KEY]) Object.assign(state, r[STORAGE_KEY]); } catch(_){}
  };

  const dayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  };

  let _currentDay = dayKey();

  const dailyGet = async () => {
    const r = await swMsg({type:"AI_METER_DAILY_GET", day:dayKey()});
    state.todayWh = Number(r?.today?.wh || 0) || 0;
    state.todayCo2 = Number(r?.today?.co2 || 0) || 0;
    state.todayPrompts = Number(r?.today?.prompts || 0) || 0;
  };

  const dailyDelta = async (dPrompts, dWh, dCo2) => {
    const r = await swMsg({type:"AI_METER_DAILY_DELTA", day:dayKey(), delta:{prompts:dPrompts, wh:dWh, co2:dCo2}});
    if (r?.ok && r.today) {
      state.todayWh = Number(r.today.wh || 0) || 0;
      state.todayCo2 = Number(r.today.co2 || 0) || 0;
      state.todayPrompts = Number(r.today.prompts || 0) || 0;
    }
  };

  const ensureCorrectDay = async () => {
    const k = dayKey();
    if (k === _currentDay) return;
    _currentDay = k;
    await dailyGet();
    update();
  };

  // Platform detection
  const host = () => location.hostname.replace(/^www\./,"").toLowerCase();
  const isSuffix = (h,d) => h === d || h.endsWith("."+d);
  const platformFor = (h) => PLATFORMS.find(p => isSuffix(h,p.domain)) || null;

  // AI Content Detection
  async function scanImagesForAI() {
    const reasons = [];
    const images = Array.from(document.querySelectorAll('img'));
    
    // Only check visible, loaded images
    const visibleImages = images.filter(img => {
      if (!img.complete || !img.naturalWidth) return false;
      if (img.offsetParent === null) return false; // hidden
      if (img.width < 100 || img.height < 100) return false; // too small
      return true;
    });
    
    if (visibleImages.length === 0) return { detected: false, reasons: [] };
    
    // Check for AI-related keywords in img attributes
    for (const img of visibleImages.slice(0, 20)) { // Limit to first 20 images for performance
      // Check alt text, title, and src for AI keywords
      const altText = (img.alt || '').toLowerCase();
      const titleText = (img.title || '').toLowerCase();
      const srcText = (img.src || '').toLowerCase();
      
      const aiKeywords = [
        'midjourney', 'dall-e', 'dalle', 'stable-diffusion', 'stablediffusion',
        'ai-generated', 'ai generated', 'artificial intelligence',
        'chatgpt', 'gpt', 'openai', 'replicate', 'runway',
        'leonardo.ai', 'ideogram', 'flux'
      ];
      
      for (const keyword of aiKeywords) {
        if (altText.includes(keyword) || titleText.includes(keyword) || srcText.includes(keyword)) {
          reasons.push('AI-generated image found');
          return { detected: true, reasons };
        }
      }
      
      // Check data attributes
      for (const attr of img.attributes) {
        if (attr.name.startsWith('data-') && attr.value) {
          const val = attr.value.toLowerCase();
          for (const keyword of aiKeywords) {
            if (val.includes(keyword)) {
              reasons.push('AI-generated image found');
              return { detected: true, reasons };
            }
          }
        }
      }
    }
    
    return { detected: false, reasons: [] };
  }

  async function scanPageForAI() {
    const reasons = [];
    
    // Scan text content
    const textResult = scanTextForAI();
    if (textResult.detected) {
      reasons.push(...textResult.reasons);
    }
    
    // Scan images
    const imageResult = await scanImagesForAI();
    if (imageResult.detected) {
      reasons.push(...imageResult.reasons);
    }
    
    const detected = reasons.length > 0;
    return { detected, reasons };
  }

  function scanTextForAI() {
    const reasons = [];
    
    // Get all visible text content (excluding script/style)
    const textNodes = [];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          const tag = parent.tagName?.toLowerCase();
          if (tag === 'script' || tag === 'style' || tag === 'noscript') return NodeFilter.FILTER_REJECT;
          if (parent.offsetParent === null) return NodeFilter.FILTER_REJECT; // hidden
          if (node.textContent.trim().length < 20) return NodeFilter.FILTER_REJECT; // too short
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );
    
    let node;
    while (node = walker.nextNode()) {
      textNodes.push(node.textContent);
    }
    
    const fullText = textNodes.join(' ');
    if (fullText.length < 100) return { detected: false, reasons: [] }; // Not enough content
    
    const wordCount = fullText.split(/\s+/).length;
    
    // Check for explicit AI phrases (HIGH CONFIDENCE)
    let explicitMatches = 0;
    for (const pattern of AI_PATTERNS.phrases) {
      if (pattern.test(fullText)) {
        explicitMatches++;
        reasons.push('AI-generated text found');
        if (explicitMatches >= 1) break; // One explicit phrase is enough
      }
    }
    
    // Check for hedging language (needs multiple matches)
    let hedgingCount = 0;
    for (const pattern of AI_PATTERNS.hedging) {
      const matches = fullText.match(pattern);
      if (matches) hedgingCount += matches.length;
    }
    const hedgingDensity = hedgingCount / wordCount;
    
    // Check for transition word overuse (AI loves formal transitions)
    let transitionCount = 0;
    for (const pattern of AI_PATTERNS.transitions) {
      const matches = fullText.match(pattern);
      if (matches) transitionCount += matches.length;
    }
    const transitionDensity = transitionCount / wordCount;
    
    // Check for lack of contractions (AI writes formally)
    let formalCount = 0;
    for (const pattern of AI_PATTERNS.formalisms) {
      const matches = fullText.match(pattern);
      if (matches) formalCount += matches.length;
    }
    const formalDensity = formalCount / wordCount;
    
    // Linguistic fingerprints (MEDIUM confidence when combined)
    if (transitionDensity > 0.015) { // More than 1.5% transition words
      reasons.push('Formal AI writing patterns detected');
    }
    
    if (formalDensity > 0.025 && hedgingDensity > 0.06) { // Formal + hedging combo
      reasons.push('Unusual writing style consistent with AI');
    }
    
    if (hedgingDensity > 0.10) { // Extreme hedging
      reasons.push('Excessive use of qualifying language');
    }
    
    // CONSERVATIVE: Only flag if we have HIGH confidence
    const detected = explicitMatches >= 1 || reasons.length >= 2;
    
    return { detected, reasons };
  }

  async function detect() {
    const p = platformFor(host());
    if (p) {
      // STATE C: Known AI Platform (MAGENTA)
      state.platformName = p.name;
      state.platformType = p.type;
      state.whPerResponse = p.whPerResponse || 0;
      state.whPerGen = p.whPerGen || 0;
      state.dot = "magenta";
      state.aiSignalsDetected = false;
      state.detectionReasons = [];
    } else {
      // Check for AI signals on non-AI platforms
      const scanResult = await scanPageForAI();
      
      if (scanResult.detected) {
        // STATE B: AI Signals Detected (YELLOW)
        state.platformName = "";
        state.platformType = null;
        state.whPerResponse = 0;
        state.whPerGen = 0;
        state.dot = "yellow";
        state.aiSignalsDetected = true;
        state.detectionReasons = scanResult.reasons;
      } else {
        // STATE A: No AI Detected (GREEN)
        state.platformName = "";
        state.platformType = null;
        state.whPerResponse = 0;
        state.whPerGen = 0;
        state.dot = "green";
        state.aiSignalsDetected = false;
        state.detectionReasons = [];
      }
    }
  }

  // Debounced re-scan when content changes
  function scheduleScan() {
    if (state._scanTimeout) clearTimeout(state._scanTimeout);
    state._scanTimeout = setTimeout(async () => {
      await detect();
      update();
    }, 500); // Wait 500ms after last change before re-scanning
  }

  // Start observing DOM mutations for dynamic content
  function startContentObserver() {
    // Don't observe on known AI platforms (not needed)
    if (state.platformName) return;
    
    // Stop existing observer
    if (state._contentObserver && typeof state._contentObserver.disconnect === 'function') {
      state._contentObserver.disconnect();
    }
    
    // Create new observer
    state._contentObserver = new MutationObserver((mutations) => {
      // Check if mutations added significant content
      let hasSignificantChange = false;
      
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          for (const node of mutation.addedNodes) {
            // Check if added node has text or images
            if (node.nodeType === Node.ELEMENT_NODE) {
              const text = node.textContent?.trim() || '';
              const images = node.querySelectorAll?.('img') || [];
              if (text.length > 50 || images.length > 0) {
                hasSignificantChange = true;
                break;
              }
            } else if (node.nodeType === Node.TEXT_NODE) {
              if ((node.textContent?.trim().length || 0) > 50) {
                hasSignificantChange = true;
                break;
              }
            }
          }
        }
        if (hasSignificantChange) break;
      }
      
      if (hasSignificantChange) {
        scheduleScan();
      }
    });
    
    // Observe body for changes
    state._contentObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Response detection (counts user messages as prompts)
  let _lastCount = 0;
  let _observer = null;
  let _conversationKey = "";

  const RESPONSE_SELECTORS = [
    "[data-testid='user-message']",           // Claude.ai
    "[data-message-author-role='assistant']", // ChatGPT, Meta AI
    "model-response",
    "[class*='model-response']",
    "[class*='assistant-message']",
    "[class*='gridItem']",
    '[role="assistant"]',
    '[data-testid*="assistant"]',
  ];

  function countResponses() {
    for (const sel of RESPONSE_SELECTORS) {
      try { const n = document.querySelectorAll(sel).length; if (n > 0) return n; } catch (_) {}
    }
    return 0;
  }

  function getConversationKey() {
    const path = location.pathname + location.search.split('?')[0];
    return `${host()}:${path}`;
  }

  async function loadConversationCount() {
    try {
      const key = `ai-meter-conv:${_conversationKey}`;
      const r = await chrome.storage.local.get(key);
      return Number(r?.[key] || 0) || 0;
    } catch (_) { return 0; }
  }

  async function saveConversationCount(count) {
    try {
      const key = `ai-meter-conv:${_conversationKey}`;
      await chrome.storage.local.set({[key]: count});
    } catch (_) {}
  }

  function onNewResponses(count) {
    if (!state.platformName || !state.platformType) return;
    let wh = 0;
    if (state.platformType === "chat" || state.platformType === "tool") wh = (state.whPerResponse || 2.0) * count;
    else if (state.platformType === "image") wh = (state.whPerGen || 3.5) * count;
    else if (state.platformType === "video") wh = (state.whPerGen || 40) * count;
    else if (state.platformType === "audio") wh = (state.whPerGen || 8) * count;
    if (wh <= 0) return;
    cycleComparison();
    dailyDelta(count, wh, (wh / 1000) * CO2_PER_KWH).then(() => update());
  }

  async function checkForNewResponses() {
    if (!state.platformName) return;
    const current = countResponses();
    if (current > _lastCount) {
      const delta = current - _lastCount;
      _lastCount = current;
      await saveConversationCount(current);
      onNewResponses(delta);
    }
  }

  
  // Fallback: count prompts on submit for platforms whose DOM doesn't expose assistant messages reliably (e.g. Meta AI).
  // This keeps "today" stats updating in real time.
  let _promptListenerAttached = false;
  let _lastPromptAt = 0;

  function startPromptListener() {
    if (_promptListenerAttached) return;
    // Only enable on Meta AI for now to avoid double-counting on platforms where we already count assistant responses.
    if (host() !== "meta.ai" && !host().endsWith(".meta.ai")) return;

    _promptListenerAttached = true;

    document.addEventListener("keydown", (e) => {
      try {
        if (e.key !== "Enter") return;
        if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;

        const t = e.target;
        const isComposer =
          (t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT")) ||
          (t && t.isContentEditable);

        if (!isComposer) return;
        if (t.closest?.("#ai-meter-root")) return;

        const now = Date.now();
        if (now - _lastPromptAt < 800) return; // debounce rapid Enter / IME quirks
        _lastPromptAt = now;

        // Count as a "prompt" immediately.
        onNewResponses(1);
      } catch (_) {}
    }, true);
  }

async function startObserver() {
    if (_observer) _observer.disconnect();
    _conversationKey = getConversationKey();
    const storedCount = await loadConversationCount();
    const pageCount = countResponses();
    _lastCount = Math.max(storedCount, pageCount);
    if (pageCount > storedCount) {
      const missedCount = pageCount - storedCount;
      await saveConversationCount(pageCount);
      onNewResponses(missedCount);
    }
    _observer = new MutationObserver((mutations) => {
      const relevant = mutations.some(m => {
        if (!m.addedNodes.length) return false;
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.id === "ai-meter-root" || node.closest?.("#ai-meter-root")) return false;
          return true;
        }
        return false;
      });
      if (relevant) checkForNewResponses();
    });
    _observer.observe(document.body, {childList:true, subtree:true});
  }

  // UI
  let ui = null;
  const $ = (sel, root=document) => root.querySelector(sel);
  const hasData = () => !!(state.platformName && state.platformType && state.todayWh > 0);

  function ensureUI() {
    const existing = $("#ai-meter-root");
    if (existing) {
      const panel = $(".ai-me-panel", existing);
      const pill = $(".ai-me-pill", existing);
      if (panel && pill) {
        if (!ui) { ui = {root:existing, panel, pill}; bindHandlers(existing, panel, pill); }
        return;
      }
      existing.remove();
    }

    const root = document.createElement("div");
    root.id = "ai-meter-root";
    root.className = state.position;

    const panel = document.createElement("div");
    panel.className = "ai-me-panel";
    panel.setAttribute("role", "region");
    panel.setAttribute("aria-label", "AI Meter energy monitor");
    panel.innerHTML = `
      <div class="ai-me-header">
        <div class="ai-me-header-left">
          <div class="ai-me-dot" aria-hidden="true"></div>
          <h2 class="ai-me-title">AI Meter</h2>
        </div>
        <button class="ai-me-caretBtn" type="button" aria-label="Close AI Meter panel">${ICON.caret}</button>
      </div>
      <p class="ai-me-desc"></p>
      <div class="ai-me-divider"></div>
      <div class="ai-me-readout">
        <p class="ai-me-sectionLabel">Your AI footprint today <span class="ai-me-approx">≈</span></p>
        <div class="ai-me-equiv-row">
          <div class="ai-me-equivalency" data-k="equiv"></div>
          <button class="ai-me-shuffleBtn" aria-label="Show different comparison">${ICON.shuffle}</button>
        </div>
        <div class="ai-me-metrics-row">
          <div class="ai-me-metric">
            <span class="ai-me-value" data-k="prompts">0</span>
            <span class="ai-me-unit">prompts</span>
          </div>
          <div class="ai-me-metric">
            <span class="ai-me-value" data-k="wh">0</span>
            <span class="ai-me-icon">${ICON.bolt}</span>
            <span class="ai-me-unit">Wh</span>
          </div>
          <div class="ai-me-metric">
            <span class="ai-me-value" data-k="co2">0</span>
            <span class="ai-me-unit">g&nbsp;CO₂</span>
          </div>
        </div>
      </div>`;

    const pill = document.createElement("div");
    pill.className = "ai-me-pill";
    pill.setAttribute("role", "button");
    pill.setAttribute("tabindex", "0");
    pill.setAttribute("aria-label", "Open AI Meter panel");
    pill.setAttribute("aria-expanded", "false");
    pill.innerHTML = `<div class="ai-me-dot" aria-hidden="true"></div><div class="ai-me-status"></div>`;

    root.append(panel, pill);
    (document.body || document.documentElement).appendChild(root);
    ui = {root, panel, pill};
    bindHandlers(root, panel, pill);
  }

  function bindHandlers(root, panel, pill) {
    if (root.dataset.bound === "1") return;
    root.dataset.bound = "1";

    const open = () => { 
      state.expanded = true; 
      save(); 
      update();
      
      // Attach shuffle handler on first open (when button definitely exists)
      if (!panel._shuffleAttached) {
        panel._shuffleAttached = true;
        setTimeout(() => {
          const shuffleBtn = $(".ai-me-shuffleBtn", panel);
          if (shuffleBtn) {
            console.log('[AI Meter] Attaching shuffle handler on open');
            shuffleBtn.addEventListener("click", (e) => {
              console.log('[AI Meter] SHUFFLE BUTTON CLICKED!');
              e.stopPropagation();
              e.preventDefault();
              cycleComparison();
              const equivEl = $('[data-k="equiv"]', panel);
              if (equivEl) {
                const comparisonText = getEquivalency(state.todayWh, state.todayCo2);
      const shuffleBtn = panel.querySelector(".ai-me-shuffleBtn");
      if (!comparisonText || state.todayWh <= 0) {
        equivEl.style.display = "none";
        if (shuffleBtn) shuffleBtn.style.display = "none";
      } else {
        equivEl.style.display = "";
        equivEl.innerHTML = comparisonText;
        if (shuffleBtn) shuffleBtn.style.display = "";
      }
}
            });
          } else {
            console.error('[AI Meter] Shuffle button STILL not found after open!');
          }
        }, 100);
      }
    };
    const close = () => {
      if (state.position === "center") {
        state._collapsingCenter = true;
        setTimeout(() => { state._collapsingCenter = false; update(); }, 260);
      }
      state.expanded = false; save(); update();
    };

    $(".ai-me-caretBtn", panel)?.addEventListener("click", (e) => { e.stopPropagation(); close(); });

    let down = null, dragging = false;
    const snapPos = (x) => { const w = window.innerWidth||1; return x<w*.33?"left":x>w*.66?"right":"center"; };
    const dist = (a,b) => Math.hypot(a.x-b.x, a.y-b.y);

    pill.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      down = {x:e.clientX, y:e.clientY}; dragging = false;
      pill.setPointerCapture?.(e.pointerId);
    });
    pill.addEventListener("pointermove", (e) => {
      if (!down) return;
      if (!dragging && dist(down,{x:e.clientX,y:e.clientY}) > 8) {
        dragging = true;
        root.classList.add("dragging");
      }
      if (!dragging) return;
      const pos = snapPos(e.clientX);
      if (pos !== state.position) { 
        state.position = pos; 
        root.className = `${pos}${state.expanded?" expanded":""}`;
        root.classList.add("dragging");
      }
    });
    const end = () => {
      if (!down) return;
      const wasDrag = dragging; 
      down = null; 
      dragging = false;
      root.classList.remove("dragging");
      if (wasDrag) { save(); return; }
      open();
    };
    pill.addEventListener("pointerup", end);
    pill.addEventListener("pointercancel", () => { down = null; dragging = false; });
    pill.addEventListener("keydown", (e) => { if (e.key==="Enter"||e.key===" ") { e.preventDefault(); open(); } });
  }

  function syncLayout() {
    if (!ui) return;
    const {root, panel, pill} = ui;
    root.classList.remove("left","center","right");
    root.classList.add(state.position);
    root.setAttribute("data-expanded", state.expanded?"true":"false");
    
    // Simple absolute positioning
    panel.style.position = "absolute";
    panel.style.bottom = "0";
    pill.style.position = "absolute";
    pill.style.bottom = "0";
  }

  function setDot(el) {
    if (!el) return;
    el.className = `ai-me-dot dot-${state.dot}`;
    if (state.todayWh > 0) el.classList.add("ai-me-dot--active");
    else el.classList.remove("ai-me-dot--active");
  }

  function update() {
    ensureUI();
    if (!ui) return;
    const {root, panel, pill} = ui;

    root.className = `${state.position}${state.expanded?" expanded":""}`;

    // Dot already set by detect() - don't override it
    
    setDot($(".ai-me-dot", pill));
    const statusEl = $(".ai-me-status", pill);
    
    // Pill text based on state
    if (state.platformName) {
      // STATE C: Platform detected (magenta)
      if (statusEl) statusEl.textContent = state.platformName;
    } else if (state.aiSignalsDetected) {
      // STATE B: AI signals detected (yellow)
      if (statusEl) statusEl.textContent = "AI Signals Detected";
    } else {
      // STATE A: No AI detected (green)
      if (statusEl) statusEl.textContent = "No AI Detected";
    }
    
    pill.setAttribute("aria-expanded", state.expanded?"true":"false");

    setDot($(".ai-me-dot", panel));
    const titleEl = $(".ai-me-title", panel);
    const descEl = $(".ai-me-desc", panel);
    
    // Panel title and description based on state
    if (state.platformName) {
      // STATE C: Platform detected (magenta)
      if (titleEl) titleEl.textContent = state.platformName;
      if (descEl) {
        const vendor = PLATFORMS.find(p => p.name === state.platformName)?.vendor;
        descEl.textContent = vendor ? `AI ${state.platformType || "platform"}, powered by ${vendor}.` : `AI ${state.platformType || "platform"}.`;
        descEl.style.display = ""; // show description
      }
    } else if (state.aiSignalsDetected) {
      // STATE B: AI signals detected (yellow)
      if (titleEl) titleEl.textContent = "AI Signals Detected";
      if (descEl) {
        if (state.detectionReasons.length > 0) {
          // Format as list without bullets (flush left)
          const listItems = state.detectionReasons.map(r => 
            `<div style="margin-bottom:4px;">${r}</div>`
          ).join('');
          descEl.innerHTML = listItems;
        } else {
          descEl.textContent = 'AI-generated content or signals detected on this page.';
        }
        descEl.style.display = ""; // show description
      }
    } else {
      // STATE A: No AI detected (green)
      if (titleEl) titleEl.textContent = "No AI Detected";
      if (descEl) {
        descEl.textContent = ""; // clear content
        descEl.style.display = "none"; // hide description
      }
    }

    const divider = $(".ai-me-divider", panel);
    // Hide divider in green state (no AI detected)
    if (divider) {
      if (!state.platformName && !state.aiSignalsDetected) {
        divider.style.display = "none";
      } else {
        divider.style.display = "";
      }
    }

    const readout = $(".ai-me-readout", panel);
    if (readout) readout.style.display = "";

    // Update metrics
    const promptsEl = $('[data-k="prompts"]', panel);
    const whEl = $('[data-k="wh"]', panel);
    const co2El = $('[data-k="co2"]', panel);
    const equivEl = $('[data-k="equiv"]', panel);
    
    if (promptsEl) promptsEl.textContent = Math.round(state.todayPrompts);
    if (whEl) whEl.textContent = Math.round(state.todayWh);
    if (co2El) co2El.textContent = Math.round(state.todayCo2);
    
    // Update section label ≈ symbol visibility
    const sectionLabel = $(".ai-me-sectionLabel", panel);
    const approxSymbol = sectionLabel ? $(".ai-me-approx", sectionLabel) : null;
    const equivRow = $(".ai-me-equiv-row", panel);
    
    // Store references globally for onclick handler
    if (!window._aiMeterRefs) window._aiMeterRefs = {};
    window._aiMeterRefs.equivEl = equivEl;
    window._aiMeterRefs.state = state;
    window._aiMeterRefs.cycleComparison = cycleComparison;
    window._aiMeterRefs.getEquivalency = getEquivalency;
    
    // Create global shuffle function ONCE
    if (!window.aiMeterShuffle) {
      window.aiMeterShuffle = function() {
        console.log('[AI Meter] ===== SHUFFLE CLICKED =====');
        const refs = window._aiMeterRefs;
        if (!refs) {
          console.error('[AI Meter] No refs found!');
          return;
        }
        console.log('[AI Meter] Before cycle, index:', _comparisonIndex);
        refs.cycleComparison();
        console.log('[AI Meter] After cycle, index:', _comparisonIndex);
        const newEquiv = refs.getEquivalency(refs.state.todayWh, refs.state.todayCo2);
        console.log('[AI Meter] New equivalency:', newEquiv);
        refs.equivEl.innerHTML = newEquiv;
        console.log('[AI Meter] Done!');
      };
      console.log('[AI Meter] Global shuffle function created');
    }
    
    // Hide comparison and ≈ if no energy used
    if (equivEl && equivRow) {
      if (state.todayWh > 0) {
        equivEl.innerHTML = getEquivalency(state.todayWh, state.todayCo2);
        equivRow.style.display = "";
        if (approxSymbol) approxSymbol.style.display = "";
      } else {
        equivRow.style.display = "none";
        if (approxSymbol) approxSymbol.style.display = "none";
      }
    }

    panel.classList.toggle("open", !!state.expanded);
    pill.classList.toggle("hidden", !!state.expanded);
    syncLayout();
  }

  // Main loop
  let _lastHref = location.href;
  let _loopTs = window[ENG].lastLoopTs || 0;

  async function onNavMaybe() {
    if (location.href === _lastHref) return;
    _lastHref = location.href;
    const newKey = getConversationKey();
    if (newKey !== _conversationKey) {
      _conversationKey = newKey;
      _lastCount = 0;
    }
    startObserver();
    startPromptListener();
    await detect();
    update();
    save();
    startContentObserver(); // Start watching for dynamic content
  }

  async function mainLoop() {
    const now = Date.now();
    if (!_loopTs) { _loopTs = now; window[ENG].lastLoopTs = _loopTs; await detect(); update(); return; }
    _loopTs = now; window[ENG].lastLoopTs = _loopTs;
    await ensureCorrectDay();
    await onNavMaybe();
    await detect();
    update();
  }

  async function init() {
    await load();
    await dailyGet();
    _currentDay = dayKey();
    await detect();
    startObserver();
    ensureUI();
    update();
    startContentObserver(); // Start watching for dynamic content
    window[ENG].intervalId = setInterval(mainLoop, LOOP_MS);
  }

  init();
})();