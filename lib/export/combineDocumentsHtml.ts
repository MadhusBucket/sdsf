/**
 * Joins several documents made by `buildInvoiceHtml` into one printable page.
 * The template is used exactly as it is: its <style> is taken once and each
 * document's <body> content is placed one after another, each starting on a new page.
 */
export function combineDocumentsHtml(pages: string[], title: string): string {
  if (pages.length === 0) {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${title}</title></head>
<body style="font-family:system-ui,sans-serif;padding:40px;color:#444">No documents match these choices.</body></html>`;
  }

  const style = pages[0].match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
  const bodies = pages.map((html) => html.match(/<body>([\s\S]*?)<\/body>/)?.[1] ?? "");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>${style}
.export-doc + .export-doc { break-before: page; page-break-before: always; }
</style>
</head>
<body>
${bodies.map((b) => `<section class="export-doc">${b}</section>`).join("\n")}
</body>
</html>`;
}
