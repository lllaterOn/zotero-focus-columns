import type { Badge } from "../types";

function alphaColor(color: string, alpha: string): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? `${color}${alpha}` : color;
}

export function createCell(doc: Document, column: any): HTMLSpanElement {
  const cell = doc.createElement("span");
  cell.className = `cell ${column.className} focus-columns-cell`;
  return cell;
}

export function renderBadges(
  doc: Document,
  column: any,
  badges: Badge[]
): HTMLSpanElement {
  const cell = createCell(doc, column);
  for (const badge of badges) {
    const element = doc.createElement("span");
    element.className = "focus-columns-badge";
    element.textContent = badge.text;
    element.title = badge.title || badge.text;
    const needsTint = badge.foreground === badge.background;
    element.style.backgroundColor = needsTint ? alphaColor(badge.background, "24") : badge.background;
    element.style.color = badge.foreground === "auto" ? "inherit" : badge.foreground;
    cell.appendChild(element);
  }
  return cell;
}

export function renderText(doc: Document, column: any, text: string): HTMLSpanElement {
  const cell = createCell(doc, column);
  cell.textContent = text;
  cell.title = text;
  return cell;
}

export function renderStatus(
  doc: Document,
  column: any,
  status: { tag: string; color: string } | null
): HTMLSpanElement {
  const cell = createCell(doc, column);
  if (!status) return cell;
  const pill = doc.createElement("span");
  pill.className = "focus-columns-status-pill";
  pill.style.backgroundColor = alphaColor(status.color, "24");
  pill.style.color = status.color;
  const swatch = doc.createElement("span");
  swatch.className = "focus-columns-swatch";
  swatch.style.backgroundColor = status.color;
  const label = doc.createElement("span");
  label.textContent = status.tag.replace(/^\/\s*/, "");
  pill.append(swatch, label);
  cell.appendChild(pill);
  return cell;
}

export function createPanel(doc: Document, className: string): any {
  const panel = (doc as any).createXULElement("panel");
  panel.className = `focus-columns-panel ${className}`;
  panel.setAttribute("type", "arrow");
  panel.setAttribute("noautofocus", "true");
  panel.addEventListener("popuphidden", () => panel.remove(), { once: true });
  doc.documentElement.appendChild(panel);
  return panel;
}
