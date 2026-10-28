// Images imported in code (`import logo from '@assets/icons/x.svg'`). Metro
// turns each into an asset reference, which `Image` from `@ui` accepts.
declare module '*.png' {
  const source: number;
  export default source;
}

declare module '*.svg' {
  const source: number;
  export default source;
}
