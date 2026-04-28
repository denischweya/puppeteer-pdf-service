const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
app.use(express.json({ limit: '50mb' }));

let browser = null;
let browserLaunchPromise = null;

// Browser launch options
const BROWSER_OPTIONS = {
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-zygote',
    // Use SwiftShader for GPU rendering (software-based).
    // This enables proper rendering of CSS effects like clip-path,
    // gradients, box-shadow, and transforms without requiring hardware GPU.
    '--use-gl=swiftshader',
    '--use-angle=swiftshader',
    // Force color profile for consistent rendering across environments
    '--force-color-profile=srgb',
    // Disable font subpixel antialiasing for consistent rendering
    '--disable-font-subpixel-positioning',
  ],
};

// Initialize or get browser instance with auto-recovery
async function getBrowser() {
  // If browser exists and is connected, return it
  if (browser && browser.isConnected()) {
    return browser;
  }

  // If already launching, wait for it
  if (browserLaunchPromise) {
    return browserLaunchPromise;
  }

  // Launch new browser
  console.log('Launching browser...');
  browserLaunchPromise = puppeteer.launch(BROWSER_OPTIONS);

  try {
    browser = await browserLaunchPromise;
    console.log('Browser initialized');

    // Handle browser disconnect - auto restart on next request
    browser.on('disconnected', () => {
      console.log('Browser disconnected, will restart on next request');
      browser = null;
      browserLaunchPromise = null;
    });

    return browser;
  } catch (error) {
    browserLaunchPromise = null;
    throw error;
  } finally {
    browserLaunchPromise = null;
  }
}

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const b = await getBrowser();
    res.json({ status: 'ok', browser: b.isConnected() });
  } catch (error) {
    res.status(500).json({ status: 'error', error: error.message });
  }
});

// Generate PDF from URL
app.post('/pdf/url', async (req, res) => {
  let page = null;
  try {
    const { url, options = {} } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const b = await getBrowser();
    page = await b.newPage();
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

    const pdf = await page.pdf({
      format: options.format || 'A4',
      printBackground: options.printBackground !== false,
      margin: options.margin || { top: '1cm', right: '1cm', bottom: '1cm', left: '1cm' },
    });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Length': pdf.length,
    });
    res.send(pdf);
  } catch (error) {
    console.error('PDF generation error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    if (page) {
      try { await page.close(); } catch (e) { /* ignore */ }
    }
  }
});

// Generate PDF from HTML content
app.post('/pdf/html', async (req, res) => {
  let page = null;
  try {
    const { html, options = {} } = req.body;

    if (!html) {
      return res.status(400).json({ error: 'HTML content is required' });
    }

    const b = await getBrowser();
    page = await b.newPage();

    // Set viewport to match PDF page dimensions for high-fidelity rendering.
    // Default to US Letter (8.5x11in) at 96dpi = 816x1056px.
    // Use deviceScaleFactor: 2 for crisp text and images.
    const viewportWidth = options.viewportWidth || 816;
    const viewportHeight = options.viewportHeight || 1056;
    await page.setViewport({
      width: viewportWidth,
      height: viewportHeight,
      deviceScaleFactor: options.deviceScaleFactor || 2,
    });

    // Emulate 'screen' media to match browser preview rendering.
    // This ensures CSS renders identically to how it looks in the browser,
    // rather than applying @media print rules.
    await page.emulateMediaType('screen');

    // Use 'load' to wait for all resources (images, stylesheets) to load.
    // 'domcontentloaded' is too early and may miss images/fonts.
    const waitUntil = options.waitUntil || 'load';
    await page.setContent(html, { waitUntil, timeout: 30000 });

    // Wait for all fonts to load before rendering PDF
    await page.evaluateHandle('document.fonts.ready');

    // Wait for all images to fully load/decode (important for data URI images)
    await page.evaluate(() => Promise.all(
      Array.from(document.images).map(img =>
        img.complete ? Promise.resolve() : new Promise(resolve => {
          img.onload = img.onerror = resolve;
        })
      )
    ));

    // Allow layout to stabilize after fonts/images load.
    // Two animation frames ensure flexbox/grid layouts have settled.
    await page.evaluate(() => new Promise(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(resolve))
    ));

    // Build PDF options - pass through all Puppeteer-supported options
    const pdfOptions = {
      printBackground: options.printBackground !== false,
      preferCSSPageSize: options.preferCSSPageSize !== false, // Default true to honor @page CSS
      displayHeaderFooter: options.displayHeaderFooter || false,
      scale: options.scale || 1,
    };

    // Support width/height (from WordPress plugin) or format
    if (options.width && options.height) {
      pdfOptions.width = options.width;
      pdfOptions.height = options.height;
    } else if (!pdfOptions.preferCSSPageSize) {
      // Only set format if not using CSS page size
      pdfOptions.format = options.format || 'Letter';
    }

    // Landscape orientation
    if (options.landscape !== undefined) {
      pdfOptions.landscape = options.landscape;
    }

    // Margins - default to zero for pixel-perfect output
    pdfOptions.margin = options.margin || { top: 0, right: 0, bottom: 0, left: 0 };

    const pdf = await page.pdf(pdfOptions);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Length': pdf.length,
    });
    res.send(pdf);
  } catch (error) {
    console.error('PDF generation error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    if (page) {
      try { await page.close(); } catch (e) { /* ignore */ }
    }
  }
});

