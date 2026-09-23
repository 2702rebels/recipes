import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

// Base path from the deploy workflow. Empty with the custom domain (recipes.2702rebels.com), /<repo> on github.io.
const basePath = process.env.PAGES_BASE_PATH ?? "";

/** @type {import('next').NextConfig} */
const config = {
  output: "export",
  basePath,
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default withMDX(config);
