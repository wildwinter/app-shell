// ---------------------------------------------------------------------------
// `el`: the tiny tag-typed element factory both apps build their imperative,
// idempotent views with.
//
// A SUPERSET of the two apps' prior signatures, so neither rewrites call sites:
//   - Patterpad:       el(tag, cls?, text?)                       (positional)
//   - Storylet Studio: el(tag, { className, text, ... }, ...kids) (options bag)
// A string second argument is the className; an object is the props bag; string
// children become text nodes. So `el("div", "c", "t")` and
// `el("div", { className: "c" }, "t")` produce identical DOM.
// ---------------------------------------------------------------------------

export type Child = Node | string | null | undefined;

export interface ElProps {
  className?: string;
  text?: string;
  title?: string;
  onClick?: (event: MouseEvent) => void;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  classNameOrProps?: string | ElProps,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  const props: ElProps = typeof classNameOrProps === "string"
    ? { className: classNameOrProps }
    : classNameOrProps ?? {};
  if (props.className) node.className = props.className;
  if (props.text !== undefined && props.text !== null) node.textContent = props.text;
  if (props.title !== undefined) node.title = props.title;
  if (props.onClick) node.addEventListener("click", props.onClick as EventListener);
  for (const child of children) {
    if (child === null || child === undefined) continue;
    node.append(child);
  }
  return node;
}
