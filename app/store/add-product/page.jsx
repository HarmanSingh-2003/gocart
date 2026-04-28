'use client'
import { assets } from "@/assets/assets"
import { useAuth } from "@clerk/nextjs"
import axios from "axios"
import Image from "next/image"
import { useState } from "react"
import { toast } from "react-hot-toast"
import { Sparkles } from "lucide-react"

export default function StoreAddProduct() {

    const categories = ['Electronics', 'Clothing', 'Home & Kitchen', 'Beauty & Health', 'Toys & Games', 'Sports & Outdoors', 'Books & Media', 'Food & Drink', 'Hobbies & Crafts', 'Others']

    const [images, setImages] = useState({ 1: null, 2: null, 3: null, 4: null })
    const [productInfo, setProductInfo] = useState({
        name: "",
        description: "",
        mrp: "",
        price: "",
        category: "",
    })
    const [loading, setLoading] = useState(false)
    const [aiUsed, setAiUsed] = useState(false)
    const [pricingSuggestion, setPricingSuggestion] = useState(null)
    const [pricingLoading, setPricingLoading] = useState(false)

    const { getToken } = useAuth()

    const onChangeHandler = (e) => {
        setProductInfo({ ...productInfo, [e.target.name]: e.target.value })
        // clear suggestion when seller edits fields
        setPricingSuggestion(null)
    }

    const handleCategoryChange = (e) => {
        setProductInfo({ ...productInfo, category: e.target.value })
        setPricingSuggestion(null)
    }

    const handleGetPriceSuggestion = async () => {
        if (!productInfo.name || !productInfo.category) {
            return toast.error('Please enter product name and select a category first')
        }

        setPricingLoading(true)
        setPricingSuggestion(null)

        try {
            const token = await getToken()
            const { data } = await axios.post('/api/store/pricing-suggest', {
                name: productInfo.name,
                description: productInfo.description,
                category: productInfo.category,
            }, {
                headers: { Authorization: `Bearer ${token}` }
            })

            if (data.suggestion) {
                setPricingSuggestion(data.suggestion)
            } else {
                toast.error('Could not get suggestion, try again')
            }
        } catch (error) {
            toast.error('AI suggestion failed')
        }
        setPricingLoading(false)
    }

    const applyPricingSuggestion = () => {
        if (pricingSuggestion) {
            setProductInfo(prev => ({ ...prev, price: pricingSuggestion.suggested }))
            toast.success('Suggested price applied!')
        }
    }

    const handleImageUpload = async (key, file) => {
        setImages(prev => ({ ...prev, [key]: file }))

        if (key === "1" && file && !aiUsed) {
            const reader = new FileReader()
            reader.readAsDataURL(file)
            reader.onloadend = async () => {
                const base64String = reader.result.split(",")[1]
                const mimeType = file.type
                const token = await getToken()

                try {
                    await toast.promise(
                        axios.post('/api/store/ai', { base64Image: base64String, mimeType }, { headers: { Authorization: `Bearer ${token}` } }),
                        {
                            loading: "Analyzing image with AI...",
                            success: (res) => {
                                const data = res.data
                                if (data.name && data.description) {
                                    setProductInfo(prev => ({
                                        ...prev,
                                        name: data.name,
                                        description: data.description
                                    }))
                                    setAiUsed(true)
                                    return "AI filled product info 🎉"
                                }
                                return "AI could not analyze the image"
                            },
                            error: (err) => err?.response?.data?.error || err.message
                        }
                    )
                } catch (error) {
                    console.error(error)
                }
            }
        }
    }

    const onSubmitHandler = async (e) => {
        e.preventDefault()
        try {
            if (!images[1] && !images[2] && !images[3] && !images[4]) {
                return toast.error('Please upload atleast one image')
            }
            setLoading(true)

            const formData = new FormData()
            formData.append('name', productInfo.name)
            formData.append('description', productInfo.description)
            formData.append('mrp', productInfo.mrp)
            formData.append('price', productInfo.price)
            formData.append('category', productInfo.category)

            Object.keys(images).forEach((key) => {
                images[key] && formData.append('images', images[key])
            })

            const token = await getToken()
            const { data } = await axios.post('/api/store/product', formData, { headers: { Authorization: `Bearer ${token}` } })
            toast.success(data.message)

            setProductInfo({ name: "", description: "", mrp: 0, price: 0, category: "" })
            setImages({ 1: null, 2: null, 3: null, 4: null })
            setPricingSuggestion(null)
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <form onSubmit={e => toast.promise(onSubmitHandler(e), { loading: "Adding Product..." })} className="text-slate-500 mb-28">
            <h1 className="text-2xl">Add New <span className="text-slate-800 font-medium">Products</span></h1>
            <p className="mt-7">Product Images</p>

            <div className="flex gap-3 mt-4">
                {Object.keys(images).map((key) => (
                    <label key={key} htmlFor={`images${key}`}>
                        <Image width={300} height={300} className='h-15 w-auto border border-slate-200 rounded cursor-pointer' src={images[key] ? URL.createObjectURL(images[key]) : assets.upload_area} alt="" />
                        <input type="file" accept='image/*' id={`images${key}`} onChange={e => handleImageUpload(key, e.target.files[0])} hidden />
                    </label>
                ))}
            </div>

            <label className="flex flex-col gap-2 my-6">
                Name
                <input type="text" name="name" onChange={onChangeHandler} value={productInfo.name} placeholder="Enter product name" className="w-full max-w-sm p-2 px-4 outline-none border border-slate-200 rounded" required />
            </label>

            <label className="flex flex-col gap-2 my-6">
                Description
                <textarea name="description" onChange={onChangeHandler} value={productInfo.description} placeholder="Enter product description" rows={5} className="w-full max-w-sm p-2 px-4 outline-none border border-slate-200 rounded resize-none" required />
            </label>

            <div className="flex flex-col gap-4">
                <div className="flex gap-5">
                    <label className="flex flex-col gap-2">
                        Actual Price (₹)
                        <input type="number" name="mrp" onChange={onChangeHandler} value={productInfo.mrp} placeholder="0" className="w-full max-w-45 p-2 px-4 outline-none border border-slate-200 rounded" required />
                    </label>
                    <label className="flex flex-col gap-2">
                        Offer Price (₹)
                        <input type="number" name="price" onChange={onChangeHandler} value={productInfo.price} placeholder="0" className="w-full max-w-45 p-2 px-4 outline-none border border-slate-200 rounded" required />
                    </label>
                </div>

                {/* AI Pricing Button */}
                <button
                    type="button"
                    onClick={handleGetPriceSuggestion}
                    disabled={pricingLoading}
                    className="flex items-center gap-2 text-sm bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded-lg hover:bg-green-100 transition w-fit disabled:opacity-50"
                >
                    <Sparkles size={15} />
                    {pricingLoading ? 'Analyzing market prices...' : 'Get AI Price Suggestion'}
                </button>

                {/* AI Pricing Result */}
                {pricingSuggestion && !pricingLoading && (
                    <div className="max-w-sm bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
                        <div className="flex items-center gap-2 text-green-700 font-medium mb-1">
                            <Sparkles size={14} />
                            AI Pricing Suggestion
                        </div>
                        <p className="text-slate-600">Market price range: <strong>₹{pricingSuggestion.min} - ₹{pricingSuggestion.max}</strong></p>
                        <p className="text-slate-600">Recommended price: <strong>₹{pricingSuggestion.suggested}</strong></p>
                        <p className="text-slate-500 text-xs mt-1">{pricingSuggestion.reason}</p>
                        <button
                            type="button"
                            onClick={applyPricingSuggestion}
                            className="mt-2 text-xs bg-green-600 text-white px-3 py-1 rounded-full hover:bg-green-700 transition"
                        >
                            Apply Suggested Price
                        </button>
                    </div>
                )}
            </div>

            <select onChange={handleCategoryChange} value={productInfo.category} className="w-full max-w-sm p-2 px-4 my-6 outline-none border border-slate-200 rounded" required>
                <option value="">Select a category</option>
                {categories.map((category) => (
                    <option key={category} value={category}>{category}</option>
                ))}
            </select>

            <button disabled={loading} className="bg-slate-800 text-white px-6 mt-7 py-2 hover:bg-slate-900 rounded transition">Add Product</button>
        </form>
    )
}