import fs from 'fs';

const README_PATH = 'README.md';

function getISTTime() {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        hour: 'numeric',
        minute: 'numeric',
        hour12: false
    });
    const parts = formatter.formatToParts(now);
    const hour = parseInt(parts.find(p => p.type === 'hour').value);
    const minute = parseInt(parts.find(p => p.type === 'minute').value);
    return { hour, minute };
}

function getGifForTime(hour, minute) {
    const totalMinutes = hour * 60 + minute;
    
    // 9 am to 11:30 am (09:00 - 11:30)
    if (totalMinutes >= 9 * 60 && totalMinutes <= 11 * 60 + 30) {
        return 'morning.gif';
    }
    // 11:31 am to 4 pm (11:31 - 16:00)
    if (totalMinutes > 11 * 60 + 30 && totalMinutes <= 16 * 60) {
        return 'hello.gif';
    }
    // 4 pm to 9 pm (16:01 - 21:00)
    if (totalMinutes > 16 * 60 && totalMinutes <= 21 * 60) {
        return 'evening.gif';
    }
    // 9 pm to 3 am (21:01 - 03:00)
    if (totalMinutes > 21 * 60 || totalMinutes <= 3 * 60) {
        return 'night.gif';
    }
    // 3 am to 9 am (03:01 - 08:59)
    return 'sleep.gif';
}

function updateReadme() {
    const { hour, minute } = getISTTime();
    const gif = getGifForTime(hour, minute);
    console.log(`Current IST Time: ${hour}:${minute.toString().padStart(2, '0')}. Selected GIF: ${gif}`);

    let content = fs.readFileSync(README_PATH, 'utf8');
    const startMarker = '<!-- DYNAMIC_GIF_START -->';
    const endMarker = '<!-- DYNAMIC_GIF_END -->';
    
    const startIndex = content.indexOf(startMarker);
    const endIndex = content.indexOf(endMarker);
    
    if (startIndex === -1 || endIndex === -1) {
        console.error('Markers not found in README.md');
        process.exit(1);
    }
    
    const gifUrl = `https://raw.githubusercontent.com/Arun-kushwaha007/Arun-Kushwaha007/main/assets/${gif}`;
    const newGifTag = `\n      <img src="${gifUrl}" width="100%" alt="Dynamic GIF" id="dynamic-gif" />\n      `;
    
    const newContent = content.substring(0, startIndex + startMarker.length) + 
                       newGifTag + 
                       content.substring(endIndex);
    
    fs.writeFileSync(README_PATH, newContent);
    console.log('README.md updated successfully!');
}

updateReadme();
