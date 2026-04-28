'use client'
import { Suspense, useEffect, useState } from "react"
import ProductCard from "@/components/ProductCard"
import { MoveLeftIcon, Search, Sparkles } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useSelector } from "react-redux"
import axios from "axios"

function ShopContent() {

    const searchParams = useSearchParams()
    const search = searchParams.get('search')
    const router = useRouter()

    const products = useSelector(state => state.product.list)

    const [filteredProducts, setFilteredProducts] = useState([])
    const [aiLoading, setAiLoading] = useState(false)
    const [isAiSearch, setIsAiSearch] = useState(false)

    useEffect(() => {
        if (!search) {
            setFilteredProducts(products)
            setIsAiSearch(false)
            return
        }

        // Basic filter first (instant)
        const basic = products.filter(product =>
            product.name.toLowerCase().includes(search.toLowerCase())
        )
        setFilteredProducts(basic)

        // Then run AI search on top
        const runAiSearch = async () => {
            setAiLoading(true)
            try {
                const { data } = await axios.post('/api/ai-search', {
                    query: search,
                    products,
                })

                if (data.ids?.length) {
                    const aiFiltered = products.filter(p => data.ids.includes(p.id))
                    setFilteredProducts(aiFiltered)
                    setIsAiSearch(true)
                } else {
                    setFilteredProducts(basic)
                    setIsAiSearch(false)
                }
            } catch {
                setFilteredProducts(basic)
                setIsAiSearch(false)
            }
            setAiLoading(false)
        }

        if (products.length > 0) runAiSearch()

    }, [search, products])

    return (
        <div className="min-h-[70vh] mx-6">
            <div className="max-w-7xl mx-auto">
                <div className="flex items-center justify-between my-6">
                    <h1 onClick={() => router.push('/shop')} className="text-2xl text-slate-500 flex items-center gap-2 cursor-pointer">
                        {search && <MoveLeftIcon size={20} />}
                        All <span className="text-slate-700 font-medium">Products</span>
                    </h1>

                    {/* AI Search badge */}
                    {search && (
                        <div className="flex items-center gap-2 text-sm">
                            {aiLoading ? (
                                <span className="flex items-center gap-1.5 text-slate-400">
                                    <Sparkles size={15} className="animate-pulse" />
                                    AI searching...
                                </span>
                            ) : isAiSearch ? (
                                <span className="flex items-center gap-1.5 text-green-600 bg-green-50 px-3 py-1 rounded-full">
                                    <Sparkles size={15} />
                                    AI Results
                                </span>
                            ) : null}
                        </div>
                    )}
                </div>

                {filteredProducts.length === 0 && !aiLoading ? (
                    <p className="text-slate-400 text-sm mt-10">No products found for "{search}"</p>
                ) : (
                    <div className="grid grid-cols-2 sm:flex flex-wrap gap-6 xl:gap-12 mx-auto mb-32">
                        {filteredProducts.map((product) => <ProductCard key={product.id} product={product} />)}
                    </div>
                )}
            </div>
        </div>
    )
}

export default function Shop() {
    return (
        <Suspense fallback={<div>Loading shop...</div>}>
            <ShopContent />
        </Suspense>
    )
}