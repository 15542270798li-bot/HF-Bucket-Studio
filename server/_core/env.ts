export const ENV = {
  databaseUrl: process.env.DATABASE_URL ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  accessPassword: process.env.ACCESS_PASSWORD ?? process.env.CF_ACCESS_PASSWORD ?? "",
  accessCookieSecret: process.env.ACCESS_COOKIE_SECRET ?? process.env.JWT_SECRET ?? "",
};
