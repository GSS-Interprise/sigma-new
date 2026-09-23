import { assertEquals } from "jsr:@std/assert@1";
import { parseRetryAfterMs } from "./chakra.ts";

Deno.test("uses Retry-After header in seconds for Chakra throttling", () => {
  const headers = new Headers({ "retry-after": "30" });

  assertEquals(
    parseRetryAfterMs(headers, {}, 1_000),
    30_000,
  );
});

Deno.test("uses payload retry_after_ms when the header is absent", () => {
  assertEquals(
    parseRetryAfterMs(new Headers(), { retry_after_ms: 12_500 }, 1_000),
    12_500,
  );
});
