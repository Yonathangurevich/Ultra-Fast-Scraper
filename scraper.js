const { chromium } = require('playwright');

// Browser pool for reuse
let browserInstance = null;

async function initBrowser() {
    if (!browserInstance) {
        browserInstance = await chromium.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process',
                '--window-size=1920,1080'
            ]
        });
    }
    return browserInstance;
}

async function fastScrape(url, options = {}) {
    const { browser, session } = options;
    const startTime = Date.now();
    
    let context = null;
    let page = null;
    
    try {
        // Create context with options
        const contextOptions = {
            viewport: { width: 1920, height: 1080 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            locale: 'en-US',
            timezoneId: 'America/New_York'
        };
        
        context = await browser.newContext(contextOptions);
        
        // Create page
        page = await context.newPage();
        
        // Enhanced stealth
        await page.addInitScript(() => {
            // Override webdriver
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
            
            // Mock chrome
            window.chrome = {
                runtime: {},
                loadTimes: function() {},
                csi: function() {},
                app: {}
            };
            
            // Mock plugins
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5]
            });
            
            // Mock languages
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en']
            });
        });
        
        // Set extra headers
        await page.setExtraHTTPHeaders({
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
        });
        
        console.log('🚀 Starting navigation...');
        
        // Navigate with smart waiting
        const response = await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: 15000
        });
        
        console.log(`📄 Initial status: ${response.status()}`);
        
        // Smart wait for PartsOuq
        let finalUrl = page.url();
        let attempts = 0;
        const maxAttempts = 20; // Increased attempts
        
        while (attempts < maxAttempts && !finalUrl.includes('ssd=')) {
            await page.waitForTimeout(500);
            
            // Check for any navigation
            finalUrl = page.url();
            
            // Check if we got redirected
            if (finalUrl !== url && finalUrl.includes('/catalog/genuine/vehicle')) {
                console.log(`🔄 Redirected to catalog: ${finalUrl.substring(0, 80)}...`);
            }
            
            // Check for Cloudflare
            const title = await page.title();
            if (title.includes('Just a moment')) {
                console.log('☁️ Cloudflare detected, waiting...');
                await page.waitForTimeout(2000); // More wait for Cloudflare
            }
            
            // Check for ssd parameter
            if (finalUrl.includes('ssd=')) {
                console.log('✅ Found ssd parameter!');
                break;
            }
            
            attempts++;
            
            // Log progress
            if (attempts % 5 === 0) {
                console.log(`⏳ Still waiting... attempt ${attempts}/${maxAttempts}`);
            }
        }
        
        // Final wait for content
        if (finalUrl.includes('ssd=')) {
            await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
        }
        
        // Get final state
        const html = await page.content();
        const cookies = await context.cookies();
        const elapsed = Date.now() - startTime;
        
        console.log(`⏱️ Completed in ${elapsed}ms`);
        
        return {
            success: true,
            html: html,
            url: finalUrl,
            cookies: cookies,
            hasSSd: finalUrl.includes('ssd='),
            elapsed: elapsed
        };
        
    } catch (error) {
        console.error('❌ Scraping error:', error.message);
        return {
            success: false,
            error: error.message,
            url: url
        };
        
    } finally {
        if (page) await page.close();
        if (context) await context.close();
    }
}

module.exports = {
    initBrowser,
    fastScrape
};
