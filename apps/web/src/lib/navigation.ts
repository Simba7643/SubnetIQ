export function safeReturnTo(value: string | null | undefined) {
  if (
    !value ||
    !value.startsWith('/') ||
    value.includes('\\') ||
    Array.from(value).some((character) => {
      const code = character.charCodeAt(0);
      return code <= 32 || code === 127;
    })
  )
    return '/projects';
  try {
    const url = new URL(value, 'https://subnetiq.invalid');
    if (url.origin !== 'https://subnetiq.invalid' || /^\/(auth|login)(\/|$)/i.test(url.pathname))
      return '/projects';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '/projects';
  }
}
