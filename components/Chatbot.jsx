'use client'
import { useState, useRef, useEffect } from "react"
import { useSelector } from "react-redux"
import axios from "axios"
import { MessageCircle, X, Send, Sparkles } from "lucide-react"

export default function Chatbot() {

    const [isOpen, setIsOpen] = useState(false)
    const [input, setInput] = useState('')
    const [messages, setMessages] = useState([
        { role: 'assistant', content: 'Hi! I\'m your GoCart shopping assistant 🛒 Ask me anything like "suggest something under ₹500" or "what\'s good for music lovers?"' }
    ])
    const [loading, setLoading] = useState(false)

    const products = useSelector(state => state.product.list)
    const messagesEndRef = useRef(null)

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    const sendMessage = async () => {
        if (!input.trim() || loading) return

        const userMessage = { role: 'user', content: input }
        const updatedMessages = [...messages, userMessage]
        setMessages(updatedMessages)
        setInput('')
        setLoading(true)

        try {
            const { data } = await axios.post('/api/chatbot', {
                messages: updatedMessages,
                products,
            })
            setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
        } catch {
            setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' }])
        }
        setLoading(false)
    }

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            sendMessage()
        }
    }

    return (
        <div className="fixed bottom-6 right-6 z-50">

            {/* Chat Window */}
            {isOpen && (
                <div className="mb-4 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden" style={{ height: '480px' }}>

                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 bg-green-600 text-white">
                        <div className="flex items-center gap-2">
                            <Sparkles size={18} />
                            <span className="font-medium">GoCart Assistant</span>
                        </div>
                        <button onClick={() => setIsOpen(false)}>
                            <X size={18} />
                        </button>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
                        {messages.map((msg, index) => (
                            <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-6 ${
                                    msg.role === 'user'
                                        ? 'bg-green-600 text-white rounded-br-sm'
                                        : 'bg-slate-100 text-slate-700 rounded-bl-sm'
                                }`}>
                                    <span dangerouslySetInnerHTML={{ __html: msg.content
                                        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                        .replace(/^\* /gm, '• ')
                                        .replace(/\n/g, '<br/>')
                                    }} />
                                </div>
                            </div>
                        ))}
                        {loading && (
                            <div className="flex justify-start">
                                <div className="bg-slate-100 px-4 py-2.5 rounded-2xl rounded-bl-sm text-sm text-slate-400">
                                    Thinking...
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <div className="p-3 border-t border-slate-200 flex items-center gap-2">
                        <input
                            className="flex-1 text-sm bg-slate-100 rounded-full px-4 py-2.5 outline-none placeholder-slate-400"
                            placeholder="Ask me anything..."
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                        />
                        <button
                            onClick={sendMessage}
                            disabled={loading}
                            className="bg-green-600 hover:bg-green-700 transition text-white p-2.5 rounded-full disabled:opacity-50"
                        >
                            <Send size={16} />
                        </button>
                    </div>
                </div>
            )}

            {/* Toggle Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="ml-auto flex items-center justify-center w-14 h-14 bg-green-600 hover:bg-green-700 transition text-white rounded-full shadow-lg"
            >
                {isOpen ? <X size={22} /> : <MessageCircle size={22} />}
            </button>
        </div>
    )
}