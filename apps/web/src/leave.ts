// Full page loads, kept in one place so page tests can stand in for them
// (jsdom cannot navigate).

/** Leave the app for another address, such as Supabase's sign-in page. */
export function leaveTo(url: string): void {
  window.location.assign(url);
}

/** Load a page of the app afresh, replacing this history entry: after a
 *  sign-in, so every part of the app starts again as the new account. */
export function reloadAt(path: string): void {
  window.location.replace(path);
}
