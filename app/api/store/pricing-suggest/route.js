import { openai } from "@/configs/openai";
import { NextResponse } from "next/server";
import authSeller from "@/middlewares/authSeller";
import { getAuth } from "@clerk/nextjs/server";

export async function POST(request) {
    try {
        const { userId } = getAuth(request)
        const isSeller = await authSeller(userId)

        if (!isSeller) {
            return NextResponse.json({ error: 'not authorized' }, { status: 401 })
        }

        const { name, description, category } = await request.json()

        if (!name || !category) {
            return NextResponse.json({ suggestion: null })
        }

        const response = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL,
            messages: [
                {
                    role: "system",
                    content: `You are an expert e-commerce pricing analyst with deep knowledge of market prices across platforms like Amazon India and Flipkart. A seller wants to list a new product and needs pricing guidance. Based on your knowledge of real Indian market prices, suggest a competitive price. Always respond with prices in Indian Rupees (INR) only. Never use USD or dollars. Respond ONLY with raw JSON, no markdown, no explanation. Use this schema: { "min": number, "max": number, "suggested": number, "reason": string }`
                },
                {
                    role: "user",
                    content: `Product Name: ${name}
                    Category: ${category}
                    Description: ${description || 'Not provided'}

                    Based on your knowledge of current market prices on platforms like Amazon India and Flipkart, what is a competitive price range and recommended selling price for this product in Indian Rupees (INR)? Consider typical discounts and competitive pricing strategies.`
                }
            ]
        })

        const raw = response.choices[0].message.content
        const cleaned = raw.replace(/```json|```/g, "").trim()

        let parsed
        try {
            parsed = JSON.parse(cleaned)
        } catch {
            return NextResponse.json({ suggestion: null })
        }

        return NextResponse.json({ suggestion: parsed })

    } catch (error) {
        console.error(error)
        return NextResponse.json({ suggestion: null }, { status: 400 })
    }
}