/** Tell TypeScript that .md imports are strings (esbuild loader: 'text') */
declare module '*.md' {
  const content: string;
  export default content;
}
