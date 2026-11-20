import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // إخفاء شارة أدوات المطوّر العائمة (مثل "1 issue") — لا داعي لظهورها للمستخدم
  devIndicators: false,
};

export default nextConfig;
