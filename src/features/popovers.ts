import { tr } from "../i18n";
import { createPanel } from "./render";

export interface StatusChoice {
  tag: string;
  color: string;
  selected: boolean;
}

function openCenteredPanel(panel: any, anchor: HTMLElement): void {
  // Let Gecko measure, center and constrain the popup before its first paint.
  panel.openPopup(anchor, "bottomcenter topcenter", 0, 2, false, false);
}

export interface HashTagChoice {
  tag: string;
  color: string;
}

export function openHashTagPopover(
  anchor: HTMLElement,
  loadChoices: () => Promise<HashTagChoice[]>,
  selected: string | null | "mixed",
  onSelect: (tag: string | null) => Promise<void>
): void {
  const doc = anchor.ownerDocument;
  const panel = createPanel(doc, "focus-columns-hash-tags-panel");
  const form = doc.createElement("div");
  form.className = "focus-columns-hash-tags-form";
  const search = doc.createElement("input");
  search.type = "search";
  search.className = "focus-columns-hash-tags-search";
  search.placeholder = tr("searchHashTags");
  search.setAttribute("aria-label", tr("searchHashTags"));
  const summary = doc.createElement("div");
  summary.className = "focus-columns-picker-message";
  summary.textContent = selected === "mixed" ? tr("mixedHashTags") : "";
  summary.hidden = selected !== "mixed";
  const list = doc.createElement("div");
  list.className = "focus-columns-option-list focus-columns-hash-tags-list";
  list.setAttribute("role", "menu");
  list.setAttribute("aria-label", tr("hashTagsColumn"));
  const message = doc.createElement("div");
  message.className = "focus-columns-picker-message";
  message.setAttribute("role", "status");
  message.textContent = tr("loadingHashTags");
  const divider = doc.createElement("div");
  divider.className = "focus-columns-divider";
  const clear = doc.createElement("button");
  clear.type = "button";
  clear.className = "focus-columns-option";
  clear.textContent = tr("clearHashTags");
  // Keep clearing unavailable until the candidate list loads successfully.
  clear.disabled = true;
  const select = (value: string | null) => {
    panel.hidePopup();
    void onSelect(value);
  };
  clear.addEventListener("click", event => {
    event.stopPropagation();
    select(null);
  });
  form.append(search, summary, list, message, divider, clear);
  panel.appendChild(form);

  let closed = false;
  let loaded = false;
  let choices: HashTagChoice[] = [];
  panel.addEventListener("popuphidden", () => { closed = true; }, { once: true });
  const render = () => {
    list.replaceChildren();
    if (!loaded) return;
    const query = search.value.trim().replace(/^#/, "").toLocaleLowerCase();
    const matching = choices.filter(({ tag }) => tag.slice(1).toLocaleLowerCase().includes(query));
    for (const choice of matching) {
      const button = doc.createElement("button");
      button.type = "button";
      button.className = "focus-columns-option";
      button.setAttribute("role", "menuitemradio");
      button.setAttribute("aria-checked", String(choice.tag === selected));
      const swatch = doc.createElement("span");
      swatch.className = "focus-columns-swatch";
      swatch.style.backgroundColor = choice.color;
      const label = doc.createElement("span");
      label.textContent = choice.tag.slice(1);
      label.title = choice.tag;
      button.append(swatch, label);
      button.addEventListener("click", event => {
        event.stopPropagation();
        select(choice.tag);
      });
      list.appendChild(button);
    }
    message.hidden = matching.length > 0;
    message.textContent = choices.length ? tr("noMatchingHashTags") : tr("noHashTags");
  };
  search.addEventListener("input", render);
  form.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      event.preventDefault();
      panel.hidePopup();
    }
    else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const buttons = [...list.querySelectorAll<HTMLButtonElement>("button"), clear]
        .filter(button => !button.disabled);
      const index = buttons.indexOf(doc.activeElement as HTMLButtonElement);
      const next = event.key === "ArrowDown" ? index + 1 : (index < 0 ? buttons.length - 1 : index - 1);
      const target = buttons[(next + buttons.length) % buttons.length];
      target?.focus();
    }
  });
  panel.addEventListener("popupshown", () => search.focus(), { once: true });
  openCenteredPanel(panel, anchor);
  void loadChoices().then(result => {
    if (closed) return;
    choices = result;
    loaded = true;
    clear.disabled = false;
    render();
  }).catch(() => {
    if (!closed) message.textContent = tr("loadHashTagsFailed");
  });
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
