const fs = require('fs');
const sharp = require('sharp');
const path = require('path');

const svg = `<svg width="1024" height="1024" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect width="1024" height="1024" rx="224" fill="url(#paint0_linear)"/>
<path fill-rule="evenodd" clip-rule="evenodd" d="M512 200L180 824L299.5 824L512 423.8L724.5 824L844 824L512 200Z" fill="url(#paint1_linear)"/>
<path d="M512 550L430 700H594L512 550Z" fill="white" opacity="0.8"/>
<defs>
<linearGradient id="paint0_linear" x1="0" y1="0" x2="1024" y2="1024" gradientUnits="userSpaceOnUse">
<stop stop-color="#0F172A"/>
<stop offset="1" stop-color="#1E293B"/>
</linearGradient>
<linearGradient id="paint1_linear" x1="512" y1="200" x2="512" y2="824" gradientUnits="userSpaceOnUse">
<stop stop-color="#F59E0B"/>
<stop offset="1" stop-color="#B45309"/>
</linearGradient>
</defs>
</svg>`;

const outputPath = path.join('apps', 'web', 'public', 'images', 'aurelius-icon.png');

sharp(Buffer.from(svg))
  .resize(1024, 1024)
  .png()
  .toFile(outputPath)
  .then(() => console.log('Successfully generated ' + outputPath))
  .catch(err => {
      console.error('Error with sharp:', err);
      process.exit(1);
  });
