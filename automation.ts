import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';

const CONFIG_FILE = path.join(process.cwd(), 'config.json');
const SYSTEM_CONFIG_FILE = path.join(process.cwd(), 'system_config.json');

let systemConfig = {
  senderEmail: "",
  senderPass: ""
};

if (fs.existsSync(SYSTEM_CONFIG_FILE)) {
  try {
    const loaded = JSON.parse(fs.readFileSync(SYSTEM_CONFIG_FILE, 'utf-8'));
    systemConfig = { ...systemConfig, ...loaded };
    // Trim credentials to prevent trailing space issues
    systemConfig.senderEmail = systemConfig.senderEmail.trim();
    systemConfig.senderPass = systemConfig.senderPass.trim();
  } catch (e) {
    console.error("Failed to load system config in automation:", e);
  }
}

const TERMS = {
  SPRING: "2261",
  SUMMER: "2266",
  FALL: "2268",
};

const TERM_NAMES: Record<string, string> = {
  [TERMS.SPRING]: "Spring 2026",
  [TERMS.SUMMER]: "Summer 2026",
  [TERMS.FALL]: "Fall 2026",
};

const TERM_INDEX: Record<string, number> = {
  [TERMS.SPRING]: 0,
  [TERMS.SUMMER]: 1,
  [TERMS.FALL]: 2,
};

// Alert state to prevent spamming
const alerted = new Set<string>();
const lastSeatCounts = new Map<string, number>();
const lastWaitlistCounts = new Map<string, number>();

async function broadcastScreenshot(page: any) {
  try {
    const screenshot = await page.screenshot({ type: 'jpeg', quality: 60 });
    const base64 = screenshot.toString('base64');
    console.log(`SCREENSHOT:data:image/jpeg;base64,${base64}`);
  } catch (e) {
    console.log(`Failed to take screenshot: ${e.message}`);
  }
}

async function sendEmail(subject: string, body: string, config: any) {
  console.log(`[DEBUG] Attempting to send email to: ${config.email} | Subject: ${subject}`);
  if (!config.email) {
    console.log(`[DEBUG] Email skipped: No recipient email in config.`);
    return;
  }

  const fromEmail = (systemConfig.senderEmail || process.env.SENDER_EMAIL || "").trim();
  const fromPass = (systemConfig.senderPass || process.env.SENDER_PASSWORD || "").trim();

  // Use environment variables for sender credentials
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: fromEmail,
      pass: fromPass
    }
  });

  if (fromEmail && fromPass) {
    try {
      await transporter.sendMail({
        from: fromEmail,
        to: config.email,
        subject: subject,
        text: body
      });
      console.log(`  ✅ Email sent: ${subject}`);
    } catch (err) {
      console.error(`  ❌ Email failed: ${subject}`);
      console.error(err); // Log full error object for debugging
    }
  } else {
    console.log(`  ⚠️  Email skipped: Sender credentials missing.`);
  }
}

function formatSection(sec: any) {
  let lines = [`  Class #${sec.classNum}`];
  lines.push(`    Seats:      ${sec.seats}`);
  if (sec.waitlist !== null) lines.push(`    Waitlist:   ${sec.waitlist}`);
  if (sec.instructor) lines.push(`    Instructor: ${sec.instructor}`);
  if (sec.meeting) lines.push(`    Meeting:    ${sec.meeting}`);
  return lines.join('\n');
}

async function sendSummary(results: any[], config: any) {
  let lines = ["UF Seat Checker is running!\n", "Current snapshot:\n"];
  for (const r of results) {
    if (r.error) {
      lines.push(`  ${r.name}: ⚠️ could not load`);
      continue;
    }
    if (r.sections.length === 0) {
      lines.push(`  ${r.name}: no data found`);
      continue;
    }
    for (const sec of r.sections) {
      const wlStr = sec.waitlist !== null ? ` | waitlist: ${sec.waitlist}` : "";
      const meetStr = sec.meeting ? ` | ${sec.meeting}` : "";
      lines.push(`  ${r.name} (#${sec.classNum}): ${sec.seats} seat(s)${wlStr}${meetStr}`);
    }
  }

  lines.push("\nYou'll be emailed once when:");
  lines.push("  • Any seat opens");
  lines.push("  • A waitlist appears");
  lines.push("  • A waitlist drops under 10");
  
  await sendEmail("UF Seat Checker Started ✅", lines.join('\n'), config);
}

