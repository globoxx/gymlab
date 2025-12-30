import remarkGfm from 'remark-gfm'
import createMDX from '@next/mdx'

/** @type {import('next').NextConfig} */
const nextConfig = {
	// Recognize MDX pages in the App Router
	pageExtensions: ['js', 'jsx', 'md', 'mdx', 'ts', 'tsx'],
	reactStrictMode: false,
}

const withMDX = createMDX({
	options: {
		remarkPlugins: [remarkGfm],
		rehypePlugins: [],
	},
})

export default withMDX(nextConfig)
