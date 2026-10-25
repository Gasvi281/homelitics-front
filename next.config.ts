import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    // El rol del agente del mock (lib/mock/index.ts), también para la mitad del
    // navegador. No es secreto: solo existe con USE_MOCKS=true.
    MOCK_AGENT_ROLE: process.env.MOCK_AGENT_ROLE ?? "",
  },
};

export default nextConfig;
