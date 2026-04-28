import { openai } from "@/configs/openai";
import { NextResponse } from "next/server";

export async function POST(request) {
    try {
        const { query, products } = await request.json();

        if (!query || !products?.length) {
            return NextResponse.json({ ids: [] });
        }

        // Send query + product list to Gemini
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
                    content: `You are a smart product search assistant for an e-commerce store. 
You will receive a search query and a list of products.
Return ONLY a raw JSON array of product IDs that are relevant to the query.
No explanation, no markdown, no code blocks. Just a plain JSON array like: ["id1", "id2"]
If nothing matches, return an empty array: []`
                },
                {
                    role: "user",
                    content: `Search query: "${query}"
                    
Products:
${JSON.stringify(productList, null, 2)}`
                }
            ]
        });

        const raw = response.choices[0].message.content;
        const cleaned = raw.replace(/```json|```/g, "").trim();

        let ids;
        try {
            ids = JSON.parse(cleaned);
        } catch {
            ids = [];
        }

        return NextResponse.json({ ids });

    } catch (error) {
        console.error(error);
        return NextResponse.json({ ids: [] }, { status: 400 });
    }
}