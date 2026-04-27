import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { middleware } from "../middleware";

describe("mobile middleware CORS", () => {
  it("allows browser PATCH preflight requests before mobile route handlers run", async () => {
    const request = new NextRequest("https://backend.example.test/api/mobile/items/item-1", {
      method: "OPTIONS",
      headers: {
        origin: "https://mobile.example.test",
        "access-control-request-method": "PATCH",
      },
    });

    const response = await middleware(request);

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toContain("PATCH");
  });
});
