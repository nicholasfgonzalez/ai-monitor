# AI Monitor

**AI Monitor** is a lightweight visibility layer for the modern web. It helps you understand *when AI may be generating or influencing the content and experiences you interact with* — clearly, honestly, and without overclaiming.

This project is intentionally modest in what it promises and explicit about its limitations. Transparency tools earn trust by being legible, not loud.

---

## What AI Monitor Does

AI Monitor runs locally in your browser and surfaces observable signals that suggest AI involvement. Depending on what it detects, it may indicate that:

* Content on a page may be written or assisted by AI
* Images or media may be AI-generated
* You are actively interacting with an AI system
* AI is generating content in real time

When a signal appears, AI Monitor explains **why** — in plain language — so you can decide how much trust or scrutiny to apply.

---

## What AI Monitor Is *Not*

AI Monitor is **not**:

* A definitive AI detector
* A verifier of authorship, originality, or intent
* A compliance or enforcement tool
* A surveillance or tracking system

It does not attempt to determine ground truth. It surfaces signals.

---

## How It Works (High Level)

AI Monitor looks for **observable patterns** that commonly appear when AI systems are involved, including:

* Known AI platforms and interfaces
* Disclosure language indicating AI use
* Interface controls typical of AI tools (e.g. prompts, regenerate actions)
* Live, streaming-style content generation after user input
* Media markers commonly associated with AI-generated images

These signals are combined to estimate *likelihood*, not certainty.

All analysis happens locally in your browser.

---

## Confidence Levels

AI Monitor uses human-readable confidence levels:

* **Low** — Weak or indirect signals
* **Medium** — Multiple supporting indicators
* **High** — Strong, direct interaction or generation behavior

Confidence reflects signal strength, not factual correctness.

---

## Privacy

AI Monitor is designed with strict privacy boundaries:

* No data is sent to external servers
* No browsing history is collected or stored remotely
* No personal information is tracked

Everything runs locally on your device.

---

## Known Limitations

AI Monitor is intentionally honest about what it cannot do.

### 1. AI can be invisible

Some AI-generated content leaves no detectable signals. If nothing is shown, it means no strong indicators were found — not that AI was definitively absent.

### 2. False positives are possible

Some patterns resemble AI usage but are not. AI Monitor prioritizes transparency over silence and may occasionally flag content conservatively.

### 3. Authorship cannot be verified

AI Monitor cannot determine who created content, how it was trained, or whether it was reviewed or edited by humans.

### 4. Standards are still evolving

Provenance metadata and disclosure standards are inconsistent and often missing. Support for these signals will improve over time, but coverage will remain uneven.

---

## Why This Exists

AI is no longer a novelty — it is infrastructure. Yet most AI involvement is invisible to end users.

AI Monitor exists to make the web more **legible**:

* Not to judge
* Not to shame
* Not to claim authority

Just to surface what can be observed, clearly and calmly.

This is a first step.

---

## Roadmap (High Level)

Planned improvements include:

* Reduced false positives through signal tuning
* Improved detection of AI-generated media
* Better support for content credentials and disclosure standards
* Clearer explanations and user education

Feedback from real-world use will guide iteration.

---

## Public FAQ

### How accurate is AI Monitor?

AI Monitor does not measure accuracy in the traditional sense. It surfaces observable signals that *often* correlate with AI involvement. It is designed to reduce blind spots, not establish certainty.

### Why didn’t it flag something I know is AI?

Not all AI-generated content leaves detectable signals. If nothing appears, it means no strong indicators were present.

### Why did it flag something that isn’t AI?

Some non-AI content shares surface-level patterns with AI systems. When in doubt, AI Monitor errs toward visibility rather than silence.

### Does this track my browsing or collect data?

No. AI Monitor runs entirely locally and does not send data anywhere.

### Is this meant to warn people about AI?

No. AI Monitor is not a warning system. It is an awareness tool.

### Is this finished?

No. This is a v1. Transparency tooling needs real-world feedback to improve.

---

## Feedback

If you find issues, edge cases, or have ideas for improvement, feedback is welcome. Transparency tools work best when they are challenged and refined in the open.

---

**AI Monitor** — making AI involvement visible, one signal at a time.
