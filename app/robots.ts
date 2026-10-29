import type { MetadataRoute } from "next";

const SITE = "https://creditoatumedida.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/crm", "/login", "/api/"],
      },
    ],
    sitemap: [`${SITE}/sitemap.xml`, `${SITE}/blog/sitemap.xml`],
  };
}
