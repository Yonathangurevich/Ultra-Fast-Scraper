const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;

// Browser instance pool - הגבלה קבועה!
let browserPool = [];
const MAX_BROWSERS = 1; // ⚡ הורדנו ל-1 לחסוך זיכרון
const MAX_REQUESTS_PER_BROWSER = 50; // נסגור browser אחרי 50 requests

// ✅ Browser launch options מיטובים לזיכרון
const BROWSER_ARGS = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process',
    '--disable-web-security',
    '--disable-gpu',
    '--no-first-run',
    '--window-size=1366,768', // 🔥 הקטנו מ-1920x1080
    // ❌ הסרנו --single-process שאוכל הרבה זיכרון!
    '--disable-accelerated-2d-canvas',
    '--disable-dev-profile',
    '--memory-pressure-off', // ✅ תוספת לניהול זיכרון
    '--max_old_space_size=512', // ✅ הגבלת זיכרון Node.js
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding'
];

// מעקב requests per browser
const browserStats = new Map();

// Initialize browser pool
async function initBrowserPool() {
    console.log('🚀 Initializing optimized browser pool...');
    for (let i = 0; i < MAX_BROWSERS; i++) {
        try {
            const browserObj = await createNewBrowser();
            if (browserObj) {
                browserPool.push(browserObj);
                console.log(`✅ Browser ${i + 1} initialized with memory limits`);
            }
        } catch (error) {
            console.error(`❌ Failed to init browser ${i + 1}:`, error.message);
        }
    }
}

// יצירת browser חדש עם מעקב
async function createNewBrowser() {
    try {
        const browser = await puppeteer.launch({
            headless: 'new',
            args: BROWSER_ARGS,
            ignoreDefaultArgs: ['--enable-automation']
        });
        
        const browserId = Date.now() + Math.random();
        browserStats.set(browserId, { requests: 0, created: Date.now() });
        
        return { 
            browser, 
            busy: false, 
            id: browserId,
            requests: 0 
        };
    } catch (error) {
        console.error('❌ Failed to create browser:', error.message);
        return null;
    }
}

// Get available browser from pool
async function getBrowser() {
    // נסה למצוא browser פנוי
    let browserObj = browserPool.find(b => !b.busy);
    
    if (!browserObj) {
        console.log('⏳ All browsers busy, waiting...');
        // חכה עד שישתחרר browser (לא יוצר חדש!)
        for (let i = 0; i < 100; i++) { // עד 10 שניות
            await new Promise(resolve => setTimeout(resolve, 100));
            browserObj = browserPool.find(b => !b.busy);
            if (browserObj) break;
        }
    }
    
    if (!browserObj) {
        throw new Error('No browsers available - all busy');
    }
    
    // בדוק אם Browser עשה יותר מדי requests
    if (browserObj.requests >= MAX_REQUESTS_PER_BROWSER) {
        console.log(`🔄 Browser ${browserObj.id} reached request limit, recreating...`);
        await recycleBrowser(browserObj);
    }
    
    browserObj.busy = true;
    browserObj.requests++;
    
    return browserObj;
}

// מחזור browser שעשה יותר מדי requests
async function recycleBrowser(browserObj) {
    try {
        // סגור browser ישן
        await browserObj.browser.close();
        browserStats.delete(browserObj.id);
        
        // צור browser חדש
        const newBrowserObj = await createNewBrowser();
        if (newBrowserObj) {
            // החלף במקום הישן
            const index = browserPool.indexOf(browserObj);
            browserPool[index] = newBrowserObj;
            console.log(`✅ Browser recycled successfully`);
        }
    } catch (error) {
        console.error('❌ Error recycling browser:', error.message);
    }
}

// Release browser back to pool
function releaseBrowser(browserObj) {
    if (browserObj) {
        browserObj.busy = false;
        console.log(`📤 Browser ${browserObj.id} released (${browserObj.requests} requests)`);
    }
}

