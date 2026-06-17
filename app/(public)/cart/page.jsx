'use client'
import Counter from "@/components/Counter";
import OrderSummary from "@/components/OrderSummary";
import PageTitle from "@/components/PageTitle";
import { deleteItemFromCart } from "@/lib/features/cart/cartSlice";
import { useAuth } from "@clerk/nextjs";
import axios from "axios";
import { Trash2Icon } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

export default function Cart() {

    const currency = process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || '$';

    const { cartItems } = useSelector(state => state.cart);
    const products = useSelector(state => state.product.list);
    const { getToken, isSignedIn } = useAuth();

    const dispatch = useDispatch();

    const [cartArray, setCartArray] = useState([]);
    const [totalPrice, setTotalPrice] = useState(0);
    const [negotiatedPrices, setNegotiatedPrices] = useState({}); // productId -> finalPrice

    const fetchNegotiatedPrices = async () => {
        if (!isSignedIn) return
        try {
            const token = await getToken();
            const { data } = await axios.get('/api/negotiate', { headers: { Authorization: `Bearer ${token}` } });
            const map = {};
            (data.negotiations || []).forEach(n => { map[n.productId] = n.finalPrice });
            setNegotiatedPrices(map);
        } catch (error) {
            // silently ignore - bargain prices are a bonus feature
        }
    }

    const createCartArray = () => {
        setTotalPrice(0);
        const cartArray = [];
        for (const [key, value] of Object.entries(cartItems)) {
            const product = products.find(product => product.id === key);
            if (product) {
                const effectivePrice = negotiatedPrices[key] ?? product.price;
                cartArray.push({
                    ...product,
                    price: effectivePrice,
                    originalPrice: product.price,
                    isNegotiated: negotiatedPrices[key] != null,
                    quantity: value,
                });
                setTotalPrice(prev => prev + effectivePrice * value);
            }
        }
        setCartArray(cartArray);
    }

    const handleDeleteItemFromCart = (productId) => {
        dispatch(deleteItemFromCart({ productId }))
    }

    useEffect(() => {
        fetchNegotiatedPrices();
    }, [isSignedIn]);

    useEffect(() => {
        if (products.length > 0) {
            createCartArray();
        }
    }, [cartItems, products, negotiatedPrices]);

    return cartArray.length > 0 ? (
        <div className="min-h-screen mx-6 text-slate-800">

            <div className="max-w-7xl mx-auto ">
                {/* Title */}
                <PageTitle heading="My Cart" text="items in your cart" linkText="Add more" />

                <div className="flex items-start justify-between gap-5 max-lg:flex-col">

                    <table className="w-full max-w-4xl text-slate-600 table-auto">
                        <thead>
                            <tr className="max-sm:text-sm">
                                <th className="text-left">Product</th>
                                <th>Quantity</th>
                                <th>Total Price</th>
                                <th className="max-md:hidden">Remove</th>
                            </tr>
                        </thead>
                        <tbody>
                            {
                                cartArray.map((item, index) => (
                                    <tr key={index} className="space-x-2">
                                        <td className="flex gap-3 my-4">
                                            <div className="flex gap-3 items-center justify-center bg-slate-100 size-18 rounded-md">
                                                <Image src={item.images[0]} className="h-14 w-auto" alt="" width={45} height={45} />
                                            </div>
                                            <div>
                                                <p className="max-sm:text-sm">{item.name}</p>
                                                <p className="text-xs text-slate-500">{item.category}</p>
                                                {item.isNegotiated ? (
                                                    <p className="flex items-center gap-2">
                                                        <span className="text-slate-400 line-through text-xs">{currency}{item.originalPrice}</span>
                                                        <span className="text-green-600 font-medium">{currency}{item.price}</span>
                                                        <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">Bargain price</span>
                                                    </p>
                                                ) : (
                                                    <p>{currency}{item.price}</p>
                                                )}
                                            </div>
                                        </td>
                                        <td className="text-center">
                                            <Counter productId={item.id} />
                                        </td>
                                        <td className="text-center">{currency}{(item.price * item.quantity).toLocaleString()}</td>
                                        <td className="text-center max-md:hidden">
                                            <button onClick={() => handleDeleteItemFromCart(item.id)} className=" text-red-500 hover:bg-red-50 p-2.5 rounded-full active:scale-95 transition-all">
                                                <Trash2Icon size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            }
                        </tbody>
                    </table>
                    <OrderSummary totalPrice={totalPrice} items={cartArray} />
                </div>
            </div>
        </div>
    ) : (
        <div className="min-h-[80vh] mx-6 flex items-center justify-center text-slate-400">
            <h1 className="text-2xl sm:text-4xl font-semibold">Your cart is empty</h1>
        </div>
    )
}