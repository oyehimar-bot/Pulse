# Pulse — WhatsApp Conversational Flow
## Adobe XD Production Spec · Deliverable 2
### Screen 1 Negotiation · Screen 2 Deal Creation · Screen 3 Payment Lock · Screen 4 Delivery & Release

---

## 0. DOCUMENT SETUP

### 0.1 File & Artboards
- **File name:** `Pulse_WA_Flow_XD_v1.xd`
- **Artboard prefix:** `Pulse/WA/`
- Artboards (top row, left → right, 80px gutters):
  | # | Artboard name | Size |
  |---|---------------|------|
  | 1 | `Pulse/WA/01 Negotiation` | 390 × 844 |
  | 2 | `Pulse/WA/02 Deal Creation` | 390 × 844 |
  | 3 | `Pulse/WA/03 Payment Lock` | 390 × 844 |
  | 4 | `Pulse/WA/04 Delivery & Release` | 390 × 844 |
- Prototype panel: "Flow: WhatsApp → Escrow → Release"

### 0.2 Grid
- Layout column grid: **4 columns, 24px margins, 16px gutter** (WhatsApp-like density)
- 8px baseline grid; icons snap to 8
- Row rhythm: header 56 / chat area flexible / input bar 60 / safe area 34

### 0.3 Palette (ONLY these tokens — no others)
```
--pulse-blue-dark:        #1E3A8A
--pulse-blue-primary:     #2563EB
--creative-violet-dark:   #7C3AED
--creative-violet-primary:#9333EA
--stable-green-dark:      #059669
--stable-green-primary:   #10B981
--burgundy-dark:          #800020
--burgundy-primary:       #881337
--bg-midnight:            #0B081E
--surface-card:           rgba(24, 18, 54, 0.7)
--text-white:             #FFFFFF
--text-muted:             #9FA8DA
```
Semantic mapping:
| Token | Use in WA flow |
|---|---|
| bg-midnight | WA canvas (replaces WA default beige) |
| surface-card | WhatsApp header bar + input bar |
| pulse-blue-primary | Outgoing bubbles, primary buttons |
| pulse-blue-dark | Outgoing bubble gradients / pressed states |
| creative-violet-primary | Bot/system bubbles, "Pulse Assistant" prompts |
| creative-violet-dark | Bot bubble gradients, typing dots |
| stable-green-primary | Verified ticks, escrow locked, success states |
| stable-green-dark | Success gradients, Release button pressed |
| burgundy-primary | Legal seal accents, certificate borders, "Binding" tags |
| burgundy-dark | Seal gradients, high-value contract frames |
| text-white | Primary text |
| text-muted | Timestamps, secondary text, placeholders |

### 0.4 Type
- Family: **Poppins** (heads/labels) + **Inter** (chat body)
- Scale: Chat body 13/18 · Timestamp 10/12 · Screen title 16/22 SemiBold · Section label 11/14 caps +0.18em · Amount 24/30 Bold

---

## 1. SHARED COMPONENTS (all artboards)

### C1 — WA App Frame
Layers (top→bottom): `Safe Area / 34`, `Input Bar / 60`, `Chat Scroll / flex`, `WA Header / 56`, `Status Bar / 44`
- Status bar: 12:30 · signal · wifi · battery — `text-white`, Inter 12
- Header (surface-card): back chevron, avatar 36 (bot face, blue-violet ring), title "Pulse Assistant" 14 SemiBold white, subtitle "online" 10 text-muted, video/call/dots icons text-muted

### C2 — Chat Bubbles
- Outgoing (user): fill `pulse-blue-primary→pulse-blue-dark` 135°, radius 16/16/4/16, tail right, text white 13/18, timestamp 10 text-white 60% + blue double-check ticks `text-white`
- Incoming (bot): fill `creative-violet-primary→creative-violet-dark` 135° at 90% α, radius 16/16/16/4, tail left, text white 13/18, timestamp 10 text-muted
- System chips (centered, surface-card, radius 999, text-muted 11)

### C3 — Cards in Chat (glass, surface-card 90%, border glass 16%)
- Radius 20, shadow 0 24px 48px rgba(4,2,16,.45)
- Header strip variants: blue (user deal), violet (bot prompt), green (payment), burgundy (legal)

### C4 — Amount Pill
- 24 Bold white on burgundy-dark→burgundy-primary gradient, radius 14, used for ₦ values in legal/contract contexts

