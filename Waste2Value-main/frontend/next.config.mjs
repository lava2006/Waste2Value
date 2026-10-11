// `npm run build:static` sets NEXT_OUTPUT=export to produce the S3/CloudFront bundle.
// Local development and `next start` keep the normal (non-export) build.
const isExport = process.env.NEXT_OUTPUT === "export";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  ...(isExport ? { output: "export", trailingSlash: true, images: { unoptimized: true } } : {}),
};

export default nextConfig;
