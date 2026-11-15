export type Child = Node | string | null | false | undefined;
type Attributes = Record<string, string | boolean | ((event: Event) => void)>;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Attributes = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (typeof value === "function") element.addEventListener(key.replace(/^on/, ""), value);
    else if (value === true) element.setAttribute(key, "");
    else if (value !== false) element.setAttribute(key, value);
  }
  for (const child of children) {
    if (child) element.append(child);
  }
  return element;
}

export function button(label: string, onclick: () => void, kind: "primary" | "plain" | "quiet" = "plain") {
  return el("button", { type: "button", class: `qq-button qq-${kind}`, onclick }, label);
}

export function message(text: string | null, kind: "error" | "note" = "error") {
  return text ? el("p", { class: `qq-message qq-${kind}`, role: kind === "error" ? "alert" : "status" }, text) : null;
}
