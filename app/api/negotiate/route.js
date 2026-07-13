import { openai } from "@/configs/openai";
import prisma from "@/lib/prisma";
import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// ═══════════════════════════════════════════════════════════════════════════
// NEGOTIATION MODEL
// ═══════════════════════════════════════════════════════════════════════════
//
// Counter formula — Faratin/Boulware time-dependent concession:
//   counter(t) = minPrice + (listedPrice - minPrice) × (1 - (t/T)^(1/β))
//
//   t = current round (1..T), T = MAX_ROUNDS, β = 0.4 (Boulware curve)
//
//   With listedPrice=120, minPrice=100, T=4:
//     Round 1 → ₹119   Round 2 → ₹116
//     Round 3 → ₹110   Round 4 → ₹100
//
//   Counter depends ONLY on round number — never on buyer's offer value.
//   Accept and counter branches are fully independent → no interference bug.
//
// Acceptance — checked in strict priority order every round:
//   1. buyerOffer >= listedPrice              → accept at listedPrice (any round)
//   2. buyerOffer >= counter(currentRound)    → accept at buyerOffer  (any round)
//      "Reasonable" = buyer already met/beat AI's price for this round.
//   3. buyerOffer >= minPrice AND round == T  → accept at buyerOffer  (final round only)
//      minPrice is seller's absolute last resort — only unlocked on the
//      final round so buyer can't claim the floor cheaply in round 2.
//   4. round > MAX_ROUNDS                     → reject
//   5. else                                   → counter with counter(currentRound)
//
// ═══════════════════════════════════════════════════════════════════════════

const MAX_ROUNDS = 4;
const BETA = 0.4;

function round2(n) {
    return Math.round(n * 100) / 100;
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function computeCounter({ listedPrice, minPrice, round }) {
    const t = clamp(round, 1, MAX_ROUNDS);
    const fraction = 1 - Math.pow(t / MAX_ROUNDS, 1 / BETA);
    const raw = minPrice + (listedPrice - minPrice) * fraction;
    return Math.round(clamp(raw, minPrice, listedPrice)); // whole rupee, no decimals
}

async function generateReply({ scenario }) {
    try {
        const response = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL,
            messages: [
                {
                    role: "system",
                    content: `You are a friendly but firm shopkeeper AI for GoCart, an Indian e-commerce platform.
You are negotiating product price with a buyer. Follow these rules strictly:
- ALL prices are in Indian Rupees. ALWAYS use the ₹ symbol. NEVER use $, USD, or dollars under any circumstance.
- NEVER reveal the seller's minimum price, floor price, algorithm, round number, or any internal variable. Only communicate the counter-offer or decision you are given.
- Keep replies short (1-3 sentences), warm, and conversational — like a real Indian shopkeeper haggling in a friendly way, but entirely in English.
- Vary your phrasing every reply. Never repeat the same sentence structure twice.
- You will receive a JSON object describing the negotiation outcome. Write only the buyer-facing reply based on it.`
                },
                {
                    role: "user",
                    content: JSON.stringify(scenario)
                }
            ]
        });
        const text = response?.choices?.[0]?.message?.content?.trim();
        if (!text) throw new Error("empty response");
        return text;
    } catch (error) {
        console.error("AI reply failed, using fallback:", error?.message);
        switch (scenario.decision) {
            case "accept_listed":
                return `Full price it is — ₹${scenario.finalPrice}! Thanks for shopping. 😊`;
            case "accept":
                return `Deal! ₹${scenario.finalPrice} — you drive a hard bargain! 🤝`;
            case "counter":
                return `₹${scenario.buyerOffer} is a bit low for me, but I can do ₹${scenario.counterOffer}. What do you say?`;
            case "hold":
                return `₹${scenario.counterOffer} is absolutely my final offer — I can't go any lower than this.`;
            case "final_reject":
                return `Sorry, we couldn't reach a deal this time. You're always welcome to buy at ₹${scenario.listedPrice}.`;
            default:
                return `What's your best offer?`;
        }
    }
}

