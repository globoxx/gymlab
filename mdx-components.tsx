import Image, { ImageProps } from "next/image";
import type { MDXComponents } from "mdx/types";
import Ide from "./components/Ide";

const components = {
  // Allows customizing built-in components, e.g. to add styling.
  h1: ({ children }) => (
    <h1 style={{ fontSize: "2em", marginBottom: "16px" }}>{children}</h1>
  ),
  ul: ({ children }) => (
    <ul
      style={{
        listStyleType: "circle",
        paddingLeft: "20px",
        marginBottom: "16px",
      }}
    >
      {children}
    </ul>
  ),
  li: ({ children }) => <li style={{ marginBottom: "8px" }}>{children}</li>,
  code: ({ children }) => (
    <code
      style={{
        backgroundColor: "#f4f4f4",
        padding: "4px",
        borderRadius: "4px",
      }}
    >
      {children}
    </code>
  ),
  img: (props) => (
    // eslint-disable-next-line jsx-a11y/alt-text
    <Image
      sizes="100vw"
      style={{ width: "100%", height: "auto" }}
      {...(props as ImageProps)}
    />
  ),
  Ide: Ide,
} satisfies MDXComponents;

export function useMDXComponents(): MDXComponents {
  return components;
}