// Take screenshot from URL
app.post('/screenshot/url', async (req, res) => {
  let page = null;
  try {
    const { url, options = {} } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const b = await getBrowser();
    page = await b.newPage();

    if (options.viewport) {
      await page.setViewport(options.viewport);
    }

    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

    const screenshot = await page.screenshot({
      type: options.type || 'png',
      fullPage: options.fullPage || false,
      quality: options.type === 'jpeg' ? (options.quality || 80) : undefined,
    });

    const contentType = options.type === 'jpeg' ? 'image/jpeg' : 'image/png';
    res.set({
      'Content-Type': contentType,
      'Content-Length': screenshot.length,
    });
    res.send(screenshot);
  } catch (error) {
    console.error('Screenshot error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    if (page) {
      try { await page.close(); } catch (e) { /* ignore */ }
    }
  }
});

// Take screenshot from HTML content
app.post('/screenshot/html', async (req, res) => {
  let page = null;
  try {
    const { html, options = {} } = req.body;

    if (!html) {
      return res.status(400).json({ error: 'HTML content is required' });
    }

    const b = await getBrowser();
    page = await b.newPage();

    if (options.viewport) {
      await page.setViewport(options.viewport);
    }

    await page.setContent(html, { waitUntil: 'networkidle0' });

    const screenshot = await page.screenshot({
      type: options.type || 'png',
      fullPage: options.fullPage || false,
      quality: options.type === 'jpeg' ? (options.quality || 80) : undefined,
    });

    const contentType = options.type === 'jpeg' ? 'image/jpeg' : 'image/png';
    res.set({
      'Content-Type': contentType,
      'Content-Length': screenshot.length,
    });
    res.send(screenshot);
  } catch (error) {
    console.error('Screenshot error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    if (page) {
      try { await page.close(); } catch (e) { /* ignore */ }
    }
  }
});

// Scrape content from URL
app.post('/scrape', async (req, res) => {
  let page = null;
  try {
    const { url, selector, waitFor } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const b = await getBrowser();
    page = await b.newPage();
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

    if (waitFor) {
      await page.waitForSelector(waitFor, { timeout: 10000 });
    }

    let content;
    if (selector) {
      content = await page.$eval(selector, el => el.innerHTML);
    } else {
      content = await page.content();
    }

    res.json({ content });
  } catch (error) {
    console.error('Scrape error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    if (page) {
      try { await page.close(); } catch (e) { /* ignore */ }
    }
  }
});

const PORT = process.env.PORT || 3000;

// Start server (browser launches lazily on first request)
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Puppeteer microservice running on port ${PORT}`);
  console.log('Browser will launch on first request');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  if (browser) {
    await browser.close();
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Shutting down...');
  if (browser) {
    await browser.close();
  }
  process.exit(0);
});
