import type { NextConfig } from "next";
import path from "path";

// El proyecto vive en una unidad de red mapeada (Y:). Turbopack (bundler
// por defecto en Next 16) tiene un bug de resolución de rutas UNC vs
// letra de unidad en este tipo de unidad de red que ningún config de
// `turbopack.root` logra evitar (confirmado probando varias variantes).
// Se fuerza webpack como bundler de dev — ver script "dev" en package.json
// (`next dev --webpack`) — que sí maneja unidades de red correctamente.
const BLOG_HUB = "https://blog.bunkerank.com/s/n35lrwj1jv35394";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.resolve(__dirname),
  // Blog servido por Bunker Rank (hub multi-cliente) en creditoatumedida.com/blog.
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/blog", destination: `${BLOG_HUB}/blog` },
        { source: "/blog/", destination: `${BLOG_HUB}/blog` },
        { source: "/blog/:path*", destination: `${BLOG_HUB}/blog/:path*` },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  webpack: (config) => {
    config.resolve.symlinks = false;
    return config;
  },
};

export default nextConfig;