async function run() {
  let config;
  if (process.env.CONFIG_JSON) {
    try {
      config = JSON.parse(process.env.CONFIG_JSON);
    } catch (e) {
      console.error('Failed to parse CONFIG_JSON env var:', e);
    }
  }

  if (!config) {
    if (!fs.existsSync(CONFIG_FILE)) {
      console.log('Config file not found. Please set up in the dashboard.');
      return;
    }
    config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
  }

  const { username, password, courses } = config;

  if (!username || !password) {
    console.log('ERROR: Student login credentials not set. Please go to Settings to configure your credentials.');
    return;
  }

  if (!courses || courses.length === 0) {
    console.log('ERROR: No courses selected for monitoring. Please add at least one course in the Dashboard.');
    return;
  }

  console.log(`[${new Date().toLocaleTimeString()}] Starting SwampSeatCheck...`);
  console.log(`PROGRESS:${JSON.stringify({ current: 0, total: courses.length, course: 'Initializing', status: 'starting' })}`);
  
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('Navigating to ONE.UF...');
    await page.goto('https://one.uf.edu/');
    await broadcastScreenshot(page);

    // Click Login
    console.log('Clicking GatorLink login...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const loginBtn = btns.find(b => b.innerText.includes('GatorLink'));
      if (loginBtn) (loginBtn as HTMLElement).click();
    });
    await page.waitForTimeout(2000);
    await broadcastScreenshot(page);

    // Wait for login page
    await page.waitForSelector('#username', { timeout: 30000 });
    await broadcastScreenshot(page);
    console.log('Entering credentials...');
    await page.fill('#username', username);
    await page.fill('#password', password);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
    await broadcastScreenshot(page);

    console.log('DUO_START');
    console.log('Waiting for DUO push approval on your phone (60s timeout)...');
    await broadcastScreenshot(page);
    try {
      // Periodically take screenshots while waiting for DUO
      const duoWait = page.waitForURL(url => {
        const isOneUf = url.origin === 'https://one.uf.edu';
        const isNotLogin = !url.pathname.includes('login');
        const isNotAuth = !url.hostname.includes('auth.ufl.edu');
        return isOneUf && isNotLogin && isNotAuth;
      }, { timeout: 60000 });
      
      const screenshotInterval = setInterval(async () => {
        try {
          if (page.isClosed()) return;
          await broadcastScreenshot(page);
          
          // Check for "Is this your device?" prompt during the wait
          const isDevicePrompt = await page.evaluate(() => {
            return document.body.innerText.toLowerCase().includes('is this your device');
          }).catch(() => false);

          if (isDevicePrompt) {
            console.log('Detected "Is this your device?" prompt. Clicking "Yes"...');
            await page.evaluate(() => {
              const btns = Array.from(document.querySelectorAll('button, a'));
              const yesBtn = btns.find(b => (b as HTMLElement).innerText.includes('Yes, this is my device'));
              if (yesBtn) (yesBtn as HTMLElement).click();
            }).catch(e => console.log(`Failed to click "Yes": ${e.message}`));
          }

          // Try to extract the 3-digit DUO code
          const duoCode = await page.evaluate(() => {
            // DUO Verified Push usually shows the code in a large font
            const codeElement = document.querySelector('.verification-code, .code-display, [data-testid="verification-code"]');
            if (codeElement) return (codeElement as HTMLElement).innerText.trim();
            
            // Fallback: search for a standalone 3-digit number in the text
            const match = document.body.innerText.match(/\b\d{3}\b/);
            return match ? match[0] : null;
          }).catch(() => null);

          if (duoCode) {
            console.log(`DUO_CODE:${duoCode}`);
          }
        } catch (e) {
          // Ignore errors in interval
        }
      }, 5000);

      await duoWait;
      clearInterval(screenshotInterval);
      
      console.log('DUO_SUCCESS');
      console.log('Login successful!');
      await broadcastScreenshot(page);
    } catch (e) {
      console.log('DUO_TIMEOUT');
      console.log(`Timeout or error waiting for DUO approval: ${e.message}`);
      await broadcastScreenshot(page);
      await browser.close();
      return;
    }

    // Monitoring loop
    let isFirstRun = true;
    while (true) {
      console.log(`\n[${new Date().toLocaleTimeString()}] Checking all courses...`);
      const results: any[] = [];
      
      for (let i = 0; i < courses.length; i++) {
        const course = courses[i];
        // Support both string (legacy) and object course formats
        const courseCode = typeof course === 'string' ? course : course.code;
        const term = typeof course === 'string' ? TERMS.FALL : (course.term || TERMS.FALL);
        const checkWaitlist = typeof course === 'string' ? false : !!course.checkWaitlist;

        console.log(`PROGRESS:${JSON.stringify({ current: i + 1, total: courses.length, course: courseCode, status: 'checking' })}`);
        try {
          console.log(`Checking ${courseCode} for ${TERM_NAMES[term]}...`);
          
          // 1. Go to My Schedule
          await page.goto('https://one.uf.edu/myschedule/');
          await page.waitForLoadState('networkidle');
          await broadcastScreenshot(page);

          // 2. Click VIEW SCHEDULE for the correct term
          const btnIdx = TERM_INDEX[term] || 0;
          await page.evaluate((idx) => {
            const btns = Array.from(document.querySelectorAll('button'));
            const schedBtns = btns.filter(b => b.innerText.trim() === 'VIEW SCHEDULE');
            if (schedBtns[idx]) (schedBtns[idx] as HTMLElement).click();
          }, btnIdx);
          await page.waitForLoadState('networkidle');

          // 3. Click "+ Add Course"
          await page.click('a[aria-label="Add course"]');
          
          // 4. Type course code
          await page.waitForSelector('#course-number');
          await page.fill('#course-number', courseCode);
          await page.keyboard.press('Enter');
          
          // 5. Wait for results (using a delay as the page is dynamic)
          await page.waitForTimeout(5000);
          await broadcastScreenshot(page);
          
          // 6. Parse sections
          const sections = await page.evaluate(() => {
            const chips = Array.from(document.querySelectorAll('span')).filter(s => s.innerText.startsWith('Seats:'));
            return chips.map(chip => {
              const seatsText = chip.innerText.replace('Seats:', '').trim();
              const seats = parseInt(seatsText) || 0;
              
              // Find the parent card div that contains "Class #"
              let card = chip.parentElement;
              while (card && !card.innerText.includes('Class #')) {
                card = card.parentElement;
              }
              const cardText = card?.innerText || '';
              if (!cardText) console.log(`[DEBUG] No card text found for chip with text: ${chip.innerText}`);
              
              const classMatch = cardText.match(/Class #\s*(\d+)/);
              const classNum = classMatch ? classMatch[1] : 'Unknown';
              
              const wlMatch = cardText.match(/Waitlist[:\s]+(\d+)/i);
              const waitlist = wlMatch ? parseInt(wlMatch[1]) : null;

              // Improved Instructor Parsing: look for "Instructor:" or common name patterns
              let instructor = 'Unknown';
              const instructorIndex = cardText.indexOf('Instructor:');
              if (instructorIndex !== -1) {
                const afterInstructor = cardText.substring(instructorIndex + 11).trim();
                const nextFieldMatch = afterInstructor.match(/^(.*?)(?:\n|\||Credits:|Seats:|Period:|Class #|$)/s);
                if (nextFieldMatch) {
                  instructor = nextFieldMatch[1].trim();
                }
              } else {
                // Fallback: Look for capitalized names near the top of the card (e.g., "Gator, Albert")
                const nameMatch = cardText.match(/([A-Z][a-z]+,\s*[A-Z][a-z]+)/);
                if (nameMatch) instructor = nameMatch[1];
              }

              // Improved Meeting Parsing: look for days (MTWRF) and Period or Time
              // We'll try to find all meeting patterns in the card
              let meetings: string[] = [];
              const meetRegex = /([MTWRFS,\s]{1,15})\s*\|?\s*[\n\r\s]*((?:Period\s*\d+[A-Z]?(?:\s*[-–]\s*\d+[A-Z]?)?)|(?:\d{1,2}:\d{2}\s*[AP]M\s*[-–]\s*\d{1,2}:\d{2}\s*[AP]M))/gis;
              let m;
              while ((m = meetRegex.exec(cardText)) !== null) {
                meetings.push(`${m[1].trim()} ${m[2].trim()}`.replace(/\s+/g, ' '));
              }

              if (meetings.length === 0) {
                // Fallback: just look for Period or Time
                const fallbackRegex = /((?:Period\s*\d+[A-Z]?(?:\s*[-–]\s*\d+[A-Z]?)?)|(?:\d{1,2}:\d{2}\s*[AP]M\s*[-–]\s*\d{1,2}:\d{2}\s*[AP]M))/gis;
                while ((m = fallbackRegex.exec(cardText)) !== null) {
                  meetings.push(m[1].trim());
                }
              }
              
              const meeting = meetings.length > 0 ? meetings.join('; ') : 'Unknown';

              if (instructor === 'Unknown' || meeting === 'Unknown') {
                console.log(`[DEBUG] Parsing partial fail for Class #${classNum}. Instructor: ${instructor}, Meeting: ${meeting}`);
                console.log(`[DEBUG] Card Text was: ${cardText.substring(0, 100)}...`);
              }

              return { classNum, seats, waitlist, instructor, meeting };
            });
          });

          results.push({ name: courseCode, sections, error: false });
          console.log(`COURSE_RESULTS:${JSON.stringify({ name: courseCode, sections, timestamp: new Date().toISOString() })}`);

          if (sections.length === 0) {
            console.log(`  No sections found for ${courseCode}.`);
            continue;
          }

          const openSections: any[] = [];
          const waitlistSections: any[] = [];
          const wlUnderSections: any[] = [];

          for (const sec of sections) {
            console.log(`  Class #${sec.classNum}: Seats=${sec.seats}, Waitlist=${sec.waitlist}, Instructor=${sec.instructor}`);
            
            const alertKey = `${courseCode}-${sec.classNum}`;
            
            // Seat Open Alert
            const prevSeats = lastSeatCounts.get(alertKey) ?? 0;
            
            // Alert if seats increased and are now > 0
            // This handles "seats found that were not there before" (0 -> 10)
            // and also "more seats found" (5 -> 10)
            if (sec.seats > 0 && sec.seats > prevSeats) {
              console.log(`  *** ALERT: ${sec.seats} seat(s) found for ${courseCode} (Class #${sec.classNum})! (Previously: ${prevSeats}) ***`);
              openSections.push(sec);
            }
            
            // Update last seen count
            lastSeatCounts.set(alertKey, sec.seats);

            // Waitlist Alert
            if (checkWaitlist && sec.waitlist !== null) {
              const wlNewKey = `${alertKey}-wl-new`;
              const wlUnderKey = `${alertKey}-wl-under10`;
              const prevWl = lastWaitlistCounts.get(alertKey);

              // Alert if waitlist appeared for the first time
              if (!alerted.has(wlNewKey)) {
                alerted.add(wlNewKey);
                waitlistSections.push(sec);
              }

              // Alert if waitlist dropped under 10
              if (sec.waitlist < 10 && !alerted.has(wlUnderKey)) {
                console.log(`  *** ALERT: Low waitlist for ${courseCode} (Class #${sec.classNum})! (${sec.waitlist} spots) ***`);
                wlUnderSections.push(sec);
                alerted.add(wlUnderKey);
              } else if (sec.waitlist >= 10) {
                alerted.delete(wlUnderKey);
              }
              
              lastWaitlistCounts.set(alertKey, sec.waitlist);
            }
          }

          // Send emails per course if alerts triggered
          if (openSections.length > 0) {
            let body = `${courseCode} has ${openSections.length} section(s) with open seats!\n\n`;
            openSections.forEach(s => body += formatSection(s) + '\n\n');
            body += `Register now at: https://one.uf.edu/myschedule/`;
            await sendEmail(`🚨 ${courseCode} SEAT OPEN`, body, config);
          }

          if (waitlistSections.length > 0 && !isFirstRun) {
            let body = `${courseCode} waitlist(s) have appeared:\n\n`;
            waitlistSections.forEach(s => body += formatSection(s) + '\n\n');
            body += `Check it out at: https://one.uf.edu/myschedule/`;
            await sendEmail(`📋 ${courseCode} Waitlist Appeared`, body, config);
          }

          if (wlUnderSections.length > 0) {
            let body = `${courseCode} has section(s) with waitlist under 10:\n\n`;
            wlUnderSections.forEach(s => body += formatSection(s) + '\n\n');
            body += `Check it out at: https://one.uf.edu/myschedule/`;
            await sendEmail(`📋 ${courseCode} Waitlist Under 10`, body, config);
          }

        } catch (err) {
          console.log(`  Error checking ${courseCode}: ${err.message}`);
          results.push({ name: courseCode, sections: [], error: true });
        }
      }

      if (isFirstRun) {
        await sendSummary(results, config);
        isFirstRun = false;
      }

      const nextCheckTime = Date.now() + 5 * 60 * 1000;
      console.log('\nWaiting 5 minutes for next check...');
      console.log(`PROGRESS:${JSON.stringify({ current: courses.length, total: courses.length, course: 'Waiting', status: 'waiting', nextCheck: nextCheckTime })}`);
      await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));
    }

  } catch (error) {
    console.error('An error occurred:', error);
  } finally {
    await browser.close();
  }
}

run();
