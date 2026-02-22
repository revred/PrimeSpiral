const fs = require('fs');
const content = fs.readFileSync('artefacts/_framework/dotnet.js', 'utf8');
const startMatch = content.match(/\/\*json-start\*\//);
const endMatch = content.match(/\/\*json-end\*\//);
if (startMatch && endMatch) {
    const startIdx = startMatch.index + '/*json-start*/'.length;
    const endIdx = endMatch.index;
    const jsonStr = content.slice(startIdx, endIdx);
    fs.writeFileSync('artefacts/_framework/blazor.boot.json', jsonStr);
    console.log('Extracted blazor.boot.json');
} else {
    console.error('Could not find start or end of JSON');
}
