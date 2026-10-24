import fs from 'fs';

const README_PATH = 'README.md';

function getISTTimeAndDay() {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        hour: 'numeric',
        minute: 'numeric',
        day: 'numeric',
        weekday: 'long',
        hour12: false
    });
    const parts = formatter.formatToParts(now);
    const hour = parseInt(parts.find(p => p.type === 'hour').value);
    const minute = parseInt(parts.find(p => p.type === 'minute').value);
    const dayOfWeek = parts.find(p => p.type === 'weekday').value;
    const dayOfMonth = parseInt(parts.find(p => p.type === 'day').value);
    return { hour, minute, dayOfWeek, dayOfMonth };
}

// Original time-of-day GIF logic for top header
function getOriginalGifForTime(hour, minute) {
    const totalMinutes = hour * 60 + minute;
    
    if (totalMinutes >= 9 * 60 && totalMinutes <= 11 * 60 + 30) {
        return 'morning.gif';
    }
    if (totalMinutes > 11 * 60 + 30 && totalMinutes <= 16 * 60) {
        return 'hello.gif';
    }
    if (totalMinutes > 16 * 60 && totalMinutes <= 21 * 60) {
        return 'evening.gif';
    }
    if (totalMinutes > 21 * 60 || totalMinutes <= 3 * 60) {
        return 'night.gif';
    }
    return 'sleep.gif';
}

// Full rotation across all 14 cute GIFs
function getCuteGifForTime(hour, minute, dayOfWeek, dayOfMonth) {
    // Special Friday GIF
    if (dayOfWeek === 'Friday' && hour >= 12) {
        return 'cute/its-friday-baby.gif';
    }

    const totalMinutes = hour * 60 + minute;
    
    // Morning Rush & Coffee Pool (9:00 AM - 11:30 AM)
    if (totalMinutes >= 9 * 60 && totalMinutes <= 11 * 60 + 30) {
        const morningPool = [
            'cute/cute-gir-running-on-coffee.gif',
            'cute/cute-gif-rusing-for-office.gif'
        ];
        return morningPool[dayOfMonth % morningPool.length];
    }

    // Work, Tech & Coding Pool (11:31 AM - 5:00 PM)
    if (totalMinutes > 11 * 60 + 30 && totalMinutes <= 17 * 60) {
        const workPool = [
            'cute/funny-cat-working-on-laptop.gif',
            'cute/gif-i-avoid-reading-documentation-and-gets-stuck.gif',
            'cute/building-barcode-gif.gif',
            'cute/system-rooting-command-creepy-gif.gif'
        ];
        return workPool[dayOfMonth % workPool.length];
    }

    // Evening & Jamming Pool (5:01 PM - 9:00 PM)
    if (totalMinutes > 17 * 60 && totalMinutes <= 21 * 60) {
        const eveningPool = [
            'cute/cute-cat-jamming-gif.gif',
            'cute/three-cool-cats.gif',
            'cute/cute-parrot-shaking-head-gif.gif'
        ];
        return eveningPool[dayOfMonth % eveningPool.length];
    }

    // Night & Late-Night Debugging Pool (9:01 PM - 8:59 AM)
    const nightPool = [
        'cute/chill-life-banner.gif',
        'cute/gif-smashing-head-on-laptop.gif',
        'cute/punching-hand-through-laptop-gif.gif'
    ];
    return nightPool[dayOfMonth % nightPool.length];
}

function updateReadme() {
    const { hour, minute, dayOfWeek, dayOfMonth } = getISTTimeAndDay();
    const originalGif = getOriginalGifForTime(hour, minute);
    const cuteGif = getCuteGifForTime(hour, minute, dayOfWeek, dayOfMonth);
    
    console.log(`Current IST: ${dayOfWeek} (Day ${dayOfMonth}) ${hour}:${minute.toString().padStart(2, '0')}. Header GIF: ${originalGif}, Cute GIF: ${cuteGif}`);

    let content = fs.readFileSync(README_PATH, 'utf8');

    // 1. Update Header Original Dynamic GIF
    const start1 = '<!-- DYNAMIC_GIF_START -->';
    const end1 = '<!-- DYNAMIC_GIF_END -->';
    const idxStart1 = content.indexOf(start1);
    const idxEnd1 = content.indexOf(end1);
    if (idxStart1 !== -1 && idxEnd1 !== -1) {
        const gifUrl = `https://raw.githubusercontent.com/Arun-kushwaha007/Arun-Kushwaha007/main/assets/${originalGif}`;
        const newTag = `\n      <img src="${gifUrl}" width="100%" alt="Dynamic GIF" id="dynamic-gif" />\n      `;
        content = content.substring(0, idxStart1 + start1.length) + newTag + content.substring(idxEnd1);
    }

    // 2. Update Cute Dynamic GIF Section
    const start2 = '<!-- DYNAMIC_CUTE_GIF_START -->';
    const end2 = '<!-- DYNAMIC_CUTE_GIF_END -->';
    const idxStart2 = content.indexOf(start2);
    const idxEnd2 = content.indexOf(end2);
    if (idxStart2 !== -1 && idxEnd2 !== -1) {
        const cuteUrl = `https://raw.githubusercontent.com/Arun-kushwaha007/Arun-Kushwaha007/main/assets/${cuteGif}`;
        const newCuteTag = `\n  <img src="${cuteUrl}" width="160" alt="Dynamic Mood GIF" />\n  `;
        content = content.substring(0, idxStart2 + start2.length) + newCuteTag + content.substring(idxEnd2);
    }
    
    fs.writeFileSync(README_PATH, content);
    console.log('README.md updated successfully!');
}

updateReadme();



