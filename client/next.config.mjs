import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Linting is its own step (`pnpm lint`, and a job in client.yml) with
  // --max-warnings 0. Leaving it on here would run the same rules a second time
  // and, because eslint.config.mjs wraps them in tseslint.config(), Next fails
  // to detect its own plugin and warns about it every build.
  eslint: { ignoreDuringBuilds: true },
  env: {
    NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001",
  },
};

export default withNextIntl(nextConfig);
