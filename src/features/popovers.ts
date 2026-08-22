import { tr } from "../i18n";
import { createPanel } from "./render";

export interface StatusChoice {
  tag: string;
  color: string;
  selected: boolean;
}

export function centeredPopupX(
  anchorX: number,
  anchorWidth: number,
  popupWidth: number,
  screenX: number,
  screenWidth: number,
  margin = 8
): number {
  const minimum = screenX + margin;
  const maximum = Math.max(minimum, screenX + screenWidth - popupWidth - margin);
  const centered = anchorX + (anchorWidth - popupWidth) / 2;
  return Math.min(maximum, Math.max(minimum, centered));
}

function openCenteredPanel(panel: any, anchor: HTMLElement): void {
  panel.addEventListener("popupshown", () => {
    const window = anchor.ownerDocument.defaultView as any;
    const anchorRect = anchor.getBoundingClientRect();
    const popupRect = panel.getBoundingClientRect();
    const screenRect = window?.windowUtils?.toScreenRectInCSSUnits?.(
      anchorRect.left,
      anchorRect.top,
      anchorRect.width,
      anchorRect.height
    );
    if (!screenRect || typeof panel.moveTo !== "function" || !Number.isFinite(panel.screenY)) return;
    const screenLeft = Number(window.screen?.availLeft ?? window.screen?.left ?? 0);
    const screenWidth = Number(window.screen?.availWidth ?? window.screen?.width ?? 0);
    const targetX = centeredPopupX(
      screenRect.x,
      screenRect.width,
      popupRect.width,
      screenLeft,
      screenWidth
    );
    panel.moveTo(Math.round(targetX), panel.screenY);
  }, { once: true });
  panel.openPopup(anchor, "after_start", 0, 2, false, false);
}

export function openStatusPopover(
  anchor: HTMLElement,
  choices: StatusChoice[],
  onSelect: (tag: string | null) => Promise<void>
): void {
  const doc = anchor.ownerDocument;
  const panel = createPanel(doc, "focus-columns-status-panel");
  const menu = doc.createElement("div");
  menu.className = "focus-columns-option-list";
  menu.setAttribute("role", "menu");

  const addOption = (label: string, color: string | null, selected: boolean, value: string | null) => {
    const button = doc.createElement("button");
    button.type = "button";
    button.className = "focus-columns-option";
    button.setAttribute("role", "menuitemradio");
    button.setAttribute("aria-checked", String(selected));
    if (color) {
      const swatch = doc.createElement("span");
      swatch.className = "focus-columns-swatch";
      swatch.style.backgroundColor = color;
      button.appendChild(swatch);
    }
    const text = doc.createElement("span");
    text.textContent = label;
    button.appendChild(text);
    button.addEventListener("click", event => {
      event.stopPropagation();
      panel.hidePopup();
      void onSelect(value);
    });
    menu.appendChild(button);
  };

  for (const choice of choices) {
    addOption(choice.tag.replace(/^\/\s*/, ""), choice.color, choice.selected, choice.tag);
  }
  if (choices.length) {
    const divider = doc.createElement("div");
    divider.className = "focus-columns-divider";
    divider.setAttribute("role", "separator");
    menu.appendChild(divider);
  }
  addOption(tr("clearStatus"), null, !choices.some(choice => choice.selected), null);
  panel.appendChild(menu);
  openCenteredPanel(panel, anchor);
}

export function openRemarkPopover(
  anchor: HTMLElement,
  initialValue: string,
  onSave: (value: string) => Promise<void>
): void {
  const doc = anchor.ownerDocument;
  const panel = createPanel(doc, "focus-columns-remark-panel");
  const form = doc.createElement("form");
  form.className = "focus-columns-remark-form";
  const input = doc.createElement("input");
  input.type = "text";
  input.value = initialValue;
  input.className = "focus-columns-remark-input";
  input.setAttribute("aria-label", tr("editRemark"));
  const actions = doc.createElement("div");
  actions.className = "focus-columns-actions";
  const cancel = doc.createElement("button");
  cancel.type = "button";
  cancel.textContent = tr("cancel");
  const save = doc.createElement("button");
  save.type = "submit";
  save.className = "focus-columns-primary-button";
  save.textContent = tr("save");
  actions.append(cancel, save);
  form.append(input, actions);
  panel.appendChild(form);

  cancel.addEventListener("click", () => panel.hidePopup());
  input.addEventListener("keydown", event => {
    if (event.key === "Escape") panel.hidePopup();
  });
  form.addEventListener("submit", event => {
    event.preventDefault();
    panel.hidePopup();
    void onSave(input.value);
  });
  panel.addEventListener("popupshown", () => {
    input.focus();
    input.select();
  }, { once: true });
  openCenteredPanel(panel, anchor);
}
