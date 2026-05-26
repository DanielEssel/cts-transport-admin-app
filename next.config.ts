import type { NextConfig } from 'next'
const nextConfig: NextConfig = {
  images: { domains: ['firebasestorage.googleapis.com'] },
  // No output: standalone - use default server rendering
  serverExternalPackages: ['firebase']
}
export default nextConfig
