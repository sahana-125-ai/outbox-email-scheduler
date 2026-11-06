/** @type {import('next').NextConfig} */
const nextConfig = {
  // API traffic is proxied at runtime by app/api/[...path]/route.ts using the
  // server-only BACKEND_URL, so no build-time API URL is required.
  poweredByHeader: false
};

export default nextConfig;
