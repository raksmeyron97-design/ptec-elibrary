// Test helpers for the journal article page's server components.
//
// React's client renderer (what Testing Library uses) cannot render an async
// Server Component, and most of the article header is one. `resolveServerTree`
// walks an element tree, awaits every async function component with its
// props — including elements passed as props, e.g. ArticleScholarship's
// `books` — and returns a tree of plain elements and client components that
// `render()` accepts. Client components are left alone (calling them outside
// React would break their hooks).
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";

function isAsyncComponent(type: unknown): type is (props: object) => Promise<ReactNode> {
  return typeof type === "function" && type.constructor.name === "AsyncFunction";
}

async function resolveValue(value: unknown): Promise<unknown> {
  if (Array.isArray(value)) return Promise.all(value.map(resolveValue));
  if (isValidElement(value)) return resolveServerTree(value);
  return value;
}

export async function resolveServerTree(node: ReactNode): Promise<ReactNode> {
  if (Array.isArray(node)) return (await Promise.all(node.map((n) => resolveServerTree(n)))) as ReactNode;
  if (!isValidElement(node)) return node;
  const element = node as ReactElement<Record<string, unknown>>;
  if (isAsyncComponent(element.type)) {
    return resolveServerTree(await element.type(element.props));
  }
  const entries = await Promise.all(
    Object.entries(element.props).map(async ([key, value]) => [key, await resolveValue(value)] as const),
  );
  const props = Object.fromEntries(entries);
  const { children, ...rest } = props as { children?: ReactNode };
  return children === undefined ? cloneElement(element, rest) : cloneElement(element, rest, children);
}
