const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Browser instance (singleton)
let browser;

// Initialize browser
async function initBrowser() {
    if (!browser) {
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--single-process',
                '--disable-gpu'
            ]
        });
    }
    return browser;
}

// Main API endpoint to get rendered content
app.get('/render', async (req, res) => {
    const { url, waitFor = 'networkidle2', timeout = 30000, selector } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'URL parameter is required' });
    }

    let page;
    try {
        // Initialize browser if not already done
        const browser = await initBrowser();
        
        // Create new page
        page = await browser.newPage();
        
        // Set viewport
        await page.setViewport({ width: 1920, height: 1080 });
        
        // Set timeout
        await page.setDefaultTimeout(timeout);

        // Navigate to URL
        await page.goto(url, { 
            waitUntil: waitFor,
            timeout: timeout
        });

        // Wait for specific selector if provided
        if (selector) {
            await page.waitForSelector(selector, { timeout: timeout });
        }

        // Get the fully rendered content
        const content = await page.content();
        
        // Get page title
        const title = await page.title();
        
        // Get meta description
        const description = await page.evaluate(() => {
            const meta = document.querySelector('meta[name="description"]');
            return meta ? meta.getAttribute('content') : null;
        });

        res.json({
            success: true,
            url: url,
            title: title,
            description: description,
            content: content,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error rendering page:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            url: url
        });
    } finally {
        // Close page
        if (page) {
            await page.close();
        }
    }
});

// API endpoint to get specific elements
app.get('/render/elements', async (req, res) => {
    const { url, selector, waitFor = 'networkidle2', timeout = 30000 } = req.query;

    if (!url || !selector) {
        return res.status(400).json({ 
            error: 'URL and selector parameters are required' 
        });
    }

    let page;
    try {
        const browser = await initBrowser();
        page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setDefaultTimeout(timeout);

        await page.goto(url, { 
            waitUntil: waitFor,
            timeout: timeout
        });

        // Wait for the specific selector
        await page.waitForSelector(selector, { timeout: timeout });

        // Extract elements matching the selector
        const elements = await page.evaluate((sel) => {
            const nodes = document.querySelectorAll(sel);
            return Array.from(nodes).map(node => ({
                html: node.outerHTML,
                text: node.textContent?.trim(),
                tagName: node.tagName,
                className: node.className,
                id: node.id
            }));
        }, selector);

        res.json({
            success: true,
            url: url,
            selector: selector,
            elements: elements,
            count: elements.length,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error extracting elements:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            url: url
        });
    } finally {
        if (page) {
            await page.close();
        }
    }
});

// API endpoint to get rendered text content
app.get('/render/text', async (req, res) => {
    const { url, selector, waitFor = 'networkidle2', timeout = 30000 } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'URL parameter is required' });
    }

    let page;
    try {
        const browser = await initBrowser();
        page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setDefaultTimeout(timeout);

        await page.goto(url, { 
            waitUntil: waitFor,
            timeout: timeout
        });

        let textContent;
        if (selector) {
            await page.waitForSelector(selector, { timeout: timeout });
            textContent = await page.evaluate((sel) => {
                const element = document.querySelector(sel);
                return element ? element.textContent?.trim() : null;
            }, selector);
        } else {
            textContent = await page.evaluate(() => {
                return document.body.textContent?.trim();
            });
        }

        res.json({
            success: true,
            url: url,
            text: textContent,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error extracting text:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            url: url
        });
    } finally {
        if (page) {
            await page.close();
        }
    }
});

// Health check endpoint
app.get('/health', async (req, res) => {
    try {
        const browser = await initBrowser();
        res.json({ 
            status: 'healthy', 
            browser: 'connected',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ 
            status: 'unhealthy', 
            error: error.message 
        });
    }
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down gracefully...');
    if (browser) {
        await browser.close();
    }
    process.exit(0);
});

// Start server
app.listen(PORT, () => {
    console.log(`Puppeteer API server running on port ${PORT}`);
    console.log(`Endpoints:`);
    console.log(`  GET /render?url=<url>`);
    console.log(`  GET /render/elements?url=<url>&selector=<css-selector>`);
    console.log(`  GET /render/text?url=<url>`);
    console.log(`  GET /health`);
});

// Initialize browser on startup
initBrowser().then(() => {
    console.log('Browser initialized');
}).catch(err => {
    console.error('Failed to initialize browser:', err);
});