### C5 — Buttons
- Primary: blue gradient, radius 999, label caps 11/14 +0.2em
- Success: green gradient (Release / Delivered)
- Legal: burgundy gradient (Sign / Binding)
- Ghost: surface-card + glass border

### C6 — Typing Indicator
- Bot bubble with 3 dots `text-muted`, violet glow pulse

---

## 2. SCREEN 1 — `Pulse/WA/01 Negotiation`

### 2.1 Layout
1. App Frame C1
2. Chat scroll (16px side padding):
   - Day chip: "TODAY"
   - Bot greeting bubble (C2 incoming) 09:58
   - User need bubble (outgoing) 09:59
   - Bot capabilities reply (incoming) 10:00
   - Bot **Capabilities Card** (C3 violet header): 4 rows icon+text
   - User choice (outgoing) 10:01
   - Bot quote summary (incoming) 10:02
3. Input bar: "Type a message" + sticker, attach, camera, mic

### 2.2 Exact Conversation Copy
- **Day chip:** TODAY
- **Bot (09:58):** "Hi Amara 👋 I'm Pulse, your escrow assistant. I turn your WhatsApp deals into secure transactions — no apps needed."
- **User (09:59):** "I need a landing page for my bakery, something modern."
- **Bot (10:00):** "Great! I can help you hire verified creators with full escrow protection. What's your budget range?"
- **Capabilities Card** (violet header "PULSE CAN HELP WITH"):
  - 🎨 Hire verified designers
  - 📹 Book video editors
  - ✍️ Contract writing & review
  - 🔒 Escrow-secured payments
- **User (10:01):** "Around ₦150,000, and I need it done in 2 weeks."
- **Bot (10:02):** "Perfect. Based on your budget and timeline, here's what I recommend:"
  **Quote Card** (blue header "RECOMMENDED PACKAGE"):
  - Landing page — ₦150,000
  - Delivery — 14 days
  - Revisions — 2 rounds
- **User (10:03):** "Let's do it."

### 2.3 Prototype
- Typing dots 800ms → bubbles auto-sequence on scroll trigger
- "Let's do it." → tap → auto-reply "Creating your secure deal…" → **transition to Screen 2** (Wipe left 300ms)

---

## 3. SCREEN 2 — `Pulse/WA/02 Deal Creation`

### 3.1 Layout
1. App Frame C1
2. Bot bubble: "Creating your secure deal…"
3. **Deal Terms Card** (blue header "DEAL TERMS — #PLS-2847"): rows label/value
4. User confirm bubble
5. Bot bubble: creators invited
6. **Verified Creator Card** (violet header, ✅ blue-check style but in green tokens): Amara Fashion House ✓
7. Creator acceptance bubble + bot confirmation

### 3.2 Exact Conversation Copy
- **Bot (10:03):** "Creating your secure deal…"
- **Deal Terms Card** (header: DEAL TERMS · deal ID chip `#PLS-2847`):
  - Service: Landing page design
  - Client: Amara Bakery
  - Creator: — (awaiting acceptance)
  - Amount: ₦150,000
  - Delivery: 14 days
  - Revisions: 2 rounds
- **User (10:04):** "Looks right 👍"
- **Bot (10:04):** "Invite sent to **Amara Fashion House** — a verified creator."
- **Verified Creator Card** (violet header "VERIFIED CREATOR"):
  - Amara Fashion House
  - ✓ Identity verified · ✓ 127 deals · ★ 4.9 (54 reviews)
  - Status chip: "Awaiting response"
- **Creator (10:06):** "I accept! Sending my standard terms now."
- **Bot (10:07):** "Creator accepted. Your deal is ready for the final step: payment."

### 3.3 Prototype
- Terms card animates rows stagger 60ms
- Creator card status chip auto-swaps "Awaiting response" → "Accepted ✓" (green) on tap
- Bot confirmation → **tap anywhere → Screen 3** (Wipe left 300ms)

---

## 4. SCREEN 3 — `Pulse/WA/03 Payment Lock`

### 4.1 Layout
1. App Frame C1
2. Bot bubble: payment instruction
3. **Payaza Payment Card** (green header "PAYAZA SECURE CHECKOUT"): amount 24 Bold, payee, ref, method row, PAY button
4. User "Sent!" bubble with receipt chip
5. **Escrow Locked Card** (green header "ESCROW STATUS"): lock icon, locked rows, hash
6. Legal notice micro-copy + **Legal Seal** (burgundy)