export async function POST(request) {
    try {
        const { userId } = getAuth(request);
        if (!userId) {
            return NextResponse.json({ error: "not authorized" }, { status: 401 });
        }

        const body = await request.json().catch(() => null);
        const { productId, offer } = body ?? {};

        if (!productId || typeof productId !== "string") {
            return NextResponse.json({ error: "productId is required" }, { status: 400 });
        }
        const offerNum = Number(offer);
        if (offer == null || !Number.isFinite(offerNum) || offerNum <= 0) {
            return NextResponse.json({ error: "a valid positive offer amount is required" }, { status: 400 });
        }
        const buyerOffer = round2(offerNum);

        const product = await prisma.product.findUnique({ where: { id: productId } });
        if (!product) {
            return NextResponse.json({ error: "product not found" }, { status: 404 });
        }

        const listedPrice = product.price;

        if (product.minPrice == null) {
            return NextResponse.json({ error: "bargaining is not enabled for this product" }, { status: 400 });
        }

        const minPrice = round2(clamp(product.minPrice, 0.01, listedPrice));

        // Load existing negotiation; reset if previous session already finished
        let negotiation = await prisma.negotiation.findUnique({
            where: { userId_productId: { userId, productId } }
        });
        if (negotiation && negotiation.status !== "ONGOING") {
            negotiation = null;
        }
        const prevRound = negotiation?.round ?? 0;
        const currentRound = prevRound + 1;

        // Pre-compute AI's counter for this round (pure function of round number)
        const thisRoundCounter = computeCounter({ listedPrice, minPrice, round: currentRound });

        // ── Accept #1: buyer at or above listed price ───────────────────────
        if (buyerOffer >= listedPrice) {
            const finalPrice = listedPrice;
            const updated = await prisma.negotiation.upsert({
                where: { userId_productId: { userId, productId } },
                update: { listedPrice, minPrice, currentOffer: buyerOffer, round: currentRound, status: "ACCEPTED", finalPrice },
                create: { userId, productId, listedPrice, minPrice, currentOffer: buyerOffer, round: currentRound, status: "ACCEPTED", finalPrice },
            });
            const reply = await generateReply({
                scenario: { decision: "accept_listed", buyerOffer, finalPrice, listedPrice }
            });
            return NextResponse.json({ reply, status: "ACCEPTED", finalPrice: updated.finalPrice, round: updated.round, maxRounds: MAX_ROUNDS });
        }

        // ── Accept #2: buyer met AI's counter for this round ────────────────
        if (buyerOffer >= thisRoundCounter) {
            const finalPrice = buyerOffer;
            const updated = await prisma.negotiation.upsert({
                where: { userId_productId: { userId, productId } },
                update: { currentOffer: buyerOffer, round: currentRound, status: "ACCEPTED", finalPrice },
                create: { userId, productId, listedPrice, minPrice, currentOffer: buyerOffer, round: currentRound, status: "ACCEPTED", finalPrice },
            });
            const reply = await generateReply({
                scenario: { decision: "accept", buyerOffer, finalPrice, listedPrice }
            });
            return NextResponse.json({ reply, status: "ACCEPTED", finalPrice: updated.finalPrice, round: updated.round, maxRounds: MAX_ROUNDS });
        }

        // ── Accept #3: buyer at floor on FINAL round only ───────────────────
        // minPrice is seller's last resort — only unlocked at round 4.
        // Prevents buyer from claiming the floor cheaply in early rounds.
        if (buyerOffer >= minPrice && currentRound === MAX_ROUNDS) {
            const finalPrice = buyerOffer;
            const updated = await prisma.negotiation.upsert({
                where: { userId_productId: { userId, productId } },
                update: { currentOffer: buyerOffer, round: currentRound, status: "ACCEPTED", finalPrice },
                create: { userId, productId, listedPrice, minPrice, currentOffer: buyerOffer, round: currentRound, status: "ACCEPTED", finalPrice },
            });
            const reply = await generateReply({
                scenario: { decision: "accept", buyerOffer, finalPrice, listedPrice }
            });
            return NextResponse.json({ reply, status: "ACCEPTED", finalPrice: updated.finalPrice, round: updated.round, maxRounds: MAX_ROUNDS });
        }

        // ── Reject: rounds exhausted ────────────────────────────────────────
        if (currentRound > MAX_ROUNDS) {
            const lastCounter = computeCounter({ listedPrice, minPrice, round: MAX_ROUNDS });
            await prisma.negotiation.upsert({
                where: { userId_productId: { userId, productId } },
                update: { currentOffer: buyerOffer, round: MAX_ROUNDS, status: "REJECTED", finalPrice: null },
                create: { userId, productId, listedPrice, minPrice, currentOffer: buyerOffer, round: MAX_ROUNDS, status: "REJECTED", finalPrice: null },
            });
            const reply = await generateReply({
                scenario: { decision: "final_reject", buyerOffer, counterOffer: lastCounter, listedPrice }
            });
            return NextResponse.json({ reply, status: "REJECTED", finalPrice: null, round: MAX_ROUNDS, maxRounds: MAX_ROUNDS, lastCounter });
        }

        // ── Counter: buyer below threshold, rounds remain ───────────────────
        const isFinalCounter = currentRound >= MAX_ROUNDS;
        const decision = isFinalCounter ? "hold" : "counter";

        const updated = await prisma.negotiation.upsert({
            where: { userId_productId: { userId, productId } },
            update: { currentOffer: buyerOffer, round: currentRound, status: "ONGOING", finalPrice: null },
            create: { userId, productId, listedPrice, minPrice, currentOffer: buyerOffer, round: currentRound, status: "ONGOING", finalPrice: null },
        });

        const reply = await generateReply({
            scenario: { decision, buyerOffer, counterOffer: thisRoundCounter, listedPrice, round: currentRound, maxRounds: MAX_ROUNDS }
        });

        return NextResponse.json({
            reply,
            status: "ONGOING",
            counterOffer: thisRoundCounter,
            round: updated.round,
            maxRounds: MAX_ROUNDS,
            isFinalCounter
        });

    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message ?? "internal error" }, { status: 500 });
    }
}

export async function GET(request) {
    try {
        const { userId } = getAuth(request);
        if (!userId) {
            return NextResponse.json({ error: "not authorized" }, { status: 401 });
        }
        const { searchParams } = new URL(request.url);
        const productId = searchParams.get("productId");

        if (productId) {
            const negotiation = await prisma.negotiation.findUnique({
                where: { userId_productId: { userId, productId } }
            });
            return NextResponse.json({ negotiation, maxRounds: MAX_ROUNDS });
        }

        const negotiations = await prisma.negotiation.findMany({
            where: { userId, status: "ACCEPTED" }
        });
        return NextResponse.json({ negotiations });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message ?? "internal error" }, { status: 500 });
    }
}