export {};

declare global {
  interface Window {
    // Naver Maps JS SDK has no official TS types; typed loosely here.
    naver: any;
  }
}