// ✅ פונקציה לניקוי זיכרון כל דקה
async function memoryCleanup() {
    console.log('\n' + '='.repeat(50));
    console.log('🧹 Running memory cleanup...');
    
    const memBefore = process.memoryUsage();
    console.log(`📊 Memory before: ${Math.round(memBefore.heapUsed / 1024 / 1024)}MB`);
    
    // Force garbage collection
    if (global.gc) {
        global.gc();
    }
    
    const memAfter = process.memoryUsage();
    console.log(`📊 Memory after: ${Math.round(memAfter.heapUsed / 1024 / 1024)}MB`);
    console.log(`💾 Saved: ${Math.round((memBefore.heapUsed - memAfter.heapUsed) / 1024 / 1024)}MB`);
    
    // סטטיסטיקות browsers
    console.log(`🌐 Active browsers: ${browserPool.length}`);
    console.log(`⚡ Busy browsers: ${browserPool.filter(b => b.busy).length}`);
    console.log('='.repeat(50) + '\n');
}

// Main scraping function - מיטוב לזיכרון
async function scrapeWithOptimizations(url) {
    const startTime = Date.now();
    let browserObj = null;
    let page = null;
    
    try {
        console.log('🎯 Getting browser from pool...');
        browserObj = await getBrowser();
        
        // Create new page עם הגבלות זיכרון
        page = await browserObj.browser.newPage();
        
        // ✅ הגבלת זיכרון לדף
        await page.setCacheEnabled(false); // חסוך זיכרון
        await page.setViewport({ width: 1366, height: 768 }); // גודל קטן יותר
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // Enhanced stealth measures
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
            
            window.chrome = {
                runtime: {},
                loadTimes: function() {},
                csi: function() {}
            };
            
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5]
            });
            
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
        
        console.log('🚀 Starting navigation to:', url.substring(0, 100) + '...');
        
        // Navigate עם timeout קצר יותר
        await page.goto(url, {
            waitUntil: ['domcontentloaded'], // ✅ רק domcontentloaded, לא networkidle2
            timeout: 20000 // ✅ הקטנו מ-25000
        });
        
        // Check for Cloudflare and wait for redirect - מיטוב
        const title = await page.title();
        console.log(`📄 Initial title: ${title.substring(0, 50)}...`);
        
        if (title.includes('Just a moment') || title.includes('Checking your browser')) {
            console.log('☁️ Cloudflare detected, waiting for bypass...');
            
            // Smart waiting מקוצר
            for (let i = 0; i < 10; i++) { // ✅ הקטנו מ-15 ל-10
                await page.waitForTimeout(1000);
                
                const currentUrl = page.url();
                const currentTitle = await page.title();
                
                console.log(`⏳ Attempt ${i + 1}/10 - Checking...`);
                
                if (currentUrl.includes('ssd=') || !currentTitle.includes('Just a moment')) {
                    console.log('✅ Passed Cloudflare check');
                    break;
                }
            }
        }
        
        // Final wait קצר יותר
        await page.waitForTimeout(500); // ✅ הקטנו מ-1000
        
        // Get final results
        const finalUrl = page.url();
        const html = await page.content();
        const cookies = await page.cookies();
        const elapsed = Date.now() - startTime;
        
        console.log(`✅ Completed in ${elapsed}ms - Has ssd: ${finalUrl.includes('ssd=') ? 'YES' : 'NO'}`);
        
        return {
            success: true,
            html: html,
            url: finalUrl,
            cookies: cookies,
            hasSSd: finalUrl.includes('ssd='),
            elapsed: elapsed
        };
        
    } catch (error) {
        console.error('❌ Error during scraping:', error.message);
        return {
            success: false,
            error: error.message,
            url: url
        };
        
    } finally {
        // ✅ ניקוי יסודי
        if (page) {
            await page.close().catch(() => {});
            page = null; // Clear reference
        }
        if (browserObj) {
            releaseBrowser(browserObj);
        }
    }
}

