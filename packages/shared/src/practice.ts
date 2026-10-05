import type { QuizQuestion } from './index.js';

export type PracticeDifficulty = QuizQuestion['difficulty'];

function randomSequence(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function options(correct: string, distractors: string[], random: () => number) {
  const values = [...new Set([correct, ...distractors])].slice(0, 4);
  if (values.length !== 4) throw new Error('Generated options must contain four distinct answers.');
  for (let i = values.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [values[i], values[j]] = [values[j]!, values[i]!];
  }
  return { options: values, correctIndex: values.indexOf(correct) };
}

function dotted(value: number) {
  return [24, 16, 8, 0].map((shift) => Math.floor(value / 2 ** shift) % 256).join('.');
}

export function generatePracticeQuestion(
  seed: number,
  difficulty: PracticeDifficulty,
  index = 0,
): QuizQuestion {
  if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295)
    throw new Error('Practice seed must be an unsigned 32-bit integer.');
  if (!Number.isInteger(index) || index < 0 || index > 1000000)
    throw new Error('Practice question index is outside the supported range.');
  if (!['beginner', 'intermediate', 'advanced', 'exam'].includes(difficulty))
    throw new Error('Unknown practice difficulty.');
  const random = randomSequence((seed ^ Math.imul(index + 1, 2654435761)) >>> 0);
  const integer = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
  const kind = integer(0, difficulty === 'beginner' ? 2 : difficulty === 'intermediate' ? 4 : 7);
  const prefix = integer(difficulty === 'beginner' ? 24 : 17, 30);
  const size = 2 ** (32 - prefix);
  const address = 10 * 2 ** 24 + integer(0, 255) * 65536 + integer(0, 255) * 256 + integer(1, 254);
  const start = Math.floor(address / size) * size;
  const id = `generated:${difficulty}:${seed}:${index}`;
  let question: string;
  let topic: string;
  let correct: string;
  let distractors: string[];
  let explanation: string;
  if (kind === 0) {
    topic = 'subnetting';
    question = `How many conventional usable IPv4 host addresses are in a /${prefix} LAN subnet? No provider-specific reservations apply.`;
    correct = String(size - 2);
    distractors = [String(size), String(size - 1), String(size * 2 - 2)];
    explanation = `The prefix leaves ${32 - prefix} host bits. There are 2^${32 - prefix} = ${size} total addresses. For this conventional LAN, exclude the network and broadcast addresses: ${size} − 2 = ${size - 2}.`;
  } else if (kind === 1) {
    topic = 'binary';
    const value = integer(1, 254);
    question = `What is the eight-bit binary representation of decimal ${value}?`;
    correct = value.toString(2).padStart(8, '0');
    distractors = [
      (value ^ 1).toString(2).padStart(8, '0'),
      (value ^ 128).toString(2).padStart(8, '0'),
      (value ^ 16).toString(2).padStart(8, '0'),
    ];
    const weights = [128, 64, 32, 16, 8, 4, 2, 1].filter((weight) => (value & weight) !== 0);
    explanation = `An octet has weights 128, 64, 32, 16, 8, 4, 2, 1. Here ${weights.join(' + ')} = ${value}, so the corresponding bits are ${correct}. Leading zeros keep the representation eight bits wide.`;
  } else if (kind === 2) {
    topic = 'cidr';
    question = `Which dotted-decimal subnet mask corresponds to /${prefix}?`;
    correct = dotted(2 ** 32 - size);
    distractors = [dotted(2 ** 32 - size * 2), dotted(2 ** 32 - size / 2), dotted(size - 1)];
    explanation = `A /${prefix} mask contains ${prefix} leading ones followed by ${32 - prefix} zeros. Converting each group of eight bits to decimal gives ${correct}. The inverse is a wildcard, not the subnet mask.`;
  } else if (kind === 3) {
    topic = 'subnetting';
    question = `What is the network address of ${dotted(address)}/${prefix}?`;
    correct = dotted(start);
    distractors = [dotted(start + size - 1), dotted(start + 1), dotted(start + size)];
    explanation = `This subnet has ${size} addresses. Clear the ${32 - prefix} host bits, or round the integer address down to a multiple of ${size}. The resulting network is ${correct}/${prefix}; its broadcast is ${dotted(start + size - 1)}.`;
  } else if (kind === 4) {
    topic = 'subnetting';
    question = `What is the broadcast address of ${dotted(start)}/${prefix} under conventional IPv4 LAN rules?`;
    correct = dotted(start + size - 1);
    distractors = [dotted(start + size), dotted(start + size - 2), dotted(start)];
    explanation = `Set all ${32 - prefix} host bits to one. Equivalently, add ${size - 1} to ${dotted(start)}. The broadcast is ${correct}; the preceding address is the last conventional usable host.`;
  } else if (kind === 5) {
    topic = 'vlsm';
    const required = integer(7, 1000);
    const bits = Math.ceil(Math.log2(required + 2));
    const selected = 32 - bits;
    question = `A VLAN needs ${required} IPv4 host addresses, including its gateway. What is the smallest conventional LAN subnet that fits, with no growth allowance?`;
    correct = `/${selected}`;
    distractors = [`/${selected + 1}`, `/${selected - 1}`, `/${selected + 2}`];
    explanation = `Choose the fewest host bits h satisfying 2^h − 2 ≥ ${required}. With h = ${bits}, capacity is ${2 ** bits - 2}; one fewer host bit gives only ${2 ** (bits - 1) - 2}. Therefore the smallest fitting block is /${selected}.`;
  } else if (kind === 6) {
    topic = 'ipv6';
    const parent = [48, 52, 56, 60][integer(0, 3)]!;
    const child = parent + integer(1, Math.min(4, (64 - parent) / 4)) * 4;
    const count = 2 ** (child - parent);
    question = `How many /${child} IPv6 subnets fit exactly inside one /${parent} allocation?`;
    correct = count.toLocaleString('en-US');
    distractors = [
      (count * 2).toLocaleString('en-US'),
      (count / 2).toLocaleString('en-US'),
      String(child - parent),
    ];
    explanation = `The child prefix adds ${child - parent} subnet bits. Each bit doubles the number of children, so 2^(${child} − ${parent}) = ${correct}. This counts subnets, not usable endpoints, and IPv6 has no broadcast-address subtraction.`;
  } else {
    topic = 'summarization';
    const parent = integer(20, 28);
    const blockSize = 2 ** (32 - parent);
    const aggregate = Math.floor(address / blockSize) * blockSize;
    const left = `${dotted(aggregate)}/${parent + 1}`;
    const right = `${dotted(aggregate + blockSize / 2)}/${parent + 1}`;
    question = `Which single CIDR exactly summarizes the adjacent networks ${left} and ${right}, without adding address space?`;
    correct = `${dotted(aggregate)}/${parent}`;
    distractors = [
      `${dotted(aggregate)}/${parent + 1}`,
      `${dotted(Math.floor(aggregate / (blockSize * 2)) * blockSize * 2)}/${parent - 1}`,
      `${dotted(aggregate + blockSize / 2)}/${parent + 1}`,
    ];
    explanation = `The two equal-sized children are adjacent and aligned to a /${parent} boundary. They differ only in the final child-prefix bit. Removing that bit combines them into ${correct} with exactly ${blockSize} addresses.`;
  }
  return { id, topic, difficulty, question, ...options(correct, distractors, random), explanation };
}

export function fromGeneratedId(id: string): QuizQuestion | null {
  const match =
    /^generated:(beginner|intermediate|advanced|exam):(0|[1-9]\d{0,9}):(0|[1-9]\d{0,6})$/.exec(id);
  if (!match || match[0] !== id) return null;
  try {
    return generatePracticeQuestion(
      Number(match[2]),
      match[1] as PracticeDifficulty,
      Number(match[3]),
    );
  } catch {
    return null;
  }
}
