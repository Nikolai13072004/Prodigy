async function main() {
  const { chromium } = await import("playwright");
  const [, , input, output] = process.argv;
  if (!input || !output) {
    console.error("Usage: node scripts/html_to_pdf.js <input.html> <output.pdf>");
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`file://${input}`, { waitUntil: "networkidle" });
    await page.pdf({
      path: output,
      format: "A4",
      printBackground: true,
      margin: {
        top: "18mm",
        right: "16mm",
        bottom: "18mm",
        left: "16mm",
      },
    });
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