// Main endpoint
app.post('/v1', async (req, res) => {
    const startTime = Date.now();
    
    try {
        const { cmd, url, maxTimeout = 25000, session } = req.body; // ✅ הקטנו timeout
        
        if (!url) {
            return res.status(400).json({
                status: 'error',
                message: 'URL is required'
            });
        }
        
        console.log(`\n📨 Request: ${url.substring(0, 80)}... (${maxTimeout}ms timeout)`);
        
        // Run scraping with timeout
        const result = await Promise.race([
            scrapeWithOptimizations(url),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout')), maxTimeout)
            )
        ]);
        
        if (result.success) {
            const elapsed = Date.now() - startTime;
            console.log(`✅ SUCCESS - ${elapsed}ms - ${result.html?.length || 0} bytes`);
            
            res.json({
                status: 'ok',
                message: 'Success',
                solution: {
                    url: result.url || url,
                    status: 200,
                    response: result.html,
                    cookies: result.cookies || [],
                    userAgent: 'Mozilla/5.0'
                },
                startTimestamp: startTime,
                endTimestamp: Date.now(),
                version: '4.1.0-memory-optimized',
                hasSSd: result.hasSSd || false
            });
        } else {
            throw new Error(result.error || 'Unknown error');
        }
        
    } catch (error) {
        console.error(`❌ REQUEST FAILED:`, error.message);
        
        res.status(500).json({
            status: 'error',
            message: error.message,
            solution: null
        });
    }
});

// Enhanced health check
app.get('/health', async (req, res) => {
    const memory = process.memoryUsage();
    
    res.json({
        status: 'healthy',
        uptime: Math.round(process.uptime()) + 's',
        browsers: browserPool.length,
        activeBrowsers: browserPool.filter(b => b.busy).length,
        memory: {
            used: Math.round(memory.heapUsed / 1024 / 1024) + 'MB',
            total: Math.round(memory.heapTotal / 1024 / 1024) + 'MB',
            external: Math.round(memory.external / 1024 / 1024) + 'MB'
        },
        browserStats: Array.from(browserStats.entries()).map(([id, stats]) => ({
            id: id.toString().substring(-8),
            requests: stats.requests,
            age: Math.round((Date.now() - stats.created) / 1000) + 's'
        }))
    });
});

// Root
app.get('/', (req, res) => {
    const memory = process.memoryUsage();
    res.send(`
        <h1>⚡ Memory-Optimized Puppeteer v4.1</h1>
        <p><strong>Status:</strong> Running</p>
        <p><strong>Memory:</strong> ${Math.round(memory.heapUsed / 1024 / 1024)}MB used</p>
        <p><strong>Browsers:</strong> ${browserPool.length} (${browserPool.filter(b => b.busy).length} busy)</p>
        <p><strong>Optimizations:</strong> ✅ Memory limits, ✅ Browser recycling, ✅ Auto cleanup</p>
    `);
});

// Start server
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`
╔════════════════════════════════════════╗
║   ⚡ Memory-Optimized Scraper v4.1     ║
║   Port: ${PORT}                            ║
║   Max Browsers: ${MAX_BROWSERS}                     ║
║   Memory Limits: ENABLED ✅            ║
╚════════════════════════════════════════╝
    `);
    
    console.log('🚀 Initializing optimized browser pool...');
    await initBrowserPool();
    
    // ✅ הפעלת ניקוי זיכרון כל דקה
    setInterval(memoryCleanup, 60000);
    console.log('✅ Ready with memory management!');
});

// Graceful shutdown עם ניקוי יסודי
process.on('SIGTERM', async () => {
    console.log('📛 SIGTERM received, cleaning up...');
    for (const browserObj of browserPool) {
        await browserObj.browser.close().catch(() => {});
    }
    browserPool = [];
    browserStats.clear();
    process.exit(0);
});

// Handle errors
process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error.message);
    // נסה לנקות זיכרון
    if (global.gc) global.gc();
});

process.on('unhandledRejection', (error) => {
    console.error('💥 Unhandled Rejection:', error.message);
});
