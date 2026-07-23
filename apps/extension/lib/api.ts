// API client da extensão — mesma lib @morubi/api-client do web, sem fetch cru.
import { createApiClient } from "@morubi/api-client";
import { CONFIG } from "./config";
import { getAccessToken } from "./supabase";

export const api = createApiClient({
  baseUrl: CONFIG.apiBaseUrl,
  getToken: getAccessToken,
});