### 4.2 Exact Conversation Copy
- **Bot (10:07):** "Lock the funds in escrow so work can begin. You'll only be released to the creator after you approve delivery."
- **Payaza Payment Card** (header: PAYAZA SECURE CHECKOUT):
  - Amount: **₦150,000**
  - Payee: Pulse Escrow (Payaza)
  - Reference: PLS-2847-ESC
  - Method: Bank transfer · Card
  - [ PAY ₦150,000 ] (primary blue button)
- **User (10:09):** "Payment sent! Here's the receipt." 🧾
- **Bot (10:09):** "Funds received. Your money is now locked in escrow and visible to both parties."
- **Escrow Locked Card** (green header "ESCROW STATUS"):
  - 🔒 Funds locked — ₦150,000
  - Held by: Pulse Escrow (Payaza)
  - Ref: PLS-2847-ESC
  - Release condition: Creator delivers → Client approves
- **System chip:** "Both parties can see the escrow balance in real time."
- **Legal micro-copy (burgundy):** "This conversation is recorded as a legally binding agreement under Pulse Terms."
- **Legal Seal** (burgundy): rosette + "Legally binding" tag

### 4.3 Prototype
- PAY button tap → processing spinner 1.2s → card header flips green + check
- Escrow card rows stagger in; seal stamps with scale 1.15→1.0 + opacity fade
- Auto-advance 1.5s → **Screen 4** (Wipe left 300ms)

---

## 5. SCREEN 4 — `Pulse/WA/04 Delivery & Release`

### 5.1 Layout
1. App Frame C1
2. Creator delivery bubble + **Delivery Card** (violet header "DELIVERY — ROUND 1/2")
3. Bot review prompt bubble
4. User approve bubble
5. **Release Confirmation Card** (green header "ESCROW RELEASED"): released amount, receipt ref, creator payout line
6. **Completion Certificate** (burgundy frame): seal, deal summary, signature line, cert ID
7. Bot closing + review prompt

### 5.2 Exact Conversation Copy
- **Creator (10:41):** "First draft ready! Here's the preview — happy to revise anything."
- **Delivery Card** (violet header "DELIVERY — ROUND 1 OF 2"):
  - 📦 landing-page-v1.fig
  - Note: "Modern, warm tones per your brief"
  - [ View files ] ghost button
- **Bot (10:42):** "Take your time reviewing. You have 2 revision rounds included."
- **User (10:44):** "Love it! One tweak — make the hero warmer. Otherwise approve."
- **Creator (10:45):** "Done! Warm hero applied. Final files attached."
- **Delivery Card** (violet header "DELIVERY — FINAL"):
  - 📦 landing-page-final.fig
  - 📦 brand-assets.zip
- **Bot (10:46):** "Approve to release ₦150,000 from escrow to Amara Fashion House?"
- **User (10:47):** "Approved! 🎉"
- **Release Confirmation Card** (green header "ESCROW RELEASED"):
  - ✅ ₦150,000 released to Amara Fashion House
  - Payaza receipt: PZ-88412-RC
  - Creator payout: instant · fee ₦0 promo
- **Completion Certificate** (burgundy frame, header "CERTIFICATE OF COMPLETION"):
  - Deal: Landing page design
  - Parties: Amara Bakery × Amara Fashion House
  - Amount: ₦150,000 · Delivery: 14 days → completed day 12
  - Cert ID: PLS-2847-CERT
  - Signature line: "Signed in chat — legally binding"
- **Bot (10:48):** "Deal complete! 🎉 Rate your experience with Amara Fashion House:"
- **System chip:** "★☆☆☆☆ tap to rate"

### 5.3 Prototype
- Delivery cards: tap "View files" → overlay
- Approve tap → processing 1s → release card green flash + confetti (4 particle sprites, palette colors)
- Certificate stamps (scale + fade like Screen 3 seal)
- End state: "Start a new deal" ghost button → jumps to **Screen 1** (Wipe right 300ms)

---

## 6. HANDOFF NOTES
- All bubbles/cards auto-layout in XD: padding 12/14, gap 8, hug contents, max width 78%
- Export: @1x @2x @3x PNG per artboard + PDF flow map
- Keep every fill mapped to Section 0.3 tokens; if a shade is missing, create alpha of a token — never a new hex
- Screen order mirrors the hackathon narrative: Negotiate → Create → Lock → Deliver & Release
