import prisma from "@/lib/prisma";
import { getAuth } from "@clerk/nextjs/server";
import { PaymentMethod } from "@prisma/client";
import { NextResponse } from "next/server";
import Stripe from "stripe";

export async function POST(request) {
    try {
        const { userId, has } = getAuth(request)
        if (!userId) {
            return NextResponse.json({ error: "not authorized" }, { status: 401 });
        }
        const { addressId, items, couponCode, paymentMethod } = await request.json()

        // Check if all required fields are present
        if (!addressId || !paymentMethod || !items || !Array.isArray(items) || items.length === 0) {
            return NextResponse.json({ error: "missing order details" }, { status: 400 });
        }
        let coupon = null;
        if (couponCode) {
            coupon = await prisma.coupon.findFirst({
                where: {
                    code: couponCode,
                    expiresAt: { gt: new Date() }
                }
            })

            if (!coupon) {
                return NextResponse.json({ error: "Coupon not found" }, { status: 400 })
            }
        }

        // Check if coupon is applicable for new users
        if (couponCode && coupon.forNewUser) {
            const userorders = await prisma.order.findMany({ where: { userId } })
            if (userorders.length > 0) {
                return NextResponse.json({ error: "Coupon valid for new users" }, { status: 400 })
            }
        }

        const hasPlusPlan = has({ plan: 'plus' })
        // Check if coupon is applicable for members
        if (couponCode && coupon.forMember) {
            if (!hasPlusPlan) {
                return NextResponse.json({ error: "Coupon valid for members only" }, { status: 400 })
            }
        }
        // Group orders by storeId using a Map
        const orderbyStore = new Map()

        // Fetch accepted negotiations for this user, for the items being ordered
        const acceptedNegotiations = await prisma.negotiation.findMany({
            where: {
                userId,
                status: "ACCEPTED",
                productId: { in: items.map(item => item.id) }
            }
        })
        const negotiatedPriceMap = new Map(
            acceptedNegotiations.map(n => [n.productId, n.finalPrice])
        )

        for (const item of items) {
            const product = await prisma.product.findUnique({ where: { id: item.id } })
            const storeId = product.storeId
            const effectivePrice = negotiatedPriceMap.has(item.id)
                ? negotiatedPriceMap.get(item.id)
                : product.price
            if (!orderbyStore.has(storeId)) {
                orderbyStore.set(storeId, [])
            }
            orderbyStore.get(storeId).push({ ...item, price: effectivePrice })
        }

        let orderIds = [];
        let fullAmount = 0;

        let isShippingFeeAdded = false

        // Create orders for each seller
        for (const [storeId, sellerItems] of orderbyStore.entries()) {
            let total = sellerItems.reduce((acc, item) => acc + (item.price * item.quantity), 0)

            if (couponCode) {
                total -= (total * coupon.discount) / 100;
            }
            if (!hasPlusPlan && !isShippingFeeAdded) {
                total += 5;
                isShippingFeeAdded = true
            }

            fullAmount += parseFloat(total.toFixed(2))

            const order = await prisma.order.create({
                data: {
                    userId,
                    storeId,
                    addressId,
                    total: parseFloat(total.toFixed(2)),
                    paymentMethod,
                    isCouponUsed: coupon ? true : false,
                    coupon: coupon ? coupon : {},
                    orderItems: {
                        create: sellerItems.map(item => ({
                            productId: item.id,
                            quantity: item.quantity,
                            price: item.price
                        }))
                    }
                }
            })
            orderIds.push(order.id)
        }

        // Mark used negotiations as consumed so they can't be reapplied to future orders
        if (acceptedNegotiations.length > 0) {
            await prisma.negotiation.updateMany({
                where: {
                    userId,
                    productId: { in: acceptedNegotiations.map(n => n.productId) },
                    status: "ACCEPTED"
                },
                data: { status: "REJECTED" } // consumed; REJECTED reused as "no longer active"
            })
        }

        if(paymentMethod==='STRIPE'){
            const stripe=new Stripe(process.env.STRIPE_SECRET_KEY)
            const origin= await request.headers.get('origin')

            const session= await stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                line_items: [{
                    price_data:{
                        currency: 'usd',
                        product_data:{
                            name: 'Order'
                        },
                        unit_amount: Math.round(fullAmount*100)
                    },
                    quantity: 1
                }],
                expires_at: Math.floor(Date.now()/1000) + 30 * 60, // current time + 30 min
                mode: 'payment',
                success_url: `${origin}/loading?nextUrl=orders`,
                cancel_url: `${origin}/cart`,
                metadata: {
                    orderIds: orderIds.join(','),
                    userId,
                    appId: 'gocart'
                }
            })
            return NextResponse.json({session})

        }

        // Clear the cart
        await prisma.user.update({
            where: { id: userId },
            data: { cart: {} }
        })

        return NextResponse.json({ message: 'Orders Placed Successfully' })

    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.code || error.message }, { status: 400 })
    }
}

// Get all orders for a user
export async function GET(request) {
    try {
        const { userId } = getAuth(request)
        const orders = await prisma.order.findMany({
            where: {
                userId, OR: [
                    { paymentMethod: PaymentMethod.COD },
                    { AND: [{ paymentMethod: PaymentMethod.STRIPE }, { isPaid: true }] }
                ]
            },
            include: {
                orderItems: { include: { product: true } },
                address: true
            },
            orderBy: { createdAt: 'desc' }
        })
        return NextResponse.json({ orders })
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message }, { status: 400 })
    }
}