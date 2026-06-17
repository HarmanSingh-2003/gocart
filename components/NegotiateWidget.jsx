'use client'
import { useState, useRef, useEffect } from "react"
import { useAuth } from "@clerk/nextjs"
import axios from "axios"
import { Handshake, X, Send } from "lucide-react"
import toast from "react-hot-toast"

export default function NegotiateWidget({ product, onDealAccepted }) {

    const currency = process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || '₹'
    const { getToken } = useAuth()

    const [isOpen, setIsOpen] = useState(false)
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const [status, setStatus] = useState('ONGOING') // ONGOING | ACCEPTED | REJECTED
    const [round, setRound] = useState(0)
    const [maxRounds, setMaxRounds] = useState(4)
    const [finalPrice, setFinalPrice] = useState(null)
    const [messages, setMessages] = useState([
        { role: 'assistant', content: `Hey! Want to negotiate the price of "${product.name}"? Make me an offer 🤝` }
    ])

    const messagesEndRef = useRef(null)

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    if (!product.minPrice) return null // bargaining disabled for this product

    const sendOffer = async () => {
        const offerValue = parseFloat(input)
        if (!input.trim() || isNaN(offerValue) || offerValue <= 0 || loading) return
        if (status !== 'ONGOING') return

        const userMessage = { role: 'user', content: `${currency}${offerValue}` }
        setMessages(prev => [...prev, userMessage])
        setInput('')
        setLoading(true)

        try {
            const token = await getToken()
            const { data } = await axios.post('/api/negotiate', {
                productId: product.id,
                offer: offerValue
            }, { headers: { Authorization: `Bearer ${token}` } })

            setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
            setStatus(data.status)
            setRound(data.round)
            if (data.maxRounds) setMaxRounds(data.maxRounds)

            if (data.status === 'ACCEPTED') {
                setFinalPrice(data.finalPrice)
                toast.success(`Deal locked at ${currency}${data.finalPrice}!`)
                onDealAccepted?.(data.finalPrice)
            }
        } catch (error) {
            setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' }])
        }
        setLoading(false)
    }

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            sendOffer()
        }
    }

    return (
        <div className="mt-4">
            {!isOpen ? (
                <button
                    onClick={() => setIsOpen(true)}
                    className="flex items-center gap-2 text-sm border border-green-200 bg-green-50 text-green-700 px-4 py-2 rounded-lg hover:bg-green-100 transition w-fit"
                >
                    <Handshake size={16} />
                    Bargain with AI
                </button>
            ) : (
                <div className="w-full max-w-sm bg-white rounded-xl shadow-lg border border-slate-200 flex flex-col overflow-hidden" style={{ height: '380px' }}>

                    <div className="flex items-center justify-between px-4 py-2.5 bg-green-600 text-white">
                        <div className="flex items-center gap-2 text-sm font-medium">
                            <Handshake size={16} />
                            Bargain with AI
                        </div>
                        <button onClick={() => setIsOpen(false)}>
                            <X size={16} />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5">
                        {messages.map((msg, index) => (
                            <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[80%] px-3.5 py-2 rounded-2xl text-sm leading-5 ${
                                    msg.role === 'user'
                                        ? 'bg-green-600 text-white rounded-br-sm'
                                        : 'bg-slate-100 text-slate-700 rounded-bl-sm'
                                }`}>
                                    {msg.content}
                                </div>
                            </div>
                        ))}
                        {loading && (
                            <div className="flex justify-start">
                                <div className="bg-slate-100 px-3.5 py-2 rounded-2xl rounded-bl-sm text-sm text-slate-400">
                                    Thinking...
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {status === 'ACCEPTED' ? (
                        <div className="p-3 border-t border-slate-200 text-sm text-center text-green-700 bg-green-50">
                            Deal closed at {currency}{finalPrice}! This price will apply when you add to cart and checkout.
                        </div>
                    ) : status === 'REJECTED' ? (
                        <div className="p-3 border-t border-slate-200 text-sm text-center text-slate-500">
                            Negotiation ended. You can buy at the listed price, or try again later.
                        </div>
                    ) : (
                        <div className="p-2.5 border-t border-slate-200 flex items-center gap-2">
                            <input
                                type="number"
                                className="flex-1 text-sm bg-slate-100 rounded-full px-4 py-2 outline-none placeholder-slate-400"
                                placeholder={`Your offer in ${currency}...`}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                            />
                            <button
                                onClick={sendOffer}
                                disabled={loading}
                                className="bg-green-600 hover:bg-green-700 transition text-white p-2.5 rounded-full disabled:opacity-50"
                            >
                                <Send size={14} />
                            </button>
                        </div>
                    )}
                    {status === 'ONGOING' && (
                        <p className="text-[11px] text-slate-400 text-center pb-1.5">Round {round}/{maxRounds}</p>
                    )}
                </div>
            )}
        </div>
    )
}
