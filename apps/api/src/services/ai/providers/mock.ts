import { setTimeout as delay } from 'node:timers/promises';
import type { AiChunk, AiInput, AiProvider } from './types.js';

export class MockProvider implements AiProvider {
  readonly name = 'mock';
  readonly configured = false;
  readonly mode = 'demo' as const;
  constructor(readonly explanation = 'AI not configured — demo response') {}
  async *stream(input: AiInput, signal: AbortSignal): AsyncIterable<AiChunk> {
    const question = input.messages[input.messages.length - 1]?.content.toLowerCase() ?? '';
    let content = `**${this.explanation}**\n\nThis is a deterministic demonstration, not a response from a language model. `;
    if (input.context && Array.isArray(input.context.summary)) {
      const summary = input.context.summary as Array<{ label?: unknown; value?: unknown }>;
      content +=
        'Your attached calculation was recomputed by the network engine. Its key values are:\n\n';
      content += summary
        .slice(0, 10)
        .map(
          (field) =>
            `- ${String(field.label ?? 'Result')}: \`${String(field.value ?? '').replace(/`/g, '')}\``,
        )
        .join('\n');
      content +=
        '\n\nUse **Show your work** in the calculator for the deterministic steps and selected allocation policy.';
    } else if (/ipv6|\/64|128-bit/.test(question)) {
      content +=
        'IPv6 has 128 bits. A `/64` prefix leaves 64 address bits, so the subnet contains exactly `2^64 = 18,446,744,073,709,551,616` addresses. IPv6 has no broadcast address and does not use the IPv4 convention of subtracting two.\n\nOpen the IPv6 calculator to explore a prefix and attach the result here.';
    } else if (/vlsm|department|allocate/.test(question)) {
      content +=
        'For VLSM, record each segment’s host requirement, select its allocation policy, account for growth, and allocate appropriately aligned blocks while preserving reservations. Conventional IPv4 LAN capacity for a block larger than `/31` is `2^(32-prefix) - 2`. Point-to-point `/31` links use two endpoints.\n\nOpen the VLSM planner, enter your actual parent network and requirements, then attach the result.';
    } else if (/dns|domain/.test(question)) {
      content +=
        'DNS associates names with records. `A` holds IPv4 addresses, `AAAA` holds IPv6 addresses, `MX` identifies mail exchangers, and `PTR` supports reverse lookup. A lookup includes a source, retrieval time, and TTL. The answer may change when a cache expires.\n\nThe DNS toolkit can make a live lookup when its configured resolver is reachable.';
    } else {
      content +=
        'A prefix describes the number of network bits. For IPv4, `/24` leaves 8 address bits and contains `2^8 = 256` addresses. A conventional LAN offers 254 usable host addresses; cloud reservations and point-to-point policies use different rules.\n\nTry `192.168.10.40/24` in the IPv4 calculator, open **Show your work**, and attach the result for an explanation.';
    }
    content +=
      '\n\nFor live assistance, configure the OpenAI provider in the API environment and sign in. Anthropic and Gemini adapters are explicitly unimplemented in this release.';
    const chunks = content.match(/[\s\S]{1,72}/g) ?? [];
    for (const chunk of chunks) {
      signal.throwIfAborted();
      await delay(8, undefined, { signal });
      yield { type: 'delta', content: chunk };
    }
    yield { type: 'usage', inputTokens: 0, outputTokens: 0 };
  }
}
