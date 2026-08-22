interface PreservedLine {
  content: string;
  eol: string;
}

const REMARK_LINE = /^[\t ]*remark[\t ]*:[\t ]*(.*)$/i;

function splitLines(input: string): PreservedLine[] {
  if (!input) return [];
  const lines: PreservedLine[] = [];
  const pattern = /([^\r\n]*)(\r\n|\n|\r|$)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(input))) {
    if (!match[0]) break;
    lines.push({ content: match[1], eol: match[2] });
    if (!match[2]) break;
  }
  return lines;
}

function preferredEOL(lines: PreservedLine[]): string {
  return lines.find(line => line.eol)?.eol || "\n";
}

export function readRemark(extra: string): string {
  for (const line of splitLines(extra || "")) {
    const match = line.content.match(REMARK_LINE);
    if (match) return match[1].trim();
  }
  return "";
}

export function writeRemark(extra: string, nextValue: string): string {
  const lines = splitLines(extra || "");
  const value = nextValue.trim();
  const hadTrailingEOL = /(?:\r\n|\n|\r)$/.test(extra || "");
  const firstRemarkIndex = lines.findIndex(line => REMARK_LINE.test(line.content));

  if (value && firstRemarkIndex >= 0) {
    lines[firstRemarkIndex].content = `remark: ${value}`;
  }

  const filtered = lines.filter((line, index) => {
    if (!REMARK_LINE.test(line.content)) return true;
    return Boolean(value) && index === firstRemarkIndex;
  });

  if (!hadTrailingEOL && filtered.length && filtered.at(-1)?.eol) {
    filtered[filtered.length - 1].eol = "";
  }

  if (!value) {
    return filtered.map(line => line.content + line.eol).join("");
  }

  if (firstRemarkIndex >= 0) {
    return filtered.map(line => line.content + line.eol).join("");
  }

  if (!lines.length) return `remark: ${value}`;
  const eol = preferredEOL(lines);
  const current = lines.map(line => line.content + line.eol).join("");
  return current + (hadTrailingEOL ? "" : eol) + `remark: ${value}`;
}
