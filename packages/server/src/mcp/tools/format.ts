import type { FilterPipeline } from "../../filters/pipeline.js";

const EMAIL_LIKE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

interface EmailAddress {
  name: string;
  email: string;
}

export function formatAddress(
  addr: EmailAddress,
  pipeline: FilterPipeline,
): string {
  if (pipeline.emailRedactionEnabled) {
    const name = addr.name?.trim();
    if (!name || EMAIL_LIKE.test(name)) {
      return "[Name Unavailable]";
    }
    return name;
  }
  return `${addr.name} <${addr.email}>`;
}

export function formatAddresses(
  addrs: EmailAddress[],
  pipeline: FilterPipeline,
): string[] {
  return addrs.map((a) => formatAddress(a, pipeline));
}
