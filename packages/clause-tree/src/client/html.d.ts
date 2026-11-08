/** esbuild 以文本载入 .html（页面骨架）。 */
declare module '*.html' {
  const text: string;
  export default text;
}
