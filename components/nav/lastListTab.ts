/** Remembers whether Invoices or Quotations was open last, so "back" returns there. */
const KEY = "last-list-tab";

export type ListTab = "/invoices" | "/quotations";

export function rememberListTab(tab: ListTab) {
  try {
    sessionStorage.setItem(KEY, tab);
  } catch {}
}

export function lastListTab(): ListTab {
  try {
    return sessionStorage.getItem(KEY) === "/quotations" ? "/quotations" : "/invoices";
  } catch {
    return "/invoices";
  }
}
