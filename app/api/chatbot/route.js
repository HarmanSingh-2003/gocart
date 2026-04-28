import { openai } from "@/configs/openai";
import { NextResponse } from "next/server";

export async function POST(request) {
    try {
        const { messages, products } = await request.json();

        const productList = products.map(p => ({
            id: p.id,
            name: p.name,
            description: p.description,
            category: p.category,
            price: p.price,
        }));

        const response = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL,
            messages: [
                {
                    role: "system",
                    content: `You are a friendly shopping assistant for GoCart, an online store. Help users find products and answer their shopping questions. Keep responses concise and helpful.
                    
Here are the available products in the store:
${JSON.stringify(productList, null, 2)}

When recommending products, mention their name and price. If nothing matches, say so honestly.`
                },
                ...messages
            ]
        });

        const reply = response.choices[0].message.content;
        return NextResponse.json({ reply });

    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
